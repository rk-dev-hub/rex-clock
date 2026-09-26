import type { Prisma, WorkRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc, jstWeekday } from "@/lib/datetime";
import { resolveDayType } from "@/features/calendar/domain/day-type";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { weekDatesOf } from "@/features/aggregation/domain/week";
import {
  applyWeeklyOvertime,
  type WeekDay,
} from "@/features/aggregation/domain/weekly-overtime";
import {
  buildDailySummary,
  type DailyClockEvent,
  type DayContext,
  type DailySummaryResult,
  type WorkRuleSnapshot,
} from "@/features/attendance/domain/daily-summary";

type Db = Prisma.TransactionClient | typeof prisma;

export async function getDefaultWorkRule(db: Db = prisma): Promise<WorkRule> {
  const rule =
    (await db.workRule.findFirst({ where: { isDefault: true } })) ??
    (await db.workRule.findFirst());
  if (!rule) {
    throw new Error("WorkRule が未設定です。seed または初期設定が必要です。");
  }
  return rule;
}

function ruleSnapshot(rule: WorkRule): WorkRuleSnapshot {
  return {
    nightStart: rule.nightStart,
    nightEnd: rule.nightEnd,
    breakPolicy: rule.breakPolicy,
    autoBreakRules: rule.autoBreakRules as WorkRuleSnapshot["autoBreakRules"],
  };
}

/**
 * 対象日を含む「週」の DailySummary を、打刻・休暇・マスタから再構築する。
 * 週 40h の壁（docs/04 §3）を適用して各日へ反映し、対応する MonthlyAggregate を stale 化する。
 * 打刻/申請の反映は必ずこの関数を通す（週内の他日への波及があるため）。
 */
export async function recomputeWeek(
  userId: string,
  dateStr: string,
  db: Db = prisma,
): Promise<void> {
  const rule = await getDefaultWorkRule(db);
  const dates = weekDatesOf(dateStr, rule.weekStartsOn);
  const weekStart = dateOnlyUtc(dates[0]);
  const weekEnd = dateOnlyUtc(dates[6]);

  const [user, events, holidays, leaves, overrides, existing] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        include: { workPattern: { include: { days: true } } },
      }),
      db.timeClockEvent.findMany({
        where: {
          userId,
          canceled: false,
          businessDate: { gte: weekStart, lte: weekEnd },
        },
        orderBy: { occurredAt: "asc" },
      }),
      db.holiday.findMany({
        where: { date: { gte: weekStart, lte: weekEnd } },
        select: { date: true },
      }),
      db.leaveRequest.findMany({
        where: {
          userId,
          kind: "TAKE",
          status: "APPROVED",
          startDate: { lte: weekEnd },
          endDate: { gte: weekStart },
        },
      }),
      db.calendarDay.findMany({
        where: { workRuleId: rule.id, date: { gte: weekStart, lte: weekEnd } },
      }),
      db.dailySummary.findMany({
        where: { userId, workDate: { gte: weekStart, lte: weekEnd } },
        select: { workDate: true },
      }),
    ]);

  const holidaySet = new Set(holidays.map((h) => dateOnlyStr(h.date)));
  const overrideByDate = new Map(
    overrides.map((o) => [dateOnlyStr(o.date), o]),
  );
  const eventsByDate = new Map<string, typeof events>();
  for (const e of events) {
    const k = dateOnlyStr(e.businessDate);
    const arr = eventsByDate.get(k) ?? [];
    arr.push(e);
    eventsByDate.set(k, arr);
  }
  const existingDates = new Set(existing.map((r) => dateOnlyStr(r.workDate)));

  const snapshot = ruleSnapshot(rule);

  // --- 日次サマリ（週次未適用） ---
  const perDay = dates.map((d) => {
    const weekday = jstWeekday(d);
    const ov = overrideByDate.get(d);
    const { dayType } = resolveDayType({
      weekday,
      legalHolidayWeekday: rule.legalHolidayWeekday,
      prescribedHolidayWeekdays: rule.prescribedHolidayWeekdays,
      isHolidayDate: holidaySet.has(d),
      override: ov ? { dayType: ov.dayType, isHoliday: ov.isHoliday } : null,
    });

    const leave = leaves.find(
      (l) => dateOnlyStr(l.startDate) <= d && d <= dateOnlyStr(l.endDate),
    );
    const patternDay = user.workPattern.days.find((x) => x.weekday === weekday);
    const isWorkday = dayType === "WORKDAY" && (patternDay?.isWorkday ?? false);

    const ctx: DayContext = {
      workDate: d,
      dayType,
      prescribedMinutes: isWorkday ? (patternDay?.prescribedMinutes ?? 0) : 0,
      scheduledStart: isWorkday ? patternDay?.startTime : undefined,
      scheduledEnd: isWorkday ? patternDay?.endTime : undefined,
      scheduledBreakMinutes: patternDay?.breakMinutes ?? 0,
      leave: leave ? { type: leave.type, part: leave.dayPart } : undefined,
    };

    const domainEvents: DailyClockEvent[] = (eventsByDate.get(d) ?? []).map(
      (e) => ({ type: e.type, at: e.occurredAt }),
    );
    const r = buildDailySummary(domainEvents, ctx, snapshot);
    return { date: d, dayType, leave, result: r };
  });

  // --- 週 40h の壁 ---
  const weekInput: WeekDay[] = perDay.map(({ date, dayType, result }) => ({
    dateStr: date,
    dayType,
    withinPrescribedMinutes: result.withinPrescribedMinutes,
    withinStatutoryOtMinutes: result.withinStatutoryOtMinutes,
    // buildDailySummary の overStatutoryOtMinutes は日次確定分（週次未適用）。
    dailyOverStatutoryOtMinutes: result.overStatutoryOtMinutes,
  }));
  const adjustedByDate = new Map(
    applyWeeklyOvertime(weekInput).map((a) => [a.dateStr, a]),
  );

  // --- 締め期間の紐付け（週がまたぐ場合に備え個別に） ---
  const periodStartByDate = new Map(
    dates.map((d) => [d, periodRangeFor(d, rule.closingDay).startStr]),
  );
  const periods = await db.closingPeriod.findMany({
    where: {
      periodStart: {
        in: [...new Set(periodStartByDate.values())].map(dateOnlyUtc),
      },
    },
  });
  const periodByStart = new Map(
    periods.map((p) => [dateOnlyStr(p.periodStart), p]),
  );

  // --- 永続化 ---
  for (const { date, dayType, leave, result } of perDay) {
    const hasData =
      (eventsByDate.get(date)?.length ?? 0) > 0 ||
      Boolean(leave) ||
      existingDates.has(date);
    if (!hasData) continue;

    const adj = adjustedByDate.get(date)!;
    const period = periodByStart.get(periodStartByDate.get(date)!);
    const workDate = dateOnlyUtc(date);

    const data = {
      dayType,
      firstIn: result.firstIn,
      lastOut: result.lastOut,
      breakMinutes: result.breakMinutes,
      workedMinutes: result.workedMinutes,
      prescribedMinutes: result.prescribedMinutes,
      withinStatutoryOtMinutes: adj.withinStatutoryOtMinutes,
      overStatutoryOtMinutes: adj.overStatutoryOtMinutes,
      nightMinutes: result.nightMinutes,
      legalHolidayMinutes: result.legalHolidayMinutes,
      lateMinutes: result.lateMinutes,
      earlyLeaveMinutes: result.earlyLeaveMinutes,
      leaveType: leave?.type ?? null,
      leaveDayPart: leave?.dayPart ?? null,
      paidLeaveCountedMinutes: result.paidLeaveCountedMinutes,
      flags: result.flags,
      closingPeriodId: period?.id ?? null,
    };

    await db.dailySummary.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: { userId, workDate, ...data },
      update: { ...data, computedAt: new Date() },
    });
  }

  // --- 影響する月次を stale 化（週が期間をまたぐ場合は複数）---
  for (const startStr of new Set(periodStartByDate.values())) {
    await markMonthlyStale(userId, startStr, rule.closingDay, db);
  }
}

/** 後方互換のエイリアス。1 日の再計算 = その週の再計算。 */
export const recomputeDay = recomputeWeek;

export async function markMonthlyStale(
  userId: string,
  dateInPeriod: string,
  closingDay: number,
  db: Db = prisma,
): Promise<void> {
  const { startStr, endStr } = periodRangeFor(dateInPeriod, closingDay);
  const periodStart = dateOnlyUtc(startStr);
  await db.monthlyAggregate.upsert({
    where: { userId_periodStart: { userId, periodStart } },
    create: {
      userId,
      periodStart,
      periodEnd: dateOnlyUtc(endStr),
      stale: true,
    },
    update: { stale: true },
  });
}

export function getDailySummaries(
  userId: string,
  startStr: string,
  endStr: string,
) {
  return prisma.dailySummary.findMany({
    where: {
      userId,
      workDate: { gte: dateOnlyUtc(startStr), lte: dateOnlyUtc(endStr) },
    },
    orderBy: { workDate: "asc" },
  });
}

export type { DailySummaryResult };

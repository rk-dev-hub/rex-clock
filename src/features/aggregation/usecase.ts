import type { MonthlyAggregate, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc } from "@/lib/datetime";
import { eachDateStr } from "@/lib/date-range";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { weekStartOf } from "@/features/aggregation/domain/week";
import {
  buildMonthlyAggregate,
  type MonthlyDay,
} from "@/features/aggregation/domain/monthly-aggregate";
import {
  getDefaultWorkRule,
  recomputeWeek,
} from "@/features/attendance/usecase";

type Db = Prisma.TransactionClient | typeof prisma;

export type PeriodInfo = { startStr: string; endStr: string };

export { assertPeriodOpen, isPeriodClosed } from "@/features/closing/guard";

/** ref 日を含む締め期間を、DailySummary（週次反映済み）から集計して upsert する。 */
export async function recomputeMonth(
  userId: string,
  ref: string,
  db: Db = prisma,
): Promise<MonthlyAggregate> {
  const rule = await getDefaultWorkRule(db);
  const { startStr, endStr } = periodRangeFor(ref, rule.closingDay);
  const periodStart = dateOnlyUtc(startStr);
  const periodEnd = dateOnlyUtc(endStr);

  const rows = await db.dailySummary.findMany({
    where: { userId, workDate: { gte: periodStart, lte: periodEnd } },
    orderBy: { workDate: "asc" },
  });

  const days: MonthlyDay[] = rows.map((s) => ({
    dateStr: dateOnlyStr(s.workDate),
    dayType: s.dayType,
    workedMinutes: s.workedMinutes,
    breakMinutes: s.breakMinutes,
    // DailySummary は withinPrescribed を保持しないが、
    // worked = withinPrescribed + withinStatutoryOt + overStatutoryOt の不変条件から復元できる
    // （週次昇格は within/over 間の移動のみで総和は不変。docs/04 §3）。
    withinPrescribedMinutes:
      s.dayType === "LEGAL_HOLIDAY"
        ? 0
        : Math.max(
            0,
            s.workedMinutes -
              s.withinStatutoryOtMinutes -
              s.overStatutoryOtMinutes,
          ),
    withinStatutoryOtMinutes: s.withinStatutoryOtMinutes,
    overStatutoryOtMinutes: s.overStatutoryOtMinutes,
    nightMinutes: s.nightMinutes,
    legalHolidayMinutes: s.legalHolidayMinutes,
    lateMinutes: s.lateMinutes,
    earlyLeaveMinutes: s.earlyLeaveMinutes,
    paidLeaveCountedMinutes: s.paidLeaveCountedMinutes,
    leaveType: s.leaveType,
    leaveDayPart: s.leaveDayPart,
  }));

  const agg = buildMonthlyAggregate(days);

  return db.monthlyAggregate.upsert({
    where: { userId_periodStart: { userId, periodStart } },
    create: { userId, periodStart, periodEnd, stale: false, ...agg },
    update: { ...agg, periodEnd, stale: false, computedAt: new Date() },
  });
}

/**
 * 指定期間に影響する DailySummary / 週次 / 月次をすべて再計算する。
 * 休暇承認・打刻修正承認・締め再オープン・マスタ変更の各 usecase から必ず呼ぶこと
 * （それらの変更は打刻と同様に週内・期間内へ波及する）。
 */
export async function recomputeUserRange(
  userId: string,
  startStr: string,
  endStr: string,
  db: Db = prisma,
): Promise<void> {
  const rule = await getDefaultWorkRule(db);
  const dates = eachDateStr(startStr, endStr);

  const weekStarts = new Set(
    dates.map((d) => weekStartOf(d, rule.weekStartsOn)),
  );
  for (const ws of weekStarts) await recomputeWeek(userId, ws, db);

  const periodStarts = new Set(
    dates.map((d) => periodRangeFor(d, rule.closingDay).startStr),
  );
  for (const ps of periodStarts) await recomputeMonth(userId, ps, db);
}

/** 締め期間の月次集計を返す。無い or stale なら再計算する。 */
export async function getMonthly(
  userId: string,
  ref: string,
): Promise<{ aggregate: MonthlyAggregate; period: PeriodInfo }> {
  const rule = await getDefaultWorkRule();
  const { startStr, endStr } = periodRangeFor(ref, rule.closingDay);
  const periodStart = dateOnlyUtc(startStr);

  const found = await prisma.monthlyAggregate.findUnique({
    where: { userId_periodStart: { userId, periodStart } },
  });

  const aggregate =
    found && !found.stale ? found : await recomputeMonth(userId, ref);

  return { aggregate, period: { startStr, endStr } };
}

import type { DailySummary, DayType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc, jstWeekday } from "@/lib/datetime";
import { eachDateStr } from "@/lib/date-range";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { resolveDayType } from "@/features/calendar/domain/day-type";
import {
  getDefaultWorkRule,
  getDailySummaries,
} from "@/features/attendance/usecase";

export type PeriodRow = {
  date: string;
  dayType: DayType;
  summary: DailySummary | null;
};

export type PeriodView = {
  startStr: string;
  endStr: string;
  closingDay: number;
  rows: PeriodRow[];
};

/** 締め期間ぶんの「日付 × 区分 × 日次サマリ」を組み立てる（勤怠一覧・勤務表で共用）。 */
export async function getPeriodView(
  userId: string,
  ref: string,
): Promise<PeriodView> {
  const rule = await getDefaultWorkRule();
  const { startStr, endStr } = periodRangeFor(ref, rule.closingDay);
  const dates = eachDateStr(startStr, endStr);

  const [summaries, holidays, overrides] = await Promise.all([
    getDailySummaries(userId, startStr, endStr),
    prisma.holiday.findMany({
      where: {
        date: { gte: dateOnlyUtc(startStr), lte: dateOnlyUtc(endStr) },
      },
      select: { date: true },
    }),
    prisma.calendarDay.findMany({
      where: {
        workRuleId: rule.id,
        date: { gte: dateOnlyUtc(startStr), lte: dateOnlyUtc(endStr) },
      },
    }),
  ]);

  const summaryByDate = new Map(
    summaries.map((s) => [dateOnlyStr(s.workDate), s]),
  );
  const holidaySet = new Set(holidays.map((h) => dateOnlyStr(h.date)));
  const overrideByDate = new Map(
    overrides.map((o) => [dateOnlyStr(o.date), o]),
  );

  const rows: PeriodRow[] = dates.map((d) => {
    const ov = overrideByDate.get(d);
    const { dayType } = resolveDayType({
      weekday: jstWeekday(d),
      legalHolidayWeekday: rule.legalHolidayWeekday,
      prescribedHolidayWeekdays: rule.prescribedHolidayWeekdays,
      isHolidayDate: holidaySet.has(d),
      override: ov ? { dayType: ov.dayType, isHoliday: ov.isHoliday } : null,
    });
    return { date: d, dayType, summary: summaryByDate.get(d) ?? null };
  });

  return { startStr, endStr, closingDay: rule.closingDay, rows };
}

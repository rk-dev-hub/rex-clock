import type { DayType, LeaveDayPart, LeaveType } from "@prisma/client";

// docs/04-aggregation-spec.md §5。締め期間の月次ロールアップ。

export const MONTHLY_OT60_MIN = 3600; // 60h

export type MonthlyDay = {
  dateStr: string;
  dayType: DayType;
  workedMinutes: number;
  breakMinutes: number;
  withinPrescribedMinutes: number;
  withinStatutoryOtMinutes: number;
  /** 週次反映後の法定外残業。 */
  overStatutoryOtMinutes: number;
  nightMinutes: number;
  legalHolidayMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  paidLeaveCountedMinutes: number;
  leaveType: LeaveType | null;
  leaveDayPart: LeaveDayPart | null;
};

export type MonthlyAggregateResult = {
  workDays: number;
  absenceDays: number;
  paidLeaveFullDays: number;
  paidLeaveHalfDays: number;
  paidLeaveMinutes: number;
  totalWorkedMinutes: number;
  withinPrescribedMinutes: number;
  withinStatutoryOtMinutes: number;
  overtime25Minutes: number;
  overtime50Minutes: number;
  nightMinutes: number;
  legalHolidayMinutes: number;
  lateCount: number;
  lateMinutes: number;
  earlyLeaveCount: number;
  earlyLeaveMinutes: number;
  breakMinutes: number;
};

export function buildMonthlyAggregate(
  days: MonthlyDay[],
  ot60Minutes: number = MONTHLY_OT60_MIN,
): MonthlyAggregateResult {
  const sum = (pick: (d: MonthlyDay) => number) =>
    days.reduce((s, d) => s + pick(d), 0);

  const sumOverStatutoryOt = sum((d) => d.overStatutoryOtMinutes);
  const overtime50Minutes = Math.max(0, sumOverStatutoryOt - ot60Minutes);
  const overtime25Minutes = sumOverStatutoryOt - overtime50Minutes;

  return {
    workDays: days.filter((d) => d.workedMinutes > 0).length,
    absenceDays: days.filter((d) => d.leaveType === "ABSENCE").length,
    paidLeaveFullDays: days.filter(
      (d) => d.leaveType === "PAID" && d.leaveDayPart === "FULL",
    ).length,
    paidLeaveHalfDays: days.filter(
      (d) =>
        d.leaveType === "PAID" &&
        (d.leaveDayPart === "AM" || d.leaveDayPart === "PM"),
    ).length,
    paidLeaveMinutes: sum((d) => d.paidLeaveCountedMinutes),
    totalWorkedMinutes: sum((d) => d.workedMinutes),
    withinPrescribedMinutes: sum((d) => d.withinPrescribedMinutes),
    withinStatutoryOtMinutes: sum((d) => d.withinStatutoryOtMinutes),
    overtime25Minutes,
    overtime50Minutes,
    nightMinutes: sum((d) => d.nightMinutes),
    legalHolidayMinutes: sum((d) => d.legalHolidayMinutes),
    lateCount: days.filter((d) => d.lateMinutes > 0).length,
    lateMinutes: sum((d) => d.lateMinutes),
    earlyLeaveCount: days.filter((d) => d.earlyLeaveMinutes > 0).length,
    earlyLeaveMinutes: sum((d) => d.earlyLeaveMinutes),
    breakMinutes: sum((d) => d.breakMinutes),
  };
}

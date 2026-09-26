import type { DayType } from "@prisma/client";

/**
 * 日区分の判定（純粋関数）。優先順位:
 *   手動上書き(CalendarDay) > 祝日(Holiday) > WorkRule の曜日設定
 * 祝日は原則「所定休日」。ただし法定休日曜日に重なれば「法定休日」。
 */
export type DayTypeInput = {
  weekday: number; // 0=日
  legalHolidayWeekday: number;
  prescribedHolidayWeekdays: number[];
  isHolidayDate: boolean; // Holiday テーブルに存在するか
  override?: { dayType: DayType; isHoliday: boolean } | null;
};

export type DayTypeResult = { dayType: DayType; isHoliday: boolean };

export function resolveDayType(input: DayTypeInput): DayTypeResult {
  if (input.override) {
    return {
      dayType: input.override.dayType,
      isHoliday: input.override.isHoliday,
    };
  }

  const isLegalWeekday = input.weekday === input.legalHolidayWeekday;

  if (input.isHolidayDate) {
    return isLegalWeekday
      ? { dayType: "LEGAL_HOLIDAY", isHoliday: true }
      : { dayType: "PRESCRIBED_HOLIDAY", isHoliday: true };
  }

  if (isLegalWeekday) {
    return { dayType: "LEGAL_HOLIDAY", isHoliday: true };
  }
  if (input.prescribedHolidayWeekdays.includes(input.weekday)) {
    return { dayType: "PRESCRIBED_HOLIDAY", isHoliday: true };
  }
  return { dayType: "WORKDAY", isHoliday: false };
}

import type { LeaveDayPart } from "@prisma/client";

/**
 * 休暇申請が消化する「日数」。
 * - FULL: 期間内の勤務日（isWorkday=true）を 1.0 日ずつ
 * - AM / PM: 単日想定。勤務日なら 0.5 日、非勤務日なら 0
 */
export function countLeaveDays(
  days: { isWorkday: boolean }[],
  dayPart: LeaveDayPart,
): number {
  const workdays = days.filter((d) => d.isWorkday).length;
  if (dayPart === "FULL") return workdays;
  return workdays > 0 ? 0.5 : 0;
}

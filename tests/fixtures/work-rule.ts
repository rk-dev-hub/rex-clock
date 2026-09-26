import type {
  DayContext,
  WorkRuleSnapshot,
} from "@/features/attendance/domain/daily-summary";
import { jstDateTimeUtc } from "@/lib/datetime";
import type { ClockType } from "@prisma/client";

export const DEFAULT_RULE: WorkRuleSnapshot = {
  nightStart: "22:00",
  nightEnd: "05:00",
  breakPolicy: "ACTUAL",
  autoBreakRules: [
    { overMinutes: 360, breakMinutes: 45 },
    { overMinutes: 480, breakMinutes: 60 },
  ],
};

export const WORKDAY_CTX: DayContext = {
  workDate: "2026-09-07", // 月曜
  dayType: "WORKDAY",
  prescribedMinutes: 480,
  scheduledStart: "09:00",
  scheduledEnd: "18:00",
  scheduledBreakMinutes: 60,
};

/** イベント生成。日付省略時は WORKDAY_CTX.workDate。 */
export function ev(
  type: ClockType,
  hm: string,
  dateStr: string = WORKDAY_CTX.workDate,
) {
  return { type, at: jstDateTimeUtc(dateStr, hm) };
}

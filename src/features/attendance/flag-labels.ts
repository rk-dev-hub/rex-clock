import type { DailyFlag } from "@/features/attendance/domain/daily-summary";

// docs/04-aggregation-spec.md §6 の重大度分類に対応。
export type FlagSeverity = "destructive" | "warning" | "info";

export const flagLabel: Record<DailyFlag, string> = {
  MISSING_CLOCK_IN: "出勤打刻なし",
  MISSING_CLOCK_OUT: "退勤打刻なし",
  BREAK_MISMATCH: "休憩打刻に不整合",
  BREAK_SHORTAGE: "休憩不足",
  NEGATIVE_WORK: "実働時間が不正",
  HOLIDAY_WORK: "休日出勤",
  OVER_STATUTORY_OT: "法定外残業あり",
  LONG_DAY: "長時間労働（13時間超）",
  ABSENCE: "欠勤",
  SPECIAL_LEAVE: "特別休暇",
};

export const flagSeverity: Record<DailyFlag, FlagSeverity> = {
  MISSING_CLOCK_IN: "destructive",
  MISSING_CLOCK_OUT: "destructive",
  BREAK_MISMATCH: "destructive",
  BREAK_SHORTAGE: "warning",
  NEGATIVE_WORK: "destructive",
  HOLIDAY_WORK: "warning",
  OVER_STATUTORY_OT: "info",
  LONG_DAY: "warning",
  ABSENCE: "info",
  SPECIAL_LEAVE: "info",
};

const SEVERITY_CLASS: Record<FlagSeverity, string> = {
  destructive: "bg-destructive/15 text-destructive",
  warning: "bg-warning/20 text-warning-foreground",
  info: "bg-info/15 text-info",
};

/** 未知の値（旧データ等）が来てもラベル欠落で落ちないように fallback する。 */
export function displayFlagLabel(flag: string): string {
  return flagLabel[flag as DailyFlag] ?? flag;
}

export function flagBadgeClass(flag: string): string {
  const severity = flagSeverity[flag as DailyFlag] ?? "info";
  return SEVERITY_CLASS[severity];
}

import type { ClockType } from "@prisma/client";
import type { ClockState } from "@/features/time-clock/domain/state-machine";

export const clockTypeLabel: Record<ClockType, string> = {
  CLOCK_IN: "出勤",
  CLOCK_OUT: "退勤",
  BREAK_START: "休憩開始",
  BREAK_END: "休憩終了",
};

export const clockStateLabel: Record<ClockState, string> = {
  OUT: "未出勤",
  WORKING: "勤務中",
  ON_BREAK: "休憩中",
  DONE: "退勤済",
};

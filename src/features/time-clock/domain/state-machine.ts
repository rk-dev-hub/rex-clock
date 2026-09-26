import type { ClockType } from "@prisma/client";

/**
 * 打刻の状態機械（純粋関数）。1 勤務日ぶんの打刻列に対して評価する。
 * OUT → CLOCK_IN → (BREAK_START → BREAK_END)* → CLOCK_OUT → DONE
 */
export type ClockState = "OUT" | "WORKING" | "ON_BREAK" | "DONE";

export type ClockEventLike = { type: ClockType };

const NEXT: Record<ClockState, ClockType[]> = {
  OUT: ["CLOCK_IN"],
  WORKING: ["BREAK_START", "CLOCK_OUT"],
  ON_BREAK: ["BREAK_END"],
  DONE: [],
};

/** 打刻列（時刻昇順）から現在状態を導出する。不正列は最後に成立した状態を返す。 */
export function deriveState(events: ClockEventLike[]): ClockState {
  let state: ClockState = "OUT";
  for (const e of events) {
    if (!NEXT[state].includes(e.type)) continue; // 不正遷移は無視（検証は canPunch で行う）
    state = transition(state, e.type);
  }
  return state;
}

/** 次に打刻可能な種別。 */
export function allowedNext(state: ClockState): ClockType[] {
  return NEXT[state];
}

export type PunchCheck =
  { ok: true; nextState: ClockState } | { ok: false; reason: string };

const REASON: Record<ClockType, string> = {
  CLOCK_IN: "すでに出勤済みか、退勤済みです。",
  CLOCK_OUT: "出勤打刻がありません。",
  BREAK_START: "勤務中でないため休憩を開始できません。",
  BREAK_END: "休憩中ではありません。",
};

/** 現在の打刻列に対して type を打刻できるか。 */
export function canPunch(
  events: ClockEventLike[],
  type: ClockType,
): PunchCheck {
  const state = deriveState(events);
  if (!NEXT[state].includes(type)) {
    return { ok: false, reason: REASON[type] };
  }
  return { ok: true, nextState: transition(state, type) };
}

function transition(state: ClockState, type: ClockType): ClockState {
  switch (type) {
    case "CLOCK_IN":
      return "WORKING";
    case "BREAK_START":
      return "ON_BREAK";
    case "BREAK_END":
      return "WORKING";
    case "CLOCK_OUT":
      return "DONE";
    default:
      return state;
  }
}

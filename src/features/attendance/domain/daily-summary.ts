import type {
  BreakPolicy,
  ClockType,
  DayType,
  LeaveDayPart,
  LeaveType,
} from "@prisma/client";
import {
  diffMinutes,
  hmToMinutes,
  jstMinutesOfDay,
  overlapMinutes,
} from "@/lib/datetime";

// docs/04-aggregation-spec.md が正典。ここは日次分（§2）のみ。週次・月次は aggregation ドメイン。

export type DailyClockEvent = { type: ClockType; at: Date };

export type DayContext = {
  workDate: string;
  dayType: DayType;
  /** 当日の所定労働（分）。休日は 0。 */
  prescribedMinutes: number;
  /** 所定始業/終業（'HH:mm'）。休日や未設定なら undefined。 */
  scheduledStart?: string;
  scheduledEnd?: string;
  scheduledBreakMinutes: number;
  leave?: { type: LeaveType; part: LeaveDayPart };
};

export type WorkRuleSnapshot = {
  nightStart: string;
  nightEnd: string;
  breakPolicy: BreakPolicy;
  autoBreakRules: { overMinutes: number; breakMinutes: number }[];
};
// NOTE: 日次の端数丸めは行わない。1 日ごとの労働時間切り捨ては
// 昭63.3.14 基発150号により不可。丸めが必要なら月次の時間外/深夜/休日
// 合計に対する 30 分未満四捨五入として別途実装する（docs/04 §2.3）。

export type DailyFlag =
  | "MISSING_CLOCK_IN"
  | "MISSING_CLOCK_OUT"
  | "BREAK_MISMATCH"
  | "BREAK_SHORTAGE"
  | "NEGATIVE_WORK"
  | "HOLIDAY_WORK"
  | "OVER_STATUTORY_OT"
  | "LONG_DAY"
  | "ABSENCE"
  | "SPECIAL_LEAVE";

export type DailySummaryResult = {
  firstIn: Date | null;
  lastOut: Date | null;
  breakMinutes: number;
  workedMinutes: number;
  prescribedMinutes: number;
  withinPrescribedMinutes: number;
  withinStatutoryOtMinutes: number;
  /** 日次確定分のみ。週次で増える。 */
  overStatutoryOtMinutes: number;
  nightMinutes: number;
  legalHolidayMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  paidLeaveCountedMinutes: number;
  flags: DailyFlag[];
};

const STATUTORY_DAILY_MIN = 480; // 法定 1 日 8h
const LONG_DAY_MIN = 13 * 60;

function zero(
  ctx: DayContext,
  extra: Partial<DailySummaryResult> = {},
): DailySummaryResult {
  return {
    firstIn: null,
    lastOut: null,
    breakMinutes: 0,
    workedMinutes: 0,
    prescribedMinutes: ctx.prescribedMinutes,
    withinPrescribedMinutes: 0,
    withinStatutoryOtMinutes: 0,
    overStatutoryOtMinutes: 0,
    nightMinutes: 0,
    legalHolidayMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    paidLeaveCountedMinutes: 0,
    flags: [],
    ...extra,
  };
}

export function buildDailySummary(
  rawEvents: DailyClockEvent[],
  ctx: DayContext,
  rule: WorkRuleSnapshot,
): DailySummaryResult {
  const events = [...rawEvents].sort((a, b) => a.at.getTime() - b.at.getTime());

  // ---- 全日休暇（§2.7） ----
  if (ctx.leave?.part === "FULL") {
    if (ctx.leave.type === "PAID") {
      return zero(ctx, { paidLeaveCountedMinutes: ctx.prescribedMinutes });
    }
    if (ctx.leave.type === "ABSENCE") {
      return zero(ctx, { flags: ["ABSENCE"] });
    }
    return zero(ctx, { flags: ["SPECIAL_LEAVE"] }); // SPECIAL_UNPAID
  }

  const half = ctx.leave ? ctx.leave.part : null; // FULL は上で return 済み
  // 当日の所定（半休なら半分）。有給みなし時間の基準。
  const dayPrescribed = half
    ? Math.round(ctx.prescribedMinutes / 2)
    : ctx.prescribedMinutes;
  const paidLeaveCountedMinutes =
    half && ctx.leave?.type === "PAID" ? dayPrescribed : 0;
  // 所定内/法定内残業の振り分け基準は法定 8h を上限にクランプ
  // （所定 > 8h の誤設定でも worked = withinPrescribed + withinStatutoryOt + overStatutoryOt を保つ）。
  const splitBase = Math.min(dayPrescribed, STATUTORY_DAILY_MIN);

  const ins = events.filter((e) => e.type === "CLOCK_IN");
  const outs = events.filter((e) => e.type === "CLOCK_OUT");
  const firstIn = ins[0]?.at ?? null;
  const lastOut = outs.at(-1)?.at ?? null;

  // ---- 打刻欠落 ----
  if (!firstIn) {
    const flags: DailyFlag[] = events.length > 0 ? ["MISSING_CLOCK_IN"] : [];
    return zero(ctx, { flags, paidLeaveCountedMinutes });
  }
  if (!lastOut) {
    return zero(ctx, {
      firstIn,
      flags: ["MISSING_CLOCK_OUT"],
      paidLeaveCountedMinutes,
    });
  }

  const flags = new Set<DailyFlag>();

  // ---- 拘束・休憩 ----
  const grossSpan = diffMinutes(firstIn, lastOut);
  const startMin = jstMinutesOfDay(firstIn);

  const breakIntervals = pairBreaks(events, firstIn, flags);
  const actualBreak = breakIntervals.reduce((s, b) => s + (b.end - b.start), 0);
  let breakMinutes = actualBreak;
  if (rule.breakPolicy === "AUTO_DEDUCT") {
    breakMinutes = Math.max(
      actualBreak,
      autoBreak(grossSpan, rule.autoBreakRules),
    );
  }

  // 日次は丸めない（基発150号）。丸めは月次合計側の責務。
  let workedMinutes = grossSpan - breakMinutes;
  if (workedMinutes < 0) {
    workedMinutes = 0;
    flags.add("NEGATIVE_WORK");
  }

  // 休憩不足（労基法 34 条）
  if (
    (grossSpan > 360 && breakMinutes < 45) ||
    (grossSpan > 480 && breakMinutes < 60)
  ) {
    flags.add("BREAK_SHORTAGE");
  }
  if (grossSpan > LONG_DAY_MIN) flags.add("LONG_DAY");

  // ---- 深夜 ----
  const nightMinutes = calcNight(
    startMin,
    grossSpan,
    breakIntervals,
    breakMinutes,
    rule,
  );

  // ---- dayType 別 ----
  let withinPrescribedMinutes = 0;
  let withinStatutoryOtMinutes = 0;
  let overStatutoryOtMinutes = 0;
  let legalHolidayMinutes = 0;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;

  if (ctx.dayType === "LEGAL_HOLIDAY") {
    legalHolidayMinutes = workedMinutes;
    if (workedMinutes > 0) flags.add("HOLIDAY_WORK");
  } else {
    withinPrescribedMinutes = Math.min(workedMinutes, splitBase);
    withinStatutoryOtMinutes = Math.max(
      0,
      Math.min(workedMinutes, STATUTORY_DAILY_MIN) - splitBase,
    );
    overStatutoryOtMinutes = Math.max(0, workedMinutes - STATUTORY_DAILY_MIN);
    if (overStatutoryOtMinutes > 0) flags.add("OVER_STATUTORY_OT");
    if (ctx.dayType === "PRESCRIBED_HOLIDAY" && workedMinutes > 0) {
      flags.add("HOLIDAY_WORK");
    }

    // 遅刻・早退（平日のみ・半休は所定時間帯をずらす）
    if (ctx.dayType === "WORKDAY" && ctx.scheduledStart && ctx.scheduledEnd) {
      const oStart = hmToMinutes(ctx.scheduledStart);
      const oEnd = hmToMinutes(ctx.scheduledEnd);
      const mid = Math.round((oStart + oEnd) / 2);
      const schedStart = half === "AM" ? mid : oStart;
      const schedEnd = half === "PM" ? mid : oEnd;

      lateMinutes = Math.max(0, startMin - schedStart);
      const endMinAxis = startMin + grossSpan;
      earlyLeaveMinutes = Math.max(0, schedEnd - endMinAxis);
    }
  }

  return {
    firstIn,
    lastOut,
    breakMinutes,
    workedMinutes,
    prescribedMinutes: ctx.prescribedMinutes,
    withinPrescribedMinutes,
    withinStatutoryOtMinutes,
    overStatutoryOtMinutes,
    nightMinutes,
    legalHolidayMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    paidLeaveCountedMinutes,
    flags: [...flags],
  };
}

// ---- helpers ----

type Interval = { start: number; end: number };

/** BREAK_START/BREAK_END を順にペアリング。start は firstIn からの相対分。 */
function pairBreaks(
  events: DailyClockEvent[],
  firstIn: Date,
  flags: Set<DailyFlag>,
): Interval[] {
  const out: Interval[] = [];
  let openStart: number | null = null;
  for (const e of events) {
    if (e.type === "BREAK_START") {
      if (openStart !== null) flags.add("BREAK_MISMATCH");
      openStart = diffMinutes(firstIn, e.at);
    } else if (e.type === "BREAK_END") {
      if (openStart === null) {
        flags.add("BREAK_MISMATCH");
        continue;
      }
      const end = diffMinutes(firstIn, e.at);
      if (end >= openStart) out.push({ start: openStart, end });
      else flags.add("BREAK_MISMATCH");
      openStart = null;
    }
  }
  if (openStart !== null) flags.add("BREAK_MISMATCH");
  return out;
}

function autoBreak(
  grossSpan: number,
  rules: { overMinutes: number; breakMinutes: number }[],
): number {
  let deduct = 0;
  for (const r of [...rules].sort((a, b) => a.overMinutes - b.overMinutes)) {
    if (grossSpan > r.overMinutes) deduct = r.breakMinutes;
  }
  return deduct;
}

/**
 * 深夜労働分。work 区間 [startMin, startMin+grossSpan) を JST 数直線上に置き、
 * 各日窓の [0,nightEnd) と [nightStart,1440) との重なりを合算。休憩の深夜重なりを控除。
 */
function calcNight(
  startMin: number,
  grossSpan: number,
  breaks: Interval[],
  breakMinutes: number,
  rule: WorkRuleSnapshot,
): number {
  if (grossSpan <= 0) return 0;
  const nightStart = hmToMinutes(rule.nightStart);
  const nightEnd = hmToMinutes(rule.nightEnd);
  const endMin = startMin + grossSpan;

  const nightOverlap = (a: number, b: number): number => {
    let total = 0;
    for (let base = -1440; base <= endMin + 1440; base += 1440) {
      total += overlapMinutes(a, b, base, base + nightEnd);
      total += overlapMinutes(a, b, base + nightStart, base + 1440);
    }
    return total;
  };

  const nightSpan = nightOverlap(startMin, endMin);
  if (nightSpan <= 0) return 0;

  let breakInNight: number;
  if (rule.breakPolicy === "ACTUAL" || breaks.length > 0) {
    breakInNight = breaks.reduce(
      (s, b) => s + nightOverlap(startMin + b.start, startMin + b.end),
      0,
    );
  } else {
    // AUTO_DEDUCT で実休憩打刻なし: 拘束全体に按分。
    breakInNight = (breakMinutes * nightSpan) / grossSpan;
  }

  return Math.max(0, Math.round(nightSpan - breakInNight));
}

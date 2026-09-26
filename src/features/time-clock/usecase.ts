import type { ClockType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc, jstDateStr } from "@/lib/datetime";
import { getActor, isErr } from "@/features/auth/rbac";
import { ok, errWithDefault, type Result } from "@/lib/result";
import { recomputeDay } from "@/features/attendance/usecase";
import { assertPeriodOpen } from "@/features/closing/guard";
import {
  canPunch,
  deriveState,
  allowedNext,
  type ClockState,
} from "@/features/time-clock/domain/state-machine";

/**
 * 打刻を追加すべき勤務日を決める。
 * 直近イベントの businessDate が「勤務中/休憩中」なら日跨ぎ勤務としてその日、
 * それ以外は今日（JST）。
 */
async function resolveActiveBusinessDate(userId: string): Promise<string> {
  const latest = await prisma.timeClockEvent.findFirst({
    where: { userId, canceled: false },
    orderBy: { occurredAt: "desc" },
  });
  const today = jstDateStr(new Date());
  if (!latest) return today;

  const bd = dateOnlyStr(latest.businessDate);
  const events = await prisma.timeClockEvent.findMany({
    where: { userId, businessDate: latest.businessDate, canceled: false },
    orderBy: { occurredAt: "asc" },
  });
  const state = deriveState(events);
  return state === "WORKING" || state === "ON_BREAK" ? bd : today;
}

export type TodayState = {
  businessDate: string;
  state: ClockState;
  allowed: ClockType[];
  events: { type: ClockType; at: string }[];
  summary: {
    workedMinutes: number;
    breakMinutes: number;
    overStatutoryOtMinutes: number;
    nightMinutes: number;
    flags: string[];
  } | null;
};

export async function getTodayState(userId: string): Promise<TodayState> {
  const businessDate = await resolveActiveBusinessDate(userId);
  const date = dateOnlyUtc(businessDate);

  const [events, summary] = await Promise.all([
    prisma.timeClockEvent.findMany({
      where: { userId, businessDate: date, canceled: false },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.dailySummary.findUnique({
      where: { userId_workDate: { userId, workDate: date } },
    }),
  ]);

  const state = deriveState(events);
  // 勤務中/休憩中はまだ退勤していないだけなので、この時点の MISSING_CLOCK_OUT は
  // 「退勤し忘れた」という異常ではない。当日カードでは出さない
  // （過去日の打刻漏れ検知は月次締めの事前チェック等、期間確定後の文脈で行う）。
  const stillWorking = state === "WORKING" || state === "ON_BREAK";
  const rawFlags = (summary?.flags as string[] | undefined) ?? [];
  const flags = stillWorking
    ? rawFlags.filter((f) => f !== "MISSING_CLOCK_OUT")
    : rawFlags;

  return {
    businessDate,
    state,
    allowed: allowedNext(state),
    events: events.map((e) => ({
      type: e.type,
      at: e.occurredAt.toISOString(),
    })),
    summary: summary
      ? {
          workedMinutes: summary.workedMinutes,
          breakMinutes: summary.breakMinutes,
          overStatutoryOtMinutes: summary.overStatutoryOtMinutes,
          nightMinutes: summary.nightMinutes,
          flags,
        }
      : null,
  };
}

export async function punch(
  type: ClockType,
): Promise<Result<{ state: ClockState }>> {
  const actor = await getActor();
  if (isErr(actor)) return actor;

  const businessDate = await resolveActiveBusinessDate(actor.id);
  const date = dateOnlyUtc(businessDate);

  const closed = await assertPeriodOpen(businessDate);
  if (closed) return closed;

  const events = await prisma.timeClockEvent.findMany({
    where: { userId: actor.id, businessDate: date, canceled: false },
    orderBy: { occurredAt: "asc" },
  });

  const check = canPunch(events, type);
  if (!check.ok) {
    return errWithDefault("CONFLICT", check.reason);
  }

  await prisma.timeClockEvent.create({
    data: {
      userId: actor.id,
      type,
      occurredAt: new Date(),
      businessDate: date,
      source: "SELF",
      createdById: actor.id,
    },
  });

  await recomputeDay(actor.id, businessDate);

  return ok({ state: check.nextState });
}

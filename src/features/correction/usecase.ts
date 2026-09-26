import type { ClockType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dateOnlyStr,
  dateOnlyUtc,
  jstDateTimeUtc,
  jstMinutesOfDay,
  minutesToHm,
} from "@/lib/datetime";
import { addDaysStr } from "@/lib/date-range";
import { ok, errWithDefault, type Result } from "@/lib/result";
import { fieldErrors } from "@/lib/zod";
import { recordAudit } from "@/lib/audit";
import { getActor, getAdminActor, isErr } from "@/features/auth/rbac";
import {
  recomputeUserRange,
  assertPeriodOpen,
} from "@/features/aggregation/usecase";
import { canTransition } from "@/features/approval/domain/transitions";
import {
  planCorrection,
  type CorrectionLineInput,
  type ExistingEvent,
} from "@/features/correction/domain/apply";
import {
  submitCorrectionSchema,
  decisionSchema,
  type CorrectionLineForm,
} from "@/features/correction/schema";
import { rejectSchema } from "@/features/leave/schema";

/** 'HH:mm' または '+1 HH:mm'（翌日）を、対象日 JST の ISO 文字列へ。 */
function lineTimeToIso(targetDate: string, time: string): string {
  const m = time.match(/^(\+1 )?(\d{2}:\d{2})$/);
  if (!m) throw new Error(`不正な時刻: ${time}`);
  const date = m[1] ? addDaysStr(targetDate, 1) : targetDate;
  return jstDateTimeUtc(date, m[2]).toISOString();
}

function toLineInput(
  targetDate: string,
  lines: CorrectionLineForm[],
): CorrectionLineInput[] {
  return lines.map((l) => ({
    op: l.op,
    targetEventId: l.targetEventId ?? null,
    clockType: (l.clockType ?? null) as ClockType | null,
    occurredAt: l.time ? lineTimeToIso(targetDate, l.time) : null,
  }));
}

export async function listMyCorrections(userId: string) {
  return prisma.correctionRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
    take: 100,
  });
}

/** 対象日の打刻イベント（取消済み含む・修正フォームの選択肢用）。 */
export async function getDayEvents(userId: string, targetDate: string) {
  const bd = dateOnlyUtc(targetDate);
  return prisma.timeClockEvent.findMany({
    where: { userId, businessDate: bd },
    orderBy: { occurredAt: "asc" },
  });
}

export type CorrectableEvent = {
  id: string;
  clockType: ClockType;
  timeLabel: string;
};

/**
 * 本人の対象日の有効な打刻一覧（修正申請フォームの「対象の打刻」選択肢用）。
 * 生の ID を手入力させる代わりに、この一覧から選ばせる。
 */
export async function listEventsForCorrectionForm(
  targetDate: string,
): Promise<Result<CorrectableEvent[]>> {
  const actor = await getActor();
  if (isErr(actor)) return actor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))
    return errWithDefault("VALIDATION");

  const events = await getDayEvents(actor.id, targetDate);
  return ok(
    events
      .filter((e) => !e.canceled)
      .map((e) => ({
        id: e.id,
        clockType: e.type,
        timeLabel: minutesToHm(jstMinutesOfDay(e.occurredAt)),
      })),
  );
}

export async function submitCorrection(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const actor = await getActor();
  if (isErr(actor)) return actor;

  const parsed = submitCorrectionSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const input = parsed.data;

  const closed = await assertPeriodOpen(input.targetDate);
  if (closed) return closed;

  // 明細の妥当性を事前検証（承認時と同じロジック）
  const events = await getDayEvents(actor.id, input.targetDate);
  const existing: ExistingEvent[] = events.map((e) => ({
    id: e.id,
    type: e.type,
    occurredAt: e.occurredAt.toISOString(),
    canceled: e.canceled,
  }));
  let lineInputs: CorrectionLineInput[];
  try {
    lineInputs = toLineInput(input.targetDate, input.lines);
  } catch {
    return errWithDefault("VALIDATION", "明細の時刻が不正です");
  }
  const plan = planCorrection(existing, lineInputs);
  if (!plan.ok) {
    return errWithDefault("VALIDATION", plan.errors.join(" "));
  }

  const created = await prisma.correctionRequest.create({
    data: {
      userId: actor.id,
      targetDate: dateOnlyUtc(input.targetDate),
      status: "PENDING",
      reason: input.reason,
      lines: {
        create: lineInputs.map((l) => ({
          op: l.op,
          targetEventId: l.targetEventId ?? null,
          clockType: l.clockType ?? null,
          occurredAt: l.occurredAt ? new Date(l.occurredAt) : null,
        })),
      },
    },
  });
  return ok({ id: created.id });
}

export async function cancelCorrection(requestId: string): Promise<Result> {
  const actor = await getActor();
  if (isErr(actor)) return actor;

  const req = await prisma.correctionRequest.findUnique({
    where: { id: requestId },
  });
  if (!req || req.userId !== actor.id) return errWithDefault("NOT_FOUND");
  if (!canTransition(req.status, "CANCEL")) return errWithDefault("CONFLICT");

  await prisma.correctionRequest.update({
    where: { id: requestId },
    data: { status: "CANCELED" },
  });
  return ok(undefined);
}

export async function approveCorrection(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return errWithDefault("VALIDATION");

  const req = await prisma.correctionRequest.findUnique({
    where: { id: parsed.data.requestId },
    include: { lines: true },
  });
  if (!req) return errWithDefault("NOT_FOUND");
  if (req.userId === actor.id) return errWithDefault("SELF_APPROVAL");
  if (!canTransition(req.status, "APPROVE")) return errWithDefault("CONFLICT");

  const targetDate = dateOnlyStr(req.targetDate);
  const closed = await assertPeriodOpen(targetDate);
  if (closed)
    return errWithDefault(
      "PERIOD_CLOSED",
      "対象期間は締め済みです。「管理 > 月次締め」から再オープンしてください。",
    );

  const bd = dateOnlyUtc(targetDate);
  const lineInputs: CorrectionLineInput[] = req.lines.map((l) => ({
    op: l.op,
    targetEventId: l.targetEventId,
    clockType: l.clockType,
    occurredAt: l.occurredAt ? l.occurredAt.toISOString() : null,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      const events = await tx.timeClockEvent.findMany({
        where: { userId: req.userId, businessDate: bd },
        orderBy: { occurredAt: "asc" },
      });
      const before = events
        .filter((e) => !e.canceled)
        .map((e) => ({ type: e.type, at: e.occurredAt.toISOString() }));

      const existing: ExistingEvent[] = events.map((e) => ({
        id: e.id,
        type: e.type,
        occurredAt: e.occurredAt.toISOString(),
        canceled: e.canceled,
      }));
      const plan = planCorrection(existing, lineInputs);
      if (!plan.ok) throw new CorrectionApplyError(plan.errors.join(" "));

      if (plan.plan.cancelEventIds.length > 0) {
        await tx.timeClockEvent.updateMany({
          where: { id: { in: plan.plan.cancelEventIds } },
          data: { canceled: true, correctionRequestId: req.id },
        });
      }
      for (const add of plan.plan.addEvents) {
        await tx.timeClockEvent.create({
          data: {
            userId: req.userId,
            type: add.type,
            occurredAt: new Date(add.occurredAt),
            businessDate: bd,
            source: "CORRECTION",
            canceled: false,
            correctionRequestId: req.id,
            createdById: actor.id,
            note: `修正申請 ${req.id}`,
          },
        });
      }

      await tx.correctionRequest.update({
        where: { id: req.id },
        data: {
          status: "APPROVED",
          approverId: actor.id,
          decidedAt: new Date(),
          decisionComment: parsed.data.comment ?? null,
        },
      });

      const after = (
        await tx.timeClockEvent.findMany({
          where: { userId: req.userId, businessDate: bd, canceled: false },
          orderBy: { occurredAt: "asc" },
        })
      ).map((e) => ({ type: e.type, at: e.occurredAt.toISOString() }));

      await recordAudit(tx, {
        actorId: actor.id,
        action: "APPROVE",
        targetType: "CorrectionRequest",
        targetId: req.id,
        subjectUserId: req.userId,
        before: { events: before },
        after: { events: after },
        comment: parsed.data.comment ?? null,
      });
    });
  } catch (e) {
    if (e instanceof CorrectionApplyError) {
      return errWithDefault("CONFLICT", e.message);
    }
    throw e;
  }

  await recomputeUserRange(req.userId, targetDate, targetDate);
  return ok(undefined);
}

export async function rejectCorrection(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = rejectSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }

  const req = await prisma.correctionRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!req) return errWithDefault("NOT_FOUND");
  if (req.userId === actor.id) return errWithDefault("SELF_APPROVAL");
  if (!canTransition(req.status, "REJECT")) return errWithDefault("CONFLICT");

  await prisma.$transaction(async (tx) => {
    await tx.correctionRequest.update({
      where: { id: req.id },
      data: {
        status: "REJECTED",
        approverId: actor.id,
        decidedAt: new Date(),
        decisionComment: parsed.data.comment,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "REJECT",
      targetType: "CorrectionRequest",
      targetId: req.id,
      subjectUserId: req.userId,
      comment: parsed.data.comment,
    });
  });
  return ok(undefined);
}

class CorrectionApplyError extends Error {}
export { CorrectionApplyError };

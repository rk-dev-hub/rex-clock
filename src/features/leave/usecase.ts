import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc, jstWeekday } from "@/lib/datetime";
import { eachDateStr } from "@/lib/date-range";
import { ok, errWithDefault, type Result } from "@/lib/result";
import { fieldErrors } from "@/lib/zod";
import { recordAudit } from "@/lib/audit";
import { getActor, getAdminActor, isErr } from "@/features/auth/rbac";
import { resolveDayType } from "@/features/calendar/domain/day-type";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import {
  recomputeUserRange,
  assertPeriodOpen,
} from "@/features/aggregation/usecase";
import { canTransition } from "@/features/approval/domain/transitions";
import {
  computeBalance,
  planFifoConsumption,
  type GrantLot,
  type LedgerEntry,
} from "@/features/leave/domain/balance";
import { countLeaveDays } from "@/features/leave/domain/leave-days";
import {
  submitLeaveSchema,
  leaveCancellationSchema,
  decisionSchema,
  rejectSchema,
} from "@/features/leave/schema";

type Db = Prisma.TransactionClient | typeof prisma;

/** 承認系（管理者向け）の締め済みエラー。再オープン手順を案内する。 */
function periodClosedForAdmin() {
  return errWithDefault(
    "PERIOD_CLOSED",
    "対象期間は締め済みです。「管理 > 月次締め」から再オープンしてください。",
  );
}

/** 期間内の各日について勤務日かどうかを判定する（休暇日数の分母）。 */
async function workdayFlags(
  userId: string,
  startStr: string,
  endStr: string,
  db: Db = prisma,
): Promise<{ dateStr: string; isWorkday: boolean }[]> {
  const rule = await getDefaultWorkRule(db);
  const dates = eachDateStr(startStr, endStr);
  const from = dateOnlyUtc(startStr);
  const to = dateOnlyUtc(endStr);

  const [user, holidays, overrides] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { workPattern: { include: { days: true } } },
    }),
    db.holiday.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true },
    }),
    db.calendarDay.findMany({
      where: { workRuleId: rule.id, date: { gte: from, lte: to } },
    }),
  ]);
  const holidaySet = new Set(holidays.map((h) => dateOnlyStr(h.date)));
  const overrideByDate = new Map(
    overrides.map((o) => [dateOnlyStr(o.date), o]),
  );

  return dates.map((d) => {
    const weekday = jstWeekday(d);
    const ov = overrideByDate.get(d);
    const { dayType } = resolveDayType({
      weekday,
      legalHolidayWeekday: rule.legalHolidayWeekday,
      prescribedHolidayWeekdays: rule.prescribedHolidayWeekdays,
      isHolidayDate: holidaySet.has(d),
      override: ov ? { dayType: ov.dayType, isHoliday: ov.isHoliday } : null,
    });
    const pd = user.workPattern.days.find((x) => x.weekday === weekday);
    return {
      dateStr: d,
      isWorkday: dayType === "WORKDAY" && (pd?.isWorkday ?? false),
    };
  });
}

async function ledgerEntries(
  userId: string,
  db: Db = prisma,
): Promise<LedgerEntry[]> {
  const rows = await db.leaveLedger.findMany({
    where: { userId },
    select: { kind: true, days: true, effectiveDate: true },
  });
  return rows.map((r) => ({
    kind: r.kind,
    days: Number(r.days),
    effectiveDate: dateOnlyStr(r.effectiveDate),
  }));
}

/** 基準日時点の有給残数。 */
export async function getLeaveBalance(
  userId: string,
  asOf: string = dateOnlyStr(new Date()),
): Promise<number> {
  return computeBalance(await ledgerEntries(userId), asOf);
}

export type MyLeaveRow = Awaited<
  ReturnType<typeof listMyLeaveRequests>
>[number];

export async function listMyLeaveRequests(userId: string) {
  return prisma.leaveRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ---- 申請 ----

export async function submitLeaveRequest(
  raw: unknown,
): Promise<Result<{ id: string; balanceWarning: boolean }>> {
  const actor = await getActor();
  if (isErr(actor)) return actor;

  const parsed = submitLeaveSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const input = parsed.data;

  // 締め済み期間には申請不可
  const closed = await assertPeriodOpen(
    eachDateStr(input.startDate, input.endDate),
  );
  if (closed) return closed;

  // 期間重複（PENDING / APPROVED）
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      userId: actor.id,
      kind: "TAKE",
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateOnlyUtc(input.endDate) },
      endDate: { gte: dateOnlyUtc(input.startDate) },
    },
  });
  if (overlap) return errWithDefault("LEAVE_OVERLAP");

  // 残数警告（PAID のみ）。不足でも提出は許可（ADMIN が判断）。
  let balanceWarning = false;
  if (input.type === "PAID") {
    const flags = await workdayFlags(actor.id, input.startDate, input.endDate);
    const days = countLeaveDays(flags, input.dayPart);
    const balance = await getLeaveBalance(actor.id, input.endDate);
    balanceWarning = days > balance;
  }

  const created = await prisma.leaveRequest.create({
    data: {
      userId: actor.id,
      kind: "TAKE",
      type: input.type,
      startDate: dateOnlyUtc(input.startDate),
      endDate: dateOnlyUtc(input.endDate),
      dayPart: input.dayPart,
      reason: input.reason,
      status: "PENDING",
    },
  });
  return ok({ id: created.id, balanceWarning });
}

export async function cancelLeaveRequest(requestId: string): Promise<Result> {
  const actor = await getActor();
  if (isErr(actor)) return actor;

  const req = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
  });
  if (!req || req.userId !== actor.id) return errWithDefault("NOT_FOUND");
  if (!canTransition(req.status, "CANCEL")) return errWithDefault("CONFLICT");

  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: "CANCELED" },
  });
  return ok(undefined);
}

export async function submitLeaveCancellation(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const actor = await getActor();
  if (isErr(actor)) return actor;

  const parsed = leaveCancellationSchema.safeParse(raw);
  if (!parsed.success) return errWithDefault("VALIDATION");

  const orig = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!orig || orig.userId !== actor.id) return errWithDefault("NOT_FOUND");
  if (orig.status !== "APPROVED" || orig.kind !== "TAKE") {
    return errWithDefault("CONFLICT", "承認済みの休暇のみ取消申請できます");
  }
  if (orig.supersededById) {
    return errWithDefault("CONFLICT", "すでに取消申請中です");
  }
  const closed = await assertPeriodOpen([
    dateOnlyStr(orig.startDate),
    dateOnlyStr(orig.endDate),
  ]);
  if (closed) return closed;

  const created = await prisma.leaveRequest.create({
    data: {
      userId: actor.id,
      kind: "CANCELLATION",
      type: orig.type,
      startDate: orig.startDate,
      endDate: orig.endDate,
      dayPart: orig.dayPart,
      reason: parsed.data.reason,
      status: "PENDING",
    },
  });
  await prisma.leaveRequest.update({
    where: { id: orig.id },
    data: { supersededById: created.id },
  });
  return ok({ id: created.id });
}

// ---- 承認 ----

export async function approveLeave(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return errWithDefault("VALIDATION");

  const req = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!req) return errWithDefault("NOT_FOUND");
  if (req.userId === actor.id) return errWithDefault("SELF_APPROVAL");
  if (!canTransition(req.status, "APPROVE")) return errWithDefault("CONFLICT");

  const startStr = dateOnlyStr(req.startDate);
  const endStr = dateOnlyStr(req.endDate);
  if (req.kind === "CANCELLATION") {
    return approveLeaveCancellationInternal(actor.id, req, parsed.data.comment);
  }

  const closed = await assertPeriodOpen(eachDateStr(startStr, endStr));
  if (closed) return periodClosedForAdmin();

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: "APPROVED",
        approverId: actor.id,
        decidedAt: new Date(),
        decisionComment: parsed.data.comment ?? null,
      },
    });

    if (req.type === "PAID") {
      const flags = await workdayFlags(req.userId, startStr, endStr, tx);
      const days = countLeaveDays(flags, req.dayPart);
      if (days > 0) {
        const grants = await tx.leaveGrant.findMany({
          where: { userId: req.userId },
          include: { ledgers: true },
        });
        const lots: GrantLot[] = grants.map((g) => ({
          grantId: g.id,
          expiryDate: dateOnlyStr(g.expiryDate),
          grantDate: dateOnlyStr(g.grantDate),
          remainingDays:
            Number(g.grantedDays) +
            g.ledgers
              .filter((l) => l.grantId === g.id && l.kind !== "GRANT")
              .reduce((s, l) => s + Number(l.days), 0),
        }));
        const { plan } = planFifoConsumption(lots, days);
        for (const p of plan) {
          await tx.leaveLedger.create({
            data: {
              userId: req.userId,
              kind: "CONSUME",
              days: -p.days,
              effectiveDate: req.startDate,
              grantId: p.grantId,
              leaveRequestId: req.id,
            },
          });
        }
      }
    }

    await recordAudit(tx, {
      actorId: actor.id,
      action: "APPROVE",
      targetType: "LeaveRequest",
      targetId: req.id,
      subjectUserId: req.userId,
      after: { status: "APPROVED", type: req.type, dayPart: req.dayPart },
      comment: parsed.data.comment ?? null,
    });
  });

  await recomputeUserRange(req.userId, startStr, endStr);
  return ok(undefined);
}

async function approveLeaveCancellationInternal(
  actorId: string,
  req: { id: string; userId: string; startDate: Date; endDate: Date },
  comment: string | undefined,
): Promise<Result> {
  const startStr = dateOnlyStr(req.startDate);
  const endStr = dateOnlyStr(req.endDate);
  const closed = await assertPeriodOpen(eachDateStr(startStr, endStr));
  if (closed) return periodClosedForAdmin();

  await prisma.$transaction(async (tx) => {
    const orig = await tx.leaveRequest.findFirst({
      where: { supersededById: req.id },
    });
    await tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: "APPROVED",
        approverId: actorId,
        decidedAt: new Date(),
        decisionComment: comment ?? null,
      },
    });
    if (orig) {
      await tx.leaveRequest.update({
        where: { id: orig.id },
        data: { status: "CANCELED" },
      });
      // 元申請が生んだ CONSUME を ADJUST(+) で打ち消す
      const consumes = await tx.leaveLedger.findMany({
        where: { leaveRequestId: orig.id, kind: "CONSUME" },
      });
      for (const c of consumes) {
        await tx.leaveLedger.create({
          data: {
            userId: req.userId,
            kind: "ADJUST",
            days: -Number(c.days), // CONSUME は負値なので +へ戻る
            effectiveDate: req.startDate,
            grantId: c.grantId,
            leaveRequestId: req.id,
            note: "休暇取消による戻し",
          },
        });
      }
    }
    await recordAudit(tx, {
      actorId,
      action: "APPROVE",
      targetType: "LeaveRequest",
      targetId: req.id,
      subjectUserId: req.userId,
      after: { status: "APPROVED", kind: "CANCELLATION" },
      comment: comment ?? null,
    });
  });

  await recomputeUserRange(req.userId, startStr, endStr);
  return ok(undefined);
}

export async function rejectLeave(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = rejectSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }

  const req = await prisma.leaveRequest.findUnique({
    where: { id: parsed.data.requestId },
  });
  if (!req) return errWithDefault("NOT_FOUND");
  if (req.userId === actor.id) return errWithDefault("SELF_APPROVAL");
  if (!canTransition(req.status, "REJECT")) return errWithDefault("CONFLICT");

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: "REJECTED",
        approverId: actor.id,
        decidedAt: new Date(),
        decisionComment: parsed.data.comment,
      },
    });
    if (req.kind === "CANCELLATION") {
      // 取消申請を却下 → 元申請の supersededById を外す
      await tx.leaveRequest.updateMany({
        where: { supersededById: req.id },
        data: { supersededById: null },
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "REJECT",
      targetType: "LeaveRequest",
      targetId: req.id,
      subjectUserId: req.userId,
      comment: parsed.data.comment,
    });
  });
  return ok(undefined);
}

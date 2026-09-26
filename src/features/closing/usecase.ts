import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc } from "@/lib/datetime";
import { ok, errWithDefault, type Result } from "@/lib/result";
import { fieldErrors } from "@/lib/zod";
import { recordAudit } from "@/lib/audit";
import { getAdminActor, isErr, requireAdmin } from "@/features/auth/rbac";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { recomputeMonth } from "@/features/aggregation/usecase";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import {
  periodActionSchema,
  reopenSchema,
} from "@/features/admin/master-schema";

export type PeriodSummary = {
  periodStart: string;
  periodEnd: string;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
};

/** 直近 N 期間ぶんの締めステータス（ref 日を含む期間から過去へ）。 */
export async function listPeriods(count = 6): Promise<PeriodSummary[]> {
  const rule = await getDefaultWorkRule();
  const out: PeriodSummary[] = [];
  let cursor = dateOnlyStr(new Date());
  for (let i = 0; i < count; i++) {
    const { startStr, endStr } = periodRangeFor(cursor, rule.closingDay);
    const rec = await prisma.closingPeriod.findUnique({
      where: { periodStart: dateOnlyUtc(startStr) },
    });
    out.push({
      periodStart: startStr,
      periodEnd: endStr,
      status: rec?.status ?? "OPEN",
      closedAt: rec?.closedAt ? rec.closedAt.toISOString() : null,
    });
    // 前の期間へ：開始日の 1 日前を基準に
    const prev = dateOnlyUtc(startStr);
    prev.setUTCDate(prev.getUTCDate() - 1);
    cursor = prev.toISOString().slice(0, 10);
  }
  return out;
}

export type ClosingPrecheck = {
  periodStart: string;
  periodEnd: string;
  pendingCorrections: number;
  pendingLeaves: number;
  flaggedDays: number;
  usersMissingClock: { name: string; employeeCode: string; days: number }[];
};

export async function getClosingPrecheck(
  periodStart: string,
): Promise<ClosingPrecheck> {
  await requireAdmin(); // 全ユーザーの打刻漏れを集約するため二重ガード
  const rule = await getDefaultWorkRule();
  const { startStr, endStr } = periodRangeFor(periodStart, rule.closingDay);
  const from = dateOnlyUtc(startStr);
  const to = dateOnlyUtc(endStr);

  const [pendingCorrections, pendingLeaves, summaries] = await Promise.all([
    prisma.correctionRequest.count({
      where: { status: "PENDING", targetDate: { gte: from, lte: to } },
    }),
    prisma.leaveRequest.count({
      where: {
        status: "PENDING",
        startDate: { lte: to },
        endDate: { gte: from },
      },
    }),
    prisma.dailySummary.findMany({
      where: { workDate: { gte: from, lte: to } },
      include: { user: { select: { name: true, employeeCode: true } } },
    }),
  ]);

  let flaggedDays = 0;
  const missing = new Map<
    string,
    { name: string; code: string; days: number }
  >();
  for (const s of summaries) {
    const flags = (s.flags as string[]) ?? [];
    if (flags.length > 0) flaggedDays++;
    if (
      flags.includes("MISSING_CLOCK_IN") ||
      flags.includes("MISSING_CLOCK_OUT")
    ) {
      const key = s.userId;
      const cur = missing.get(key) ?? {
        name: s.user.name,
        code: s.user.employeeCode,
        days: 0,
      };
      cur.days++;
      missing.set(key, cur);
    }
  }

  return {
    periodStart: startStr,
    periodEnd: endStr,
    pendingCorrections,
    pendingLeaves,
    flaggedDays,
    usersMissingClock: [...missing.values()].map((m) => ({
      name: m.name,
      employeeCode: m.code,
      days: m.days,
    })),
  };
}

export async function closePeriod(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = periodActionSchema.safeParse(raw);
  if (!parsed.success) return errWithDefault("VALIDATION");

  const rule = await getDefaultWorkRule();
  const { startStr, endStr } = periodRangeFor(
    parsed.data.periodStart,
    rule.closingDay,
  );
  const periodStart = dateOnlyUtc(startStr);

  const existing = await prisma.closingPeriod.findUnique({
    where: { periodStart },
  });
  if (existing?.status === "CLOSED") {
    return errWithDefault("CONFLICT", "この期間は既に締め済みです");
  }

  // 全ユーザーの当該期間 MonthlyAggregate を確定計算
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    await recomputeMonth(u.id, startStr);
  }

  await prisma.$transaction(async (tx) => {
    const period = await tx.closingPeriod.upsert({
      where: { periodStart },
      create: {
        periodStart,
        periodEnd: dateOnlyUtc(endStr),
        status: "CLOSED",
        closedById: actor.id,
        closedAt: new Date(),
        note: parsed.data.reason ?? null,
      },
      update: {
        status: "CLOSED",
        closedById: actor.id,
        closedAt: new Date(),
        reopenedById: null,
        reopenedAt: null,
        note: parsed.data.reason ?? null,
      },
    });
    // 期間内の DailySummary に closingPeriodId を紐付け
    await tx.dailySummary.updateMany({
      where: {
        workDate: { gte: periodStart, lte: dateOnlyUtc(endStr) },
        closingPeriodId: null,
      },
      data: { closingPeriodId: period.id },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "CLOSE",
      targetType: "ClosingPeriod",
      targetId: startStr,
      after: { periodStart: startStr, periodEnd: endStr },
      comment: parsed.data.reason ?? null,
    });
  });
  return ok(undefined);
}

export async function reopenPeriod(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = reopenSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }

  const rule = await getDefaultWorkRule();
  const { startStr } = periodRangeFor(parsed.data.periodStart, rule.closingDay);
  const periodStart = dateOnlyUtc(startStr);

  const period = await prisma.closingPeriod.findUnique({
    where: { periodStart },
  });
  if (!period || period.status !== "CLOSED") {
    return errWithDefault("CONFLICT", "締め済みの期間ではありません");
  }

  await prisma.$transaction(async (tx) => {
    await tx.closingPeriod.update({
      where: { periodStart },
      data: {
        status: "OPEN",
        reopenedById: actor.id,
        reopenedAt: new Date(),
        note: parsed.data.reason,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "REOPEN",
      targetType: "ClosingPeriod",
      targetId: startStr,
      comment: parsed.data.reason,
    });
  });
  return ok(undefined);
}

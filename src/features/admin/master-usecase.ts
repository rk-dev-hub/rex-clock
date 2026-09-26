import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc } from "@/lib/datetime";
import { eachDateStr } from "@/lib/date-range";
import { ok, errWithDefault, type Result } from "@/lib/result";
import { fieldErrors } from "@/lib/zod";
import { recordAudit } from "@/lib/audit";
import { getAdminActor, isErr } from "@/features/auth/rbac";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { recomputeUserRange } from "@/features/aggregation/usecase";
import {
  updateWorkRuleSchema,
  upsertPatternSchema,
  overrideCalendarSchema,
  addLeaveGrantSchema,
  adjustLedgerSchema,
  recomputeRangeSchema,
} from "@/features/admin/master-schema";

// ---- 就業規則 ----

export async function updateWorkRule(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = updateWorkRuleSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const d = parsed.data;
  const rule = await getDefaultWorkRule();
  const weekdays = [
    ...new Set(
      d.prescribedHolidayWeekdays
        .split(",")
        .map((x) => Number.parseInt(x.trim(), 10)),
    ),
  ].sort();

  const before = {
    standardDailyMinutes: rule.standardDailyMinutes,
    closingDay: rule.closingDay,
    weekStartsOn: rule.weekStartsOn,
    overtimeRatePct: rule.overtimeRatePct,
    nightRatePct: rule.nightRatePct,
    legalHolidayRatePct: rule.legalHolidayRatePct,
    over60hRatePct: rule.over60hRatePct,
    nightStart: rule.nightStart,
    nightEnd: rule.nightEnd,
    breakPolicy: rule.breakPolicy,
    legalHolidayWeekday: rule.legalHolidayWeekday,
    prescribedHolidayWeekdays: rule.prescribedHolidayWeekdays,
  };
  const after = {
    standardDailyMinutes: d.standardDailyMinutes,
    closingDay: d.closingDay,
    weekStartsOn: d.weekStartsOn,
    overtimeRatePct: d.overtimeRatePct,
    nightRatePct: d.nightRatePct,
    legalHolidayRatePct: d.legalHolidayRatePct,
    over60hRatePct: d.over60hRatePct,
    nightStart: d.nightStart,
    nightEnd: d.nightEnd,
    breakPolicy: d.breakPolicy,
    legalHolidayWeekday: d.legalHolidayWeekday,
    prescribedHolidayWeekdays: weekdays,
  };

  await prisma.$transaction(async (tx) => {
    await tx.workRule.update({ where: { id: rule.id }, data: after });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MASTER_CHANGE",
      targetType: "WorkRule",
      targetId: rule.id,
      before,
      after,
      comment: "就業規則の更新（再計算は明示操作）",
    });
  });
  return ok(undefined);
}

// ---- 勤務パターン ----

export async function upsertWorkPattern(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = upsertPatternSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const { patternId, name, days } = parsed.data;
  const pattern = await prisma.workPattern.findUnique({
    where: { id: patternId },
    include: { days: true },
  });
  if (!pattern) return errWithDefault("NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    await tx.workPattern.update({ where: { id: patternId }, data: { name } });
    for (const day of days) {
      await tx.workPatternDay.upsert({
        where: {
          workPatternId_weekday: {
            workPatternId: patternId,
            weekday: day.weekday,
          },
        },
        create: { workPatternId: patternId, ...day },
        update: { ...day },
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MASTER_CHANGE",
      targetType: "WorkPattern",
      targetId: patternId,
      before: { name: pattern.name, days: pattern.days },
      after: { name, days },
    });
  });
  return ok(undefined);
}

// ---- 休日カレンダー ----

export async function importHolidays(): Promise<Result<{ count: number }>> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const raw = await readFile(
    resolve(process.cwd(), "data/holidays.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as {
    holidays: { date: string; name: string }[];
  };
  const target = parsed.holidays.filter((h) => h.date >= "2020-01-01");

  await prisma.$transaction(async (tx) => {
    for (const h of target) {
      const date = dateOnlyUtc(h.date);
      await tx.holiday.upsert({
        where: { date },
        update: { name: h.name, source: "BUILTIN" },
        create: { date, name: h.name, source: "BUILTIN" },
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MASTER_CHANGE",
      targetType: "Holiday",
      after: { imported: target.length },
      comment: "内蔵祝日データの取込",
    });
  });
  return ok({ count: target.length });
}

export async function overrideCalendarDay(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = overrideCalendarSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const d = parsed.data;
  const rule = await getDefaultWorkRule();
  const date = dateOnlyUtc(d.date);

  const before = await prisma.calendarDay.findUnique({
    where: { workRuleId_date: { workRuleId: rule.id, date } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.calendarDay.upsert({
      where: { workRuleId_date: { workRuleId: rule.id, date } },
      create: {
        workRuleId: rule.id,
        date,
        dayType: d.dayType,
        isHoliday: d.isHoliday,
        label: d.label || null,
        overrideReason: d.overrideReason,
      },
      update: {
        dayType: d.dayType,
        isHoliday: d.isHoliday,
        label: d.label || null,
        overrideReason: d.overrideReason,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MASTER_CHANGE",
      targetType: "CalendarDay",
      targetId: d.date,
      before: before
        ? { dayType: before.dayType, isHoliday: before.isHoliday }
        : null,
      after: { dayType: d.dayType, isHoliday: d.isHoliday },
      comment: d.overrideReason,
    });
  });

  // 影響日を含む週・期間を再計算（全ユーザー）
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    await recomputeUserRange(u.id, d.date, d.date);
  }
  return ok(undefined);
}

// ---- 有給付与 ----

export async function addLeaveGrant(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = addLeaveGrantSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const d = parsed.data;
  const target = await prisma.user.findUnique({ where: { id: d.userId } });
  if (!target) return errWithDefault("NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    const grant = await tx.leaveGrant.create({
      data: {
        userId: d.userId,
        grantedDays: d.grantedDays.toFixed(1),
        grantDate: dateOnlyUtc(d.grantDate),
        expiryDate: dateOnlyUtc(d.expiryDate),
        reason: d.reason,
        createdById: actor.id,
      },
    });
    await tx.leaveLedger.create({
      data: {
        userId: d.userId,
        kind: "GRANT",
        days: d.grantedDays.toFixed(1),
        effectiveDate: dateOnlyUtc(d.grantDate),
        grantId: grant.id,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "LEAVE_GRANT",
      targetType: "LeaveGrant",
      targetId: grant.id,
      subjectUserId: d.userId,
      after: { grantedDays: d.grantedDays, expiryDate: d.expiryDate },
      comment: d.reason,
    });
  });
  return ok(undefined);
}

export async function adjustLeaveLedger(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = adjustLedgerSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const d = parsed.data;
  const target = await prisma.user.findUnique({ where: { id: d.userId } });
  if (!target) return errWithDefault("NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    const row = await tx.leaveLedger.create({
      data: {
        userId: d.userId,
        kind: "ADJUST",
        days: d.days.toFixed(1),
        effectiveDate: dateOnlyUtc(d.effectiveDate),
        note: d.note,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "LEAVE_GRANT",
      targetType: "LeaveLedger",
      targetId: row.id,
      subjectUserId: d.userId,
      after: { days: d.days },
      comment: d.note,
    });
  });
  return ok(undefined);
}

// ---- 再計算 ----

export async function recomputeRange(
  raw: unknown,
): Promise<Result<{ users: number; days: number }>> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = recomputeRangeSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const { from, to, userId } = parsed.data;
  const users = userId
    ? [{ id: userId }]
    : await prisma.user.findMany({ select: { id: true } });

  for (const u of users) {
    await recomputeUserRange(u.id, from, to);
  }
  return ok({ users: users.length, days: eachDateStr(from, to).length });
}

// ---- 監査ログ閲覧 ----

const AUDIT_ACTIONS = new Set<AuditAction>([
  "CLOCK_EDIT",
  "APPROVE",
  "REJECT",
  "CLOSE",
  "REOPEN",
  "USER_CREATE",
  "USER_DISABLE",
  "PASSWORD_RESET",
  "MASTER_CHANGE",
  "LEAVE_GRANT",
]);

export async function listAuditLogs(opts: {
  action?: string;
  subjectUserId?: string;
  limit?: number;
}) {
  const action =
    opts.action && AUDIT_ACTIONS.has(opts.action as AuditAction)
      ? (opts.action as AuditAction)
      : undefined;
  return prisma.auditLog.findMany({
    where: {
      action,
      subjectUserId: opts.subjectUserId || undefined,
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 200,
    include: {
      actor: { select: { name: true, employeeCode: true } },
      subjectUser: { select: { name: true, employeeCode: true } },
    },
  });
}

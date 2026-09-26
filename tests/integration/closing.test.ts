import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionHolder, fakeSession } from "./helpers";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc } from "@/lib/datetime";
import {
  closePeriod,
  reopenPeriod,
  getClosingPrecheck,
} from "@/features/closing/usecase";
import { punch } from "@/features/time-clock/usecase";
import { submitLeaveRequest } from "@/features/leave/usecase";
import { updateWorkRule } from "@/features/admin/master-usecase";

const EMP = "close-it-emp@example.test";
const ADM = "close-it-adm@example.test";
let empId = "";
let admId = "";

// 2026-12 は closingDay=31 → 期間 2026-12-01..2026-12-31
const PERIOD_START = "2026-12-01";
const DAY_IN = "2026-12-10";

async function reset() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMP, ADM] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.timeClockEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.dailySummary.deleteMany({ where: { userId: { in: ids } } });
    await prisma.monthlyAggregate.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.leaveRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: ids } }, { subjectUserId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.closingPeriod.deleteMany({
    where: { periodStart: dateOnlyUtc(PERIOD_START) },
  });
}

beforeAll(async () => {
  const pattern = await prisma.workPattern.findFirstOrThrow({
    where: { isDefault: true },
  });
  await reset();
  const emp = await prisma.user.create({
    data: {
      employeeCode: "ITX-E",
      email: EMP,
      name: "締め 太郎",
      passwordHash: "x",
      role: "EMPLOYEE",
      hireDate: dateOnlyUtc("2024-04-01"),
      workPatternId: pattern.id,
      mustChangePassword: false,
    },
  });
  const adm = await prisma.user.create({
    data: {
      employeeCode: "ITX-A",
      email: ADM,
      name: "承認 花子",
      passwordHash: "x",
      role: "ADMIN",
      hireDate: dateOnlyUtc("2023-04-01"),
      workPatternId: pattern.id,
      mustChangePassword: false,
    },
  });
  empId = emp.id;
  admId = adm.id;

  // 期間内に出勤打刻（退勤漏れ = フラグを作る）。
  // punch() は occurredAt に現在時刻を使うため、fixture も現在時刻で作り
  // イベントの時系列を一致させる（businessDate だけ対象期間にずらす）。
  await prisma.timeClockEvent.create({
    data: {
      userId: empId,
      type: "CLOCK_IN",
      occurredAt: new Date(),
      businessDate: dateOnlyUtc(DAY_IN),
      source: "SELF",
      createdById: empId,
    },
  });
});

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("月次締め", () => {
  it("事前チェックで打刻漏れが検出される", async () => {
    // 先に日次を作るため recompute 経由の punch を1回
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    // すでに CLOCK_IN 済みなので BREAK_START を打ってサマリ生成
    await punch("BREAK_START");

    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const pc = await getClosingPrecheck(PERIOD_START);
    expect(pc.periodStart).toBe(PERIOD_START);
    expect(pc.usersMissingClock.length).toBeGreaterThanOrEqual(1);
  });

  it("EMPLOYEE は事前チェックを実行できない", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    await expect(getClosingPrecheck(PERIOD_START)).rejects.toThrow();
  });

  it("ADMIN が締められる／二重締めは CONFLICT", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await closePeriod({ periodStart: PERIOD_START });
    expect(r.ok).toBe(true);

    const rec = await prisma.closingPeriod.findUniqueOrThrow({
      where: { periodStart: dateOnlyUtc(PERIOD_START) },
    });
    expect(rec.status).toBe("CLOSED");
    expect(rec.closedById).toBe(admId);

    const again = await closePeriod({ periodStart: PERIOD_START });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("CONFLICT");

    // 監査ログ
    const audit = await prisma.auditLog.findFirst({
      where: { action: "CLOSE", targetId: PERIOD_START },
    });
    expect(audit).toBeTruthy();
  });

  it("締め済み期間への打刻は PERIOD_CLOSED", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await punch("BREAK_END");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PERIOD_CLOSED");
  });

  it("締め済み期間への休暇申請も PERIOD_CLOSED", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await submitLeaveRequest({
      type: "PAID",
      startDate: DAY_IN,
      endDate: DAY_IN,
      dayPart: "FULL",
      reason: "締め後",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PERIOD_CLOSED");
  });

  it("再オープンは理由必須・状態が OPEN に戻る", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    expect((await reopenPeriod({ periodStart: PERIOD_START })).ok).toBe(false);

    const r = await reopenPeriod({
      periodStart: PERIOD_START,
      reason: "打刻漏れ修正のため",
    });
    expect(r.ok).toBe(true);
    const rec = await prisma.closingPeriod.findUniqueOrThrow({
      where: { periodStart: dateOnlyUtc(PERIOD_START) },
    });
    expect(rec.status).toBe("OPEN");
    expect(rec.reopenedById).toBe(admId);

    // 再オープン後は打刻できる
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    expect((await punch("BREAK_END")).ok).toBe(true);
  });
});

describe("就業規則の変更は監査に残り、再計算するまで既存データに影響しない", () => {
  it("updateWorkRule は before/after を監査ログに記録", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const rule = await prisma.workRule.findFirstOrThrow({
      where: { isDefault: true },
    });
    const r = await updateWorkRule({
      standardDailyMinutes: rule.standardDailyMinutes,
      closingDay: rule.closingDay,
      weekStartsOn: rule.weekStartsOn,
      overtimeRatePct: rule.overtimeRatePct,
      nightRatePct: rule.nightRatePct,
      legalHolidayRatePct: rule.legalHolidayRatePct,
      over60hRatePct: rule.over60hRatePct,
      nightStart: "23:00", // 変更
      nightEnd: rule.nightEnd,
      breakPolicy: rule.breakPolicy,
      legalHolidayWeekday: rule.legalHolidayWeekday,
      prescribedHolidayWeekdays: rule.prescribedHolidayWeekdays.join(","),
    });
    expect(r.ok).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "MASTER_CHANGE", targetType: "WorkRule" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect((audit!.after as { nightStart: string }).nightStart).toBe("23:00");

    // 後始末: 戻す
    await updateWorkRule({
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
      prescribedHolidayWeekdays: rule.prescribedHolidayWeekdays.join(","),
    });
  });
});

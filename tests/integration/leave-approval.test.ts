import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionHolder, fakeSession } from "./helpers";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc } from "@/lib/datetime";
import {
  submitLeaveRequest,
  approveLeave,
  rejectLeave,
  getLeaveBalance,
  submitLeaveCancellation,
} from "@/features/leave/usecase";

const EMP = "leave-it-emp@example.test";
const ADM = "leave-it-adm@example.test";

let empId = "";
let admId = "";
let patternId = "";

async function reset() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMP, ADM] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.leaveLedger.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leaveGrant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leaveRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.dailySummary.deleteMany({ where: { userId: { in: ids } } });
    await prisma.monthlyAggregate.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ actorId: { in: ids } }, { subjectUserId: { in: ids } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  const pattern = await prisma.workPattern.findFirstOrThrow({
    where: { isDefault: true },
  });
  patternId = pattern.id;
  await reset();

  const emp = await prisma.user.create({
    data: {
      employeeCode: "ITL-E",
      email: EMP,
      name: "休暇 太郎",
      passwordHash: "x",
      role: "EMPLOYEE",
      hireDate: dateOnlyUtc("2024-04-01"),
      workPatternId: patternId,
      mustChangePassword: false,
    },
  });
  const adm = await prisma.user.create({
    data: {
      employeeCode: "ITL-A",
      email: ADM,
      name: "承認 花子",
      passwordHash: "x",
      role: "ADMIN",
      hireDate: dateOnlyUtc("2023-04-01"),
      workPatternId: patternId,
      mustChangePassword: false,
    },
  });
  empId = emp.id;
  admId = adm.id;

  // 有給 2 ロット（失効が近い順に消化されるか）
  const g1 = await prisma.leaveGrant.create({
    data: {
      userId: empId,
      grantedDays: "2.0",
      grantDate: dateOnlyUtc("2024-10-01"),
      expiryDate: dateOnlyUtc("2026-09-30"),
      reason: "lot1",
      createdById: admId,
    },
  });
  await prisma.leaveLedger.create({
    data: {
      userId: empId,
      kind: "GRANT",
      days: "2.0",
      effectiveDate: g1.grantDate,
      grantId: g1.id,
    },
  });
  const g2 = await prisma.leaveGrant.create({
    data: {
      userId: empId,
      grantedDays: "10.0",
      grantDate: dateOnlyUtc("2025-10-01"),
      expiryDate: dateOnlyUtc("2027-09-30"),
      reason: "lot2",
      createdById: admId,
    },
  });
  await prisma.leaveLedger.create({
    data: {
      userId: empId,
      kind: "GRANT",
      days: "10.0",
      effectiveDate: g2.grantDate,
      grantId: g2.id,
    },
  });
});

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("休暇申請 → 承認 → 消化 → 取消", () => {
  // 平日 3 日（月〜水）
  const start = "2026-11-16";
  const end = "2026-11-18";

  it("残数は初期 12 日", async () => {
    expect(await getLeaveBalance(empId, "2026-12-31")).toBe(12);
  });

  it("従業員が有給 3 日を申請できる", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await submitLeaveRequest({
      type: "PAID",
      startDate: start,
      endDate: end,
      dayPart: "FULL",
      reason: "私用",
    });
    expect(r.ok).toBe(true);
  });

  it("重複期間の申請は LEAVE_OVERLAP", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await submitLeaveRequest({
      type: "PAID",
      startDate: "2026-11-17",
      endDate: "2026-11-17",
      dayPart: "FULL",
      reason: "重複",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("LEAVE_OVERLAP");
  });

  it("本人は自分の申請を承認できない（SELF_APPROVAL）", async () => {
    const req = await prisma.leaveRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: empId, role: "ADMIN" });
    const r = await approveLeave({ requestId: req.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SELF_APPROVAL");
  });

  it("ADMIN が承認 → FIFO 消化・日次サマリ反映", async () => {
    const req = await prisma.leaveRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await approveLeave({ requestId: req.id, comment: "OK" });
    expect(r.ok).toBe(true);

    // 残 9（12 - 3）
    expect(await getLeaveBalance(empId, "2026-12-31")).toBe(9);

    // 失効が近い lot1(2日) を先に消化
    const consumes = await prisma.leaveLedger.findMany({
      where: { userId: empId, kind: "CONSUME" },
      include: { grant: true },
    });
    const byLot = consumes
      .map((c) => ({
        exp: dateOnlyStr(c.grant!.expiryDate),
        d: Number(c.days),
      }))
      .sort((a, b) => a.exp.localeCompare(b.exp));
    expect(byLot).toEqual([
      { exp: "2026-09-30", d: -2 },
      { exp: "2027-09-30", d: -1 },
    ]);

    // 日次サマリに休暇が反映
    const summaries = await prisma.dailySummary.findMany({
      where: {
        userId: empId,
        workDate: {
          gte: dateOnlyUtc(start),
          lte: dateOnlyUtc(end),
        },
      },
    });
    expect(summaries).toHaveLength(3);
    expect(summaries.every((s) => s.leaveType === "PAID")).toBe(true);
    expect(summaries.every((s) => s.paidLeaveCountedMinutes === 480)).toBe(
      true,
    );

    // 監査ログ
    const audit = await prisma.auditLog.findFirst({
      where: {
        targetType: "LeaveRequest",
        targetId: req.id,
        action: "APPROVE",
      },
    });
    expect(audit).toBeTruthy();
  });

  it("承認済みに対する取消申請 → 承認で消化が戻る", async () => {
    const approved = await prisma.leaveRequest.findFirstOrThrow({
      where: { userId: empId, kind: "TAKE", status: "APPROVED" },
    });
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const c = await submitLeaveCancellation({
      requestId: approved.id,
      reason: "予定変更",
    });
    expect(c.ok).toBe(true);

    const cancelReq = await prisma.leaveRequest.findFirstOrThrow({
      where: { userId: empId, kind: "CANCELLATION", status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await approveLeave({ requestId: cancelReq.id });
    expect(r.ok).toBe(true);

    // 残数が 12 に戻る
    expect(await getLeaveBalance(empId, "2026-12-31")).toBe(12);
    // 元申請は CANCELED
    const orig = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: approved.id },
    });
    expect(orig.status).toBe("CANCELED");
    // 日次サマリの休暇が消える
    const summaries = await prisma.dailySummary.findMany({
      where: {
        userId: empId,
        workDate: { gte: dateOnlyUtc(start), lte: dateOnlyUtc(end) },
        leaveType: { not: null },
      },
    });
    expect(summaries).toHaveLength(0);
  });

  it("却下はコメント必須", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    await submitLeaveRequest({
      type: "PAID",
      startDate: "2026-12-07",
      endDate: "2026-12-07",
      dayPart: "AM",
      reason: "半休",
    });
    const req = await prisma.leaveRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });

    const noComment = await rejectLeave({ requestId: req.id });
    expect(noComment.ok).toBe(false);

    const ok = await rejectLeave({ requestId: req.id, comment: "却下理由" });
    expect(ok.ok).toBe(true);
    const after = await prisma.leaveRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    expect(after.status).toBe("REJECTED");
    expect(after.decisionComment).toBe("却下理由");
  });
});

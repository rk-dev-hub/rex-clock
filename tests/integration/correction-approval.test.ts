import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionHolder, fakeSession } from "./helpers";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc, jstDateTimeUtc } from "@/lib/datetime";
import {
  submitCorrection,
  approveCorrection,
  rejectCorrection,
  cancelCorrection,
} from "@/features/correction/usecase";
import { listPending } from "@/features/approval/usecase";

const EMP = "corr-it-emp@example.test";
const ADM = "corr-it-adm@example.test";
let empId = "";
let admId = "";

const DAY = "2026-11-24"; // 火曜（平日）

async function reset() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMP, ADM] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.correctionRequest.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.timeClockEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.dailySummary.deleteMany({ where: { userId: { in: ids } } });
    await prisma.monthlyAggregate.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: ids } }, { subjectUserId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  const pattern = await prisma.workPattern.findFirstOrThrow({
    where: { isDefault: true },
  });
  await reset();
  const emp = await prisma.user.create({
    data: {
      employeeCode: "ITC-E",
      email: EMP,
      name: "修正 太郎",
      passwordHash: "x",
      role: "EMPLOYEE",
      hireDate: dateOnlyUtc("2024-04-01"),
      workPatternId: pattern.id,
      mustChangePassword: false,
    },
  });
  const adm = await prisma.user.create({
    data: {
      employeeCode: "ITC-A",
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

  // 退勤打刻のみ欠落した状態を作る
  const bd = dateOnlyUtc(DAY);
  await prisma.timeClockEvent.createMany({
    data: [
      {
        userId: empId,
        type: "CLOCK_IN",
        occurredAt: jstDateTimeUtc(DAY, "09:00"),
        businessDate: bd,
        source: "SELF",
        createdById: empId,
      },
      {
        userId: empId,
        type: "BREAK_START",
        occurredAt: jstDateTimeUtc(DAY, "12:00"),
        businessDate: bd,
        source: "SELF",
        createdById: empId,
      },
      {
        userId: empId,
        type: "BREAK_END",
        occurredAt: jstDateTimeUtc(DAY, "13:00"),
        businessDate: bd,
        source: "SELF",
        createdById: empId,
      },
    ],
  });
});

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("打刻修正申請 → 承認で実データ反映", () => {
  it("従業員が退勤打刻の追加を申請できる", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await submitCorrection({
      targetDate: DAY,
      reason: "退勤打刻忘れ",
      lines: [{ op: "ADD", clockType: "CLOCK_OUT", time: "19:30" }],
    });
    expect(r.ok).toBe(true);
  });

  it("本人は承認できない（SELF_APPROVAL）", async () => {
    const req = await prisma.correctionRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: empId, role: "ADMIN" });
    const r = await approveCorrection({ requestId: req.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SELF_APPROVAL");
  });

  it("ADMIN 承認で CLOCK_OUT が追加され日次サマリが再計算される", async () => {
    const req = await prisma.correctionRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await approveCorrection({ requestId: req.id, comment: "確認済" });
    expect(r.ok).toBe(true);

    const events = await prisma.timeClockEvent.findMany({
      where: { userId: empId, canceled: false },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((e) => e.type)).toEqual([
      "CLOCK_IN",
      "BREAK_START",
      "BREAK_END",
      "CLOCK_OUT",
    ]);
    const out = events.find((e) => e.type === "CLOCK_OUT")!;
    expect(out.source).toBe("CORRECTION");
    expect(out.correctionRequestId).toBe(req.id);

    // 実働 = 09:00-19:30 拘束 630 - 休憩 60 = 570
    const summary = await prisma.dailySummary.findUniqueOrThrow({
      where: { userId_workDate: { userId: empId, workDate: dateOnlyUtc(DAY) } },
    });
    expect(summary.workedMinutes).toBe(570);
    expect((summary.flags as string[]).includes("MISSING_CLOCK_OUT")).toBe(
      false,
    );

    const audit = await prisma.auditLog.findFirst({
      where: {
        targetType: "CorrectionRequest",
        targetId: req.id,
        action: "APPROVE",
      },
    });
    expect(audit).toBeTruthy();
    expect((audit!.after as { events: unknown[] }).events).toHaveLength(4);
  });

  it("存在しないイベントを対象にした UPDATE 申請はバリデーションで弾かれる", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await submitCorrection({
      targetDate: DAY,
      reason: "不正",
      lines: [
        {
          op: "UPDATE",
          targetEventId: "00000000-0000-0000-0000-000000000000",
          clockType: "CLOCK_IN",
          time: "08:30",
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("却下はコメント必須・状態は REJECTED", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    await submitCorrection({
      targetDate: DAY,
      reason: "休憩終了修正",
      lines: [{ op: "ADD", clockType: "BREAK_END", time: "13:05" }],
    });
    const req = await prisma.correctionRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
    });
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    expect((await rejectCorrection({ requestId: req.id })).ok).toBe(false);
    expect(
      (await rejectCorrection({ requestId: req.id, comment: "不要" })).ok,
    ).toBe(true);
    const after = await prisma.correctionRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    expect(after.status).toBe("REJECTED");
  });

  it("取消済みの申請は承認待ち一覧から消え、承認/却下もできない", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    await submitCorrection({
      targetDate: DAY,
      reason: "取消確認用",
      lines: [{ op: "ADD", clockType: "BREAK_END", time: "13:10" }],
    });
    const req = await prisma.correctionRequest.findFirstOrThrow({
      where: { userId: empId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    const cancelResult = await cancelCorrection(req.id);
    expect(cancelResult.ok).toBe(true);
    const canceled = await prisma.correctionRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    expect(canceled.status).toBe("CANCELED");

    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const pending = await listPending();
    expect(pending.some((p) => p.id === req.id)).toBe(false);

    const approveResult = await approveCorrection({ requestId: req.id });
    expect(approveResult.ok).toBe(false);
    if (!approveResult.ok) expect(approveResult.error.code).toBe("CONFLICT");

    const rejectResult = await rejectCorrection({
      requestId: req.id,
      comment: "test",
    });
    expect(rejectResult.ok).toBe(false);
    if (!rejectResult.ok) expect(rejectResult.error.code).toBe("CONFLICT");
  });
});

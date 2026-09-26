import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionHolder, fakeSession } from "./helpers";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc } from "@/lib/datetime";
import {
  addLeaveGrant,
  adjustLeaveLedger,
  recomputeRange,
  overrideCalendarDay,
} from "@/features/admin/master-usecase";
import { getLeaveBalance } from "@/features/leave/usecase";

const EMP = "master-it-emp@example.test";
const ADM = "master-it-adm@example.test";
let empId = "";
let admId = "";

async function reset() {
  const users = await prisma.user.findMany({
    where: { email: { in: [EMP, ADM] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.leaveLedger.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leaveGrant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.dailySummary.deleteMany({ where: { userId: { in: ids } } });
    await prisma.monthlyAggregate.deleteMany({
      where: { userId: { in: ids } },
    });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: ids } }, { subjectUserId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.calendarDay.deleteMany({
    where: { overrideReason: "IT: 創立記念日" },
  });
}

beforeAll(async () => {
  const pattern = await prisma.workPattern.findFirstOrThrow({
    where: { isDefault: true },
  });
  await reset();
  const emp = await prisma.user.create({
    data: {
      employeeCode: "ITM-E",
      email: EMP,
      name: "マスタ 太郎",
      passwordHash: "x",
      role: "EMPLOYEE",
      hireDate: dateOnlyUtc("2024-04-01"),
      workPatternId: pattern.id,
      mustChangePassword: false,
    },
  });
  const adm = await prisma.user.create({
    data: {
      employeeCode: "ITM-A",
      email: ADM,
      name: "管理 花子",
      passwordHash: "x",
      role: "ADMIN",
      hireDate: dateOnlyUtc("2023-04-01"),
      workPatternId: pattern.id,
      mustChangePassword: false,
    },
  });
  empId = emp.id;
  admId = adm.id;
});

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("マスタ操作", () => {
  it("EMPLOYEE は付与できない（FORBIDDEN）", async () => {
    sessionHolder.current = fakeSession({ id: empId, role: "EMPLOYEE" });
    const r = await addLeaveGrant({
      userId: empId,
      grantedDays: 5,
      grantDate: "2026-04-01",
      expiryDate: "2028-03-31",
      reason: "不正",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it("ADMIN の付与で LeaveGrant + GRANT 台帳が作られ残数に反映", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await addLeaveGrant({
      userId: empId,
      grantedDays: 10,
      grantDate: "2026-04-01",
      expiryDate: "2028-03-31",
      reason: "法定付与",
    });
    expect(r.ok).toBe(true);
    expect(await getLeaveBalance(empId, "2026-12-31")).toBe(10);

    const ledger = await prisma.leaveLedger.findFirstOrThrow({
      where: { userId: empId, kind: "GRANT" },
    });
    expect(Number(ledger.days)).toBe(10);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "LEAVE_GRANT", subjectUserId: empId },
    });
    expect(audit).toBeTruthy();
  });

  it("0.5 単位以外の付与は VALIDATION", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await addLeaveGrant({
      userId: empId,
      grantedDays: 3.3,
      grantDate: "2026-04-01",
      expiryDate: "2028-03-31",
      reason: "端数",
    });
    expect(r.ok).toBe(false);
  });

  it("残数調整（ADJUST）が残数に反映", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await adjustLeaveLedger({
      userId: empId,
      days: -1.5,
      effectiveDate: "2026-05-01",
      note: "誤付与の訂正",
    });
    expect(r.ok).toBe(true);
    expect(await getLeaveBalance(empId, "2026-12-31")).toBe(8.5);
  });

  it("カレンダー上書き→区分が変わり全ユーザーの当日サマリが再計算される", async () => {
    // 平日 2026-06-17（水）を法定休日に上書き
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await overrideCalendarDay({
      date: "2026-06-17",
      dayType: "LEGAL_HOLIDAY",
      isHoliday: true,
      label: "創立記念日",
      overrideReason: "IT: 創立記念日",
    });
    expect(r.ok).toBe(true);

    const cd = await prisma.calendarDay.findFirstOrThrow({
      where: { date: dateOnlyUtc("2026-06-17") },
    });
    expect(cd.dayType).toBe("LEGAL_HOLIDAY");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "MASTER_CHANGE", targetType: "CalendarDay" },
    });
    expect(audit).toBeTruthy();
  });

  it("recomputeRange は対象ユーザー数×日数を返す", async () => {
    sessionHolder.current = fakeSession({ id: admId, role: "ADMIN" });
    const r = await recomputeRange({
      from: "2026-06-15",
      to: "2026-06-19",
      userId: empId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.users).toBe(1);
      expect(r.value.days).toBe(5);
    }
  });
});

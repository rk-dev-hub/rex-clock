import { describe, expect, it } from "vitest";
import {
  buildMonthlyAggregate,
  type MonthlyDay,
} from "@/features/aggregation/domain/monthly-aggregate";

function md(o: Partial<MonthlyDay> = {}): MonthlyDay {
  return {
    dateStr: o.dateStr ?? "2026-09-01",
    dayType: o.dayType ?? "WORKDAY",
    workedMinutes: o.workedMinutes ?? 0,
    breakMinutes: o.breakMinutes ?? 0,
    withinPrescribedMinutes: o.withinPrescribedMinutes ?? 0,
    withinStatutoryOtMinutes: o.withinStatutoryOtMinutes ?? 0,
    overStatutoryOtMinutes: o.overStatutoryOtMinutes ?? 0,
    nightMinutes: o.nightMinutes ?? 0,
    legalHolidayMinutes: o.legalHolidayMinutes ?? 0,
    lateMinutes: o.lateMinutes ?? 0,
    earlyLeaveMinutes: o.earlyLeaveMinutes ?? 0,
    paidLeaveCountedMinutes: o.paidLeaveCountedMinutes ?? 0,
    leaveType: o.leaveType ?? null,
    leaveDayPart: o.leaveDayPart ?? null,
  };
}

describe("buildMonthlyAggregate — docs/04 §5", () => {
  it("60h 超で 50% を切り出す", () => {
    // 法定外残業合計 = 4000 分（> 3600）
    const days = Array.from({ length: 20 }, (_, i) =>
      md({
        dateStr: `2026-09-${String(i + 1).padStart(2, "0")}`,
        workedMinutes: 680,
        overStatutoryOtMinutes: 200,
      }),
    );
    const r = buildMonthlyAggregate(days);
    expect(r.overtime25Minutes).toBe(3600);
    expect(r.overtime50Minutes).toBe(400);
  });

  it("60h 以下なら 50% は 0", () => {
    const days = [md({ overStatutoryOtMinutes: 3000, workedMinutes: 600 })];
    const r = buildMonthlyAggregate(days);
    expect(r.overtime25Minutes).toBe(3000);
    expect(r.overtime50Minutes).toBe(0);
  });

  it("日数・回数カウント", () => {
    const days = [
      md({ dateStr: "2026-09-01", workedMinutes: 480, lateMinutes: 15 }),
      md({ dateStr: "2026-09-02", workedMinutes: 500, earlyLeaveMinutes: 30 }),
      md({ dateStr: "2026-09-03", leaveType: "PAID", leaveDayPart: "FULL" }),
      md({
        dateStr: "2026-09-04",
        leaveType: "PAID",
        leaveDayPart: "AM",
        workedMinutes: 240,
      }),
      md({ dateStr: "2026-09-05", leaveType: "ABSENCE" }),
    ];
    const r = buildMonthlyAggregate(days);
    expect(r.workDays).toBe(3); // 01, 02, 04
    expect(r.absenceDays).toBe(1);
    expect(r.paidLeaveFullDays).toBe(1);
    expect(r.paidLeaveHalfDays).toBe(1);
    expect(r.lateCount).toBe(1);
    expect(r.lateMinutes).toBe(15);
    expect(r.earlyLeaveCount).toBe(1);
    expect(r.earlyLeaveMinutes).toBe(30);
  });

  it("空期間は全 0", () => {
    const r = buildMonthlyAggregate([]);
    expect(r.totalWorkedMinutes).toBe(0);
    expect(r.overtime25Minutes).toBe(0);
    expect(r.workDays).toBe(0);
  });

  it("有給みなし時間を合算する（全日=所定, 半休=所定/2）", () => {
    const days = [
      md({
        leaveType: "PAID",
        leaveDayPart: "FULL",
        paidLeaveCountedMinutes: 480,
      }),
      md({
        leaveType: "PAID",
        leaveDayPart: "AM",
        paidLeaveCountedMinutes: 240,
        workedMinutes: 240,
      }),
    ];
    const r = buildMonthlyAggregate(days);
    expect(r.paidLeaveMinutes).toBe(720);
  });

  it("60h 超判定は週次昇格分も含めた overStatutoryOt 合計で行う", () => {
    const days = Array.from({ length: 6 }, (_, i) =>
      md({
        dateStr: `2026-09-${String(i + 7).padStart(2, "0")}`,
        workedMinutes: 600,
        overStatutoryOtMinutes: 620,
      }),
    );
    const r = buildMonthlyAggregate(days); // 6 × 620 = 3720
    expect(r.overtime50Minutes).toBe(120);
    expect(r.overtime25Minutes).toBe(3600);
  });
});

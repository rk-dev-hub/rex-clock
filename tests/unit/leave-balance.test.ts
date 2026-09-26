import { describe, expect, it } from "vitest";
import {
  computeBalance,
  planFifoConsumption,
  type GrantLot,
  type LedgerEntry,
} from "@/features/leave/domain/balance";
import { countLeaveDays } from "@/features/leave/domain/leave-days";

describe("computeBalance", () => {
  const entries: LedgerEntry[] = [
    { kind: "GRANT", days: 10, effectiveDate: "2025-10-01" },
    { kind: "CONSUME", days: -2, effectiveDate: "2026-01-15" },
    { kind: "GRANT", days: 11, effectiveDate: "2026-10-01" },
  ];

  it("基準日までの合算", () => {
    expect(computeBalance(entries, "2026-06-01")).toBe(8);
    expect(computeBalance(entries, "2026-10-01")).toBe(19);
    expect(computeBalance(entries, "2025-01-01")).toBe(0);
  });
});

describe("planFifoConsumption", () => {
  const lots: GrantLot[] = [
    {
      grantId: "g1",
      remainingDays: 3,
      expiryDate: "2026-09-30",
      grantDate: "2024-10-01",
    },
    {
      grantId: "g2",
      remainingDays: 10,
      expiryDate: "2027-09-30",
      grantDate: "2025-10-01",
    },
  ];

  it("失効が近い付与から消化する", () => {
    const r = planFifoConsumption(lots, 2);
    expect(r.plan).toEqual([{ grantId: "g1", days: 2 }]);
    expect(r.shortageDays).toBe(0);
  });

  it("最初の付与を使い切ったら次へ繰り越す", () => {
    const r = planFifoConsumption(lots, 5);
    expect(r.plan).toEqual([
      { grantId: "g1", days: 3 },
      { grantId: "g2", days: 2 },
    ]);
    expect(r.shortageDays).toBe(0);
  });

  it("残数不足なら shortageDays を返す", () => {
    const r = planFifoConsumption(lots, 20);
    expect(r.plan).toEqual([
      { grantId: "g1", days: 3 },
      { grantId: "g2", days: 10 },
    ]);
    expect(r.shortageDays).toBe(7);
  });

  it("半日消化", () => {
    const r = planFifoConsumption(lots, 0.5);
    expect(r.plan).toEqual([{ grantId: "g1", days: 0.5 }]);
  });
});

describe("countLeaveDays", () => {
  it("全日: 期間内の勤務日数", () => {
    const days = [
      { isWorkday: true },
      { isWorkday: true },
      { isWorkday: false }, // 土日祝
      { isWorkday: true },
    ];
    expect(countLeaveDays(days, "FULL")).toBe(3);
  });

  it("半休: 勤務日なら 0.5", () => {
    expect(countLeaveDays([{ isWorkday: true }], "AM")).toBe(0.5);
    expect(countLeaveDays([{ isWorkday: false }], "PM")).toBe(0);
  });
});

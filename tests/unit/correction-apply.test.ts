import { describe, expect, it } from "vitest";
import {
  planCorrection,
  type ExistingEvent,
} from "@/features/correction/domain/apply";

const existing: ExistingEvent[] = [
  {
    id: "e1",
    type: "CLOCK_IN",
    occurredAt: "2026-09-07T00:00:00Z",
    canceled: false,
  },
  {
    id: "e2",
    type: "CLOCK_OUT",
    occurredAt: "2026-09-07T09:00:00Z",
    canceled: false,
  },
  {
    id: "e3",
    type: "BREAK_START",
    occurredAt: "2026-09-07T03:00:00Z",
    canceled: true,
  },
];

describe("planCorrection", () => {
  it("ADD: 退勤打刻の追加", () => {
    const r = planCorrection(existing, [
      { op: "ADD", clockType: "CLOCK_OUT", occurredAt: "2026-09-07T10:30:00Z" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.addEvents).toEqual([
        { type: "CLOCK_OUT", occurredAt: "2026-09-07T10:30:00Z" },
      ]);
      expect(r.plan.cancelEventIds).toEqual([]);
    }
  });

  it("UPDATE: 対象を取消して新イベントを追加", () => {
    const r = planCorrection(existing, [
      {
        op: "UPDATE",
        targetEventId: "e2",
        clockType: "CLOCK_OUT",
        occurredAt: "2026-09-07T10:00:00Z",
      },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.cancelEventIds).toEqual(["e2"]);
      expect(r.plan.addEvents).toEqual([
        { type: "CLOCK_OUT", occurredAt: "2026-09-07T10:00:00Z" },
      ]);
    }
  });

  it("DELETE: 対象を取消", () => {
    const r = planCorrection(existing, [{ op: "DELETE", targetEventId: "e1" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.cancelEventIds).toEqual(["e1"]);
  });

  it("存在しない対象はエラー", () => {
    const r = planCorrection(existing, [{ op: "DELETE", targetEventId: "x" }]);
    expect(r.ok).toBe(false);
  });

  it("取消済みの対象はエラー", () => {
    const r = planCorrection(existing, [{ op: "DELETE", targetEventId: "e3" }]);
    expect(r.ok).toBe(false);
  });

  it("同一イベントを二重操作はエラー", () => {
    const r = planCorrection(existing, [
      { op: "DELETE", targetEventId: "e1" },
      {
        op: "UPDATE",
        targetEventId: "e1",
        clockType: "CLOCK_IN",
        occurredAt: "2026-09-07T00:30:00Z",
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it("ADD で種別/時刻欠落はエラー", () => {
    const r = planCorrection(existing, [{ op: "ADD", clockType: "CLOCK_IN" }]);
    expect(r.ok).toBe(false);
  });

  it("空明細はエラー", () => {
    const r = planCorrection(existing, []);
    expect(r.ok).toBe(false);
  });
});

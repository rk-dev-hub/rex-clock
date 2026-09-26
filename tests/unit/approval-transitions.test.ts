import { describe, expect, it } from "vitest";
import {
  canTransition,
  nextStatus,
} from "@/features/approval/domain/transitions";

describe("approval transitions", () => {
  it("SUBMIT は DRAFT からのみ", () => {
    expect(canTransition("DRAFT", "SUBMIT")).toBe(true);
    expect(canTransition("PENDING", "SUBMIT")).toBe(false);
  });

  it("APPROVE / REJECT は PENDING からのみ", () => {
    expect(canTransition("PENDING", "APPROVE")).toBe(true);
    expect(canTransition("PENDING", "REJECT")).toBe(true);
    expect(canTransition("APPROVED", "APPROVE")).toBe(false);
    expect(canTransition("REJECTED", "REJECT")).toBe(false);
    expect(canTransition("CANCELED", "APPROVE")).toBe(false);
  });

  it("CANCEL は DRAFT / PENDING から", () => {
    expect(canTransition("DRAFT", "CANCEL")).toBe(true);
    expect(canTransition("PENDING", "CANCEL")).toBe(true);
    expect(canTransition("APPROVED", "CANCEL")).toBe(false);
  });

  it("nextStatus", () => {
    expect(nextStatus("SUBMIT")).toBe("PENDING");
    expect(nextStatus("APPROVE")).toBe("APPROVED");
    expect(nextStatus("REJECT")).toBe("REJECTED");
    expect(nextStatus("CANCEL")).toBe("CANCELED");
  });
});

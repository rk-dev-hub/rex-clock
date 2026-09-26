import { describe, expect, it } from "vitest";
import {
  canPunch,
  deriveState,
} from "@/features/time-clock/domain/state-machine";
import type { ClockType } from "@prisma/client";

const seq = (...types: ClockType[]) => types.map((type) => ({ type }));

describe("time-clock state machine", () => {
  it("空 → OUT", () => {
    expect(deriveState([])).toBe("OUT");
  });

  it("CLOCK_IN → WORKING", () => {
    expect(deriveState(seq("CLOCK_IN"))).toBe("WORKING");
  });

  it("CLOCK_IN, BREAK_START → ON_BREAK", () => {
    expect(deriveState(seq("CLOCK_IN", "BREAK_START"))).toBe("ON_BREAK");
  });

  it("休憩を挟んで退勤 → DONE", () => {
    expect(
      deriveState(seq("CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT")),
    ).toBe("DONE");
  });

  it("OUT から CLOCK_OUT は不可", () => {
    const r = canPunch([], "CLOCK_OUT");
    expect(r.ok).toBe(false);
  });

  it("WORKING から二重 CLOCK_IN は不可", () => {
    const r = canPunch(seq("CLOCK_IN"), "CLOCK_IN");
    expect(r.ok).toBe(false);
  });

  it("WORKING から BREAK_END は不可", () => {
    expect(canPunch(seq("CLOCK_IN"), "BREAK_END").ok).toBe(false);
  });

  it("ON_BREAK から CLOCK_OUT は不可（先に休憩終了）", () => {
    expect(canPunch(seq("CLOCK_IN", "BREAK_START"), "CLOCK_OUT").ok).toBe(
      false,
    );
  });

  it("DONE から再出勤は不可（修正申請へ）", () => {
    expect(canPunch(seq("CLOCK_IN", "CLOCK_OUT"), "CLOCK_IN").ok).toBe(false);
  });

  it("正常遷移は nextState を返す", () => {
    const r = canPunch(seq("CLOCK_IN"), "BREAK_START");
    expect(r).toEqual({ ok: true, nextState: "ON_BREAK" });
  });
});

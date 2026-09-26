import { describe, expect, it } from "vitest";
import { periodRangeFor } from "@/features/aggregation/domain/period";

describe("periodRangeFor", () => {
  it("月末締め: 月初〜月末", () => {
    expect(periodRangeFor("2026-02-15", 31)).toEqual({
      startStr: "2026-02-01",
      endStr: "2026-02-28",
    });
  });

  it("月末締め: うるう年 2 月", () => {
    expect(periodRangeFor("2024-02-10", 31).endStr).toBe("2024-02-29");
  });

  it("20 日締め: 締め日以前は当月締め期間", () => {
    expect(periodRangeFor("2026-09-15", 20)).toEqual({
      startStr: "2026-08-21",
      endStr: "2026-09-20",
    });
  });

  it("20 日締め: 締め日翌日は翌月締め期間", () => {
    expect(periodRangeFor("2026-09-21", 20)).toEqual({
      startStr: "2026-09-21",
      endStr: "2026-10-20",
    });
  });

  it("20 日締め: 年またぎ", () => {
    expect(periodRangeFor("2026-12-25", 20)).toEqual({
      startStr: "2026-12-21",
      endStr: "2027-01-20",
    });
  });

  it("20 日締め: 締め日ちょうど", () => {
    expect(periodRangeFor("2026-09-20", 20).endStr).toBe("2026-09-20");
  });

  it("28 日締め: 前月 29 日が存在しない月度は当月 1 日へ正規化", () => {
    expect(periodRangeFor("2026-03-10", 28)).toEqual({
      startStr: "2026-03-01",
      endStr: "2026-03-28",
    });
  });

  it("25 日締め: 通常月", () => {
    expect(periodRangeFor("2026-09-10", 25)).toEqual({
      startStr: "2026-08-26",
      endStr: "2026-09-25",
    });
  });

  it("31 日締め（月末）: 短い月は末日にクランプ", () => {
    expect(periodRangeFor("2026-04-10", 31)).toEqual({
      startStr: "2026-04-01",
      endStr: "2026-04-30",
    });
  });
});

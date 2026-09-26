import { describe, expect, it } from "vitest";
import { weekStartOf, weekDatesOf } from "@/features/aggregation/domain/week";

describe("weekStartOf / weekDatesOf", () => {
  it("月曜起算: 日曜は前週の月曜へ", () => {
    expect(weekStartOf("2026-09-13", 1)).toBe("2026-09-07"); // 日 → 月
    expect(weekStartOf("2026-09-07", 1)).toBe("2026-09-07"); // 月 → 当日
    expect(weekStartOf("2026-09-10", 1)).toBe("2026-09-07"); // 木 → 月
  });

  it("日曜起算", () => {
    expect(weekStartOf("2026-09-13", 0)).toBe("2026-09-13"); // 日 → 当日
    expect(weekStartOf("2026-09-12", 0)).toBe("2026-09-06"); // 土 → 前日曜
  });

  it("月跨ぎ週の 7 日を返す", () => {
    expect(weekDatesOf("2026-10-01", 1)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

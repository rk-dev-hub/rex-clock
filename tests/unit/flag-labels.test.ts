import { describe, expect, it } from "vitest";
import type { DailyFlag } from "@/features/attendance/domain/daily-summary";
import {
  flagLabel,
  flagSeverity,
  displayFlagLabel,
  flagBadgeClass,
} from "@/features/attendance/flag-labels";

const ALL_FLAGS: DailyFlag[] = [
  "MISSING_CLOCK_IN",
  "MISSING_CLOCK_OUT",
  "BREAK_MISMATCH",
  "BREAK_SHORTAGE",
  "NEGATIVE_WORK",
  "HOLIDAY_WORK",
  "OVER_STATUTORY_OT",
  "LONG_DAY",
  "ABSENCE",
  "SPECIAL_LEAVE",
];

describe("flag-labels", () => {
  it("すべての DailyFlag に日本語ラベルと重大度がある", () => {
    for (const f of ALL_FLAGS) {
      expect(flagLabel[f]).toBeTruthy();
      expect(["destructive", "warning", "info"]).toContain(flagSeverity[f]);
    }
  });

  it("displayFlagLabel は既知フラグを日本語に、未知値はそのまま返す", () => {
    expect(displayFlagLabel("MISSING_CLOCK_OUT")).toBe("退勤打刻なし");
    expect(displayFlagLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("flagBadgeClass は重大度に応じたクラスを返す", () => {
    expect(flagBadgeClass("NEGATIVE_WORK")).toContain("destructive");
    expect(flagBadgeClass("BREAK_SHORTAGE")).toContain("warning");
    expect(flagBadgeClass("OVER_STATUTORY_OT")).toContain("info");
  });
});

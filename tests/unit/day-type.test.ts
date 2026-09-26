import { describe, expect, it } from "vitest";
import { resolveDayType } from "@/features/calendar/domain/day-type";

const BASE = {
  legalHolidayWeekday: 0, // 日曜
  prescribedHolidayWeekdays: [6], // 土曜
};

describe("resolveDayType", () => {
  it("平日", () => {
    expect(
      resolveDayType({ ...BASE, weekday: 3, isHolidayDate: false }),
    ).toEqual({ dayType: "WORKDAY", isHoliday: false });
  });

  it("土曜 → 所定休日", () => {
    expect(
      resolveDayType({ ...BASE, weekday: 6, isHolidayDate: false }),
    ).toEqual({ dayType: "PRESCRIBED_HOLIDAY", isHoliday: true });
  });

  it("日曜 → 法定休日", () => {
    expect(
      resolveDayType({ ...BASE, weekday: 0, isHolidayDate: false }),
    ).toEqual({ dayType: "LEGAL_HOLIDAY", isHoliday: true });
  });

  it("平日の祝日 → 所定休日", () => {
    expect(
      resolveDayType({ ...BASE, weekday: 3, isHolidayDate: true }),
    ).toEqual({ dayType: "PRESCRIBED_HOLIDAY", isHoliday: true });
  });

  it("日曜の祝日 → 法定休日", () => {
    expect(
      resolveDayType({ ...BASE, weekday: 0, isHolidayDate: true }),
    ).toEqual({ dayType: "LEGAL_HOLIDAY", isHoliday: true });
  });

  it("手動上書きが最優先", () => {
    expect(
      resolveDayType({
        ...BASE,
        weekday: 0,
        isHolidayDate: true,
        override: { dayType: "WORKDAY", isHoliday: false },
      }),
    ).toEqual({ dayType: "WORKDAY", isHoliday: false });
  });
});

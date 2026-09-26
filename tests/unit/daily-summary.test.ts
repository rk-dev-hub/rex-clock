import { describe, expect, it } from "vitest";
import { buildDailySummary } from "@/features/attendance/domain/daily-summary";
import { DEFAULT_RULE, WORKDAY_CTX, ev } from "../fixtures/work-rule";

describe("buildDailySummary — docs/04 ワークド例", () => {
  it("例1: 標準日 9:00-19:15 休憩12-13", () => {
    const r = buildDailySummary(
      [
        ev("CLOCK_IN", "09:00"),
        ev("BREAK_START", "12:00"),
        ev("BREAK_END", "13:00"),
        ev("CLOCK_OUT", "19:15"),
      ],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.breakMinutes).toBe(60);
    expect(r.workedMinutes).toBe(555);
    expect(r.withinPrescribedMinutes).toBe(480);
    expect(r.withinStatutoryOtMinutes).toBe(0);
    expect(r.overStatutoryOtMinutes).toBe(75);
    expect(r.nightMinutes).toBe(0);
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyLeaveMinutes).toBe(0);
    expect(r.flags).toContain("OVER_STATUTORY_OT");
  });

  it("例2: 深夜またぎ 22:00-翌2:00（総量ベース）", () => {
    const r = buildDailySummary(
      [
        ev("CLOCK_IN", "22:00", "2026-09-07"),
        ev("CLOCK_OUT", "02:00", "2026-09-08"),
      ],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(240);
    expect(r.withinPrescribedMinutes).toBe(240);
    expect(r.withinStatutoryOtMinutes).toBe(0);
    expect(r.overStatutoryOtMinutes).toBe(0);
    expect(r.nightMinutes).toBe(240);
  });

  it("例3: 法定休日出勤 10:00-16:00 休憩1h", () => {
    const r = buildDailySummary(
      [
        ev("CLOCK_IN", "10:00"),
        ev("BREAK_START", "12:00"),
        ev("BREAK_END", "13:00"),
        ev("CLOCK_OUT", "16:00"),
      ],
      { ...WORKDAY_CTX, dayType: "LEGAL_HOLIDAY", prescribedMinutes: 0 },
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(300);
    expect(r.legalHolidayMinutes).toBe(300);
    expect(r.withinStatutoryOtMinutes).toBe(0);
    expect(r.overStatutoryOtMinutes).toBe(0);
    expect(r.nightMinutes).toBe(0);
    expect(r.lateMinutes).toBe(0);
    expect(r.flags).toContain("HOLIDAY_WORK");
  });

  it("例4: 午前半休 + 午後勤務 13:00-19:30", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "13:00"), ev("CLOCK_OUT", "19:30")],
      { ...WORKDAY_CTX, leave: { type: "PAID", part: "AM" } },
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(390);
    expect(r.withinPrescribedMinutes).toBe(240);
    expect(r.withinStatutoryOtMinutes).toBe(150);
    expect(r.overStatutoryOtMinutes).toBe(0);
    expect(r.paidLeaveCountedMinutes).toBe(240);
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyLeaveMinutes).toBe(0);
  });
});

describe("buildDailySummary — 境界", () => {
  it("深夜が前後両側にかかる 20:00-翌7:00 休憩02:00-02:30", () => {
    const r = buildDailySummary(
      [
        ev("CLOCK_IN", "20:00", "2026-09-07"),
        ev("BREAK_START", "02:00", "2026-09-08"),
        ev("BREAK_END", "02:30", "2026-09-08"),
        ev("CLOCK_OUT", "07:00", "2026-09-08"),
      ],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    // 拘束 660、休憩 30 → 実働 630
    expect(r.workedMinutes).toBe(630);
    // 深夜: 22:00-24:00(120) + 00:00-05:00(300) = 420、うち休憩 30 が深夜内 → 390
    expect(r.nightMinutes).toBe(390);
    expect(r.overStatutoryOtMinutes).toBe(150); // 630 - 480
  });

  it("退勤打刻なし → MISSING_CLOCK_OUT, 実働 0", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "09:00")],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(0);
    expect(r.flags).toContain("MISSING_CLOCK_OUT");
  });

  it("出勤打刻なしで他打刻あり → MISSING_CLOCK_IN", () => {
    const r = buildDailySummary(
      [ev("BREAK_START", "12:00"), ev("CLOCK_OUT", "18:00")],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.flags).toContain("MISSING_CLOCK_IN");
    expect(r.workedMinutes).toBe(0);
  });

  it("休憩不足 09:00-18:30 休憩なし → BREAK_SHORTAGE", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "09:00"), ev("CLOCK_OUT", "18:30")],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(570);
    expect(r.flags).toContain("BREAK_SHORTAGE");
  });

  it("遅刻・早退 10:00-17:00", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "10:00"), ev("CLOCK_OUT", "17:00")],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.lateMinutes).toBe(60);
    expect(r.earlyLeaveMinutes).toBe(60);
  });

  it("全日有給・打刻なし → paidLeaveCounted=所定, フラグなし", () => {
    const r = buildDailySummary(
      [],
      { ...WORKDAY_CTX, leave: { type: "PAID", part: "FULL" } },
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(0);
    expect(r.paidLeaveCountedMinutes).toBe(480);
    expect(r.flags).toEqual([]);
  });

  it("全日欠勤 → ABSENCE フラグ, paidLeaveCounted=0", () => {
    const r = buildDailySummary(
      [],
      { ...WORKDAY_CTX, leave: { type: "ABSENCE", part: "FULL" } },
      DEFAULT_RULE,
    );
    expect(r.paidLeaveCountedMinutes).toBe(0);
    expect(r.flags).toEqual(["ABSENCE"]);
  });

  it("所定休日に労働 → 全時間が withinStatutoryOt/over に、HOLIDAY_WORK", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "09:00"), ev("CLOCK_OUT", "18:00")],
      {
        ...WORKDAY_CTX,
        dayType: "PRESCRIBED_HOLIDAY",
        prescribedMinutes: 0,
        scheduledStart: undefined,
        scheduledEnd: undefined,
      },
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(540);
    expect(r.withinPrescribedMinutes).toBe(0);
    expect(r.withinStatutoryOtMinutes).toBe(480);
    expect(r.overStatutoryOtMinutes).toBe(60);
    expect(r.flags).toContain("HOLIDAY_WORK");
  });

  it("休憩ペア不整合 → BREAK_MISMATCH", () => {
    const r = buildDailySummary(
      [
        ev("CLOCK_IN", "09:00"),
        ev("BREAK_START", "12:00"),
        ev("CLOCK_OUT", "18:00"),
      ],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.flags).toContain("BREAK_MISMATCH");
  });

  it("午後半休 + 午前勤務、所定中央(13:30)まで勤務 → 早退なし", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "09:00"), ev("CLOCK_OUT", "13:30")],
      { ...WORKDAY_CTX, leave: { type: "PAID", part: "PM" } },
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(270);
    expect(r.withinPrescribedMinutes).toBe(240); // base = 所定/2
    expect(r.withinStatutoryOtMinutes).toBe(30); // 240 超〜8h は法定内残業
    expect(r.overStatutoryOtMinutes).toBe(0);
    expect(r.paidLeaveCountedMinutes).toBe(240);
    expect(r.lateMinutes).toBe(0);
    expect(r.earlyLeaveMinutes).toBe(0);
  });

  it("午後半休で半休開始（所定中央 13:30）前に退勤 → 早退", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "09:00"), ev("CLOCK_OUT", "12:30")],
      { ...WORKDAY_CTX, leave: { type: "PAID", part: "PM" } },
      DEFAULT_RULE,
    );
    expect(r.earlyLeaveMinutes).toBe(60); // 13:30 - 12:30
  });

  it("所定 > 480 の誤設定でも総和不変（worked = 所定内+法定内残業+法定外残業）", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "09:00"), ev("CLOCK_OUT", "18:30")], // 休憩なし gross 570
      { ...WORKDAY_CTX, prescribedMinutes: 540, scheduledEnd: "19:00" },
      DEFAULT_RULE,
    );
    expect(
      r.withinPrescribedMinutes +
        r.withinStatutoryOtMinutes +
        r.overStatutoryOtMinutes,
    ).toBe(r.workedMinutes);
    expect(r.workedMinutes).toBe(570);
    expect(r.overStatutoryOtMinutes).toBe(90); // 8h 超は所定に関わらず法定外
  });

  it("日次は丸めない（roundingUnitMinutes は廃止）: 09:00-17:53 → 533 分", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "09:00"), ev("CLOCK_OUT", "17:53")],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(533);
  });

  it("拘束 > 13h で LONG_DAY", () => {
    const r = buildDailySummary(
      [
        ev("CLOCK_IN", "08:00"),
        ev("BREAK_START", "12:00"),
        ev("BREAK_END", "13:00"),
        ev("CLOCK_OUT", "21:30"), // 拘束 810
      ],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.flags).toContain("LONG_DAY");
  });

  it("退勤が出勤より前 → NEGATIVE_WORK, 実働 0", () => {
    const r = buildDailySummary(
      [
        ev("CLOCK_IN", "18:00", "2026-09-07"),
        ev("CLOCK_OUT", "09:00", "2026-09-07"),
      ],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(0);
    expect(r.flags).toContain("NEGATIVE_WORK");
  });

  it("早朝のみ勤務 03:00-08:00 → 深夜 120（当日 00:00-05:00 側）", () => {
    const r = buildDailySummary(
      [ev("CLOCK_IN", "03:00"), ev("CLOCK_OUT", "08:00")],
      WORKDAY_CTX,
      DEFAULT_RULE,
    );
    expect(r.workedMinutes).toBe(300);
    expect(r.nightMinutes).toBe(120);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyWeeklyOvertime,
  type WeekDay,
} from "@/features/aggregation/domain/weekly-overtime";

function wd(
  dateStr: string,
  o: Partial<WeekDay> & { dayType?: WeekDay["dayType"] } = {},
): WeekDay {
  return {
    dateStr,
    dayType: o.dayType ?? "WORKDAY",
    withinPrescribedMinutes: o.withinPrescribedMinutes ?? 0,
    withinStatutoryOtMinutes: o.withinStatutoryOtMinutes ?? 0,
    dailyOverStatutoryOtMinutes: o.dailyOverStatutoryOtMinutes ?? 0,
  };
}

describe("applyWeeklyOvertime — docs/04 §3", () => {
  it("例5: 月〜金 各9h（所定8h）→ 週昇格なし、日次60×5のみ", () => {
    const days = [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ].map((d) =>
      wd(d, {
        withinPrescribedMinutes: 480,
        dailyOverStatutoryOtMinutes: 60,
      }),
    );
    const r = applyWeeklyOvertime(days);
    expect(r.every((x) => x.promotedMinutes === 0)).toBe(true);
    expect(r.reduce((s, x) => s + x.overStatutoryOtMinutes, 0)).toBe(300);
  });

  it("例6: 月〜金 各7h + 土(所定休日)7h → 土から120分昇格", () => {
    const days = [
      ...[
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
        "2026-09-10",
        "2026-09-11",
      ].map((d) => wd(d, { withinPrescribedMinutes: 420 })),
      wd("2026-09-12", {
        dayType: "PRESCRIBED_HOLIDAY",
        withinStatutoryOtMinutes: 420,
      }),
    ];
    const r = applyWeeklyOvertime(days);
    const sat = r.find((x) => x.dateStr === "2026-09-12")!;
    expect(sat.promotedMinutes).toBe(120);
    expect(sat.overStatutoryOtMinutes).toBe(120);
    expect(sat.withinStatutoryOtMinutes).toBe(300);
    // 平日は不変
    expect(
      r
        .filter((x) => x.dateStr < "2026-09-12")
        .every((x) => x.promotedMinutes === 0),
    ).toBe(true);
  });

  it("法定休日の労働は週40h計算から除外", () => {
    const days = [
      ...[
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
        "2026-09-10",
        "2026-09-11",
      ].map((d) => wd(d, { withinPrescribedMinutes: 480 })),
      wd("2026-09-13", {
        dayType: "LEGAL_HOLIDAY",
        withinStatutoryOtMinutes: 480,
      }),
    ];
    const r = applyWeeklyOvertime(days);
    // 平日で丁度2400、法定休日は countable に入らない → 昇格なし
    expect(r.every((x) => x.promotedMinutes === 0)).toBe(true);
  });

  it("超過が複数日にまたがる場合、遅い順に食う", () => {
    const days = [
      wd("2026-09-07", { withinPrescribedMinutes: 600 }),
      wd("2026-09-08", { withinPrescribedMinutes: 600 }),
      wd("2026-09-09", { withinPrescribedMinutes: 600 }),
      wd("2026-09-10", { withinPrescribedMinutes: 600 }),
      wd("2026-09-11", { withinPrescribedMinutes: 600 }),
    ];
    // countable 3000 → excess 600
    const r = applyWeeklyOvertime(days);
    expect(r.find((x) => x.dateStr === "2026-09-11")!.promotedMinutes).toBe(
      600,
    );
    expect(
      r
        .filter((x) => x.dateStr < "2026-09-11")
        .every((x) => x.promotedMinutes === 0),
    ).toBe(true);
  });

  it("最遅日の pool を超えたら次に遅い日へ繰り越す（多段カスケード）", () => {
    // 7 日すべて 8h ちょうど。countable 3360 → excess 960
    const days = [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ].map((d) => wd(d, { withinPrescribedMinutes: 480 }));
    const r = applyWeeklyOvertime(days);
    const by = Object.fromEntries(r.map((x) => [x.dateStr, x]));
    expect(by["2026-09-13"].promotedMinutes).toBe(480);
    expect(by["2026-09-12"].promotedMinutes).toBe(480);
    expect(by["2026-09-11"].promotedMinutes).toBe(0);
    expect(by["2026-09-13"].withinPrescribedMinutes).toBe(0);
    expect(by["2026-09-13"].overStatutoryOtMinutes).toBe(480);
    expect(r.reduce((s, x) => s + x.overStatutoryOtMinutes, 0)).toBe(960);
  });

  it("昇格は withinStatutoryOt を先に消費し、不足分だけ withinPrescribed から取る", () => {
    const days = [
      ...[
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
        "2026-09-10",
        "2026-09-11",
      ].map((d) => wd(d, { withinPrescribedMinutes: 480 })),
      wd("2026-09-12", {
        dayType: "PRESCRIBED_HOLIDAY",
        withinStatutoryOtMinutes: 150,
        dailyOverStatutoryOtMinutes: 0,
      }),
    ];
    // countable = 2400 + 150 = 2550 → excess 150
    const r = applyWeeklyOvertime(days);
    const sat = r.find((x) => x.dateStr === "2026-09-12")!;
    expect(sat.withinStatutoryOtMinutes).toBe(0); // 150 全部 OT から
    expect(sat.withinPrescribedMinutes).toBe(0);
    expect(sat.overStatutoryOtMinutes).toBe(150);
  });
});

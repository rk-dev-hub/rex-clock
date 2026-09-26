import type { DayType } from "@prisma/client";

// docs/04-aggregation-spec.md §3。週 40 時間の壁。
// 入力の within/over 3 バケットは「日次確定分（週次未適用）」であること。

export const WEEKLY_LIMIT_MIN = 2400; // 40h

export type WeekDay = {
  dateStr: string;
  dayType: DayType;
  withinPrescribedMinutes: number;
  withinStatutoryOtMinutes: number;
  /** 日次確定分の法定外残業（8h 超）。 */
  dailyOverStatutoryOtMinutes: number;
};

export type WeekDayAdjusted = {
  dateStr: string;
  withinPrescribedMinutes: number;
  withinStatutoryOtMinutes: number;
  /** 週次反映後の法定外残業（日次確定分 + 週 40h 超の昇格分）。 */
  overStatutoryOtMinutes: number;
  /** この日から 25% へ昇格した分。 */
  promotedMinutes: number;
};

/**
 * 週 40h を超えた「日 8h 以下（法定休日を除く）」の労働を、
 * 週内で時系列の遅い順に overStatutoryOt へ昇格させる。
 */
export function applyWeeklyOvertime(
  days: WeekDay[],
  limitMinutes: number = WEEKLY_LIMIT_MIN,
): WeekDayAdjusted[] {
  const countable = days
    .filter((d) => d.dayType !== "LEGAL_HOLIDAY")
    .reduce(
      (s, d) => s + d.withinPrescribedMinutes + d.withinStatutoryOtMinutes,
      0,
    );
  let excess = Math.max(0, countable - limitMinutes);

  // 遅い順（週後半で 40h 到達する実態に合わせる）
  const order = [...days].sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  const promoted = new Map<string, number>();
  const reducedOt = new Map<string, number>();
  const reducedPresc = new Map<string, number>();

  for (const d of order) {
    if (excess <= 0) break;
    if (d.dayType === "LEGAL_HOLIDAY") continue;

    const pool = d.withinStatutoryOtMinutes + d.withinPrescribedMinutes;
    const take = Math.min(excess, pool);
    if (take <= 0) continue;

    const fromOt = Math.min(take, d.withinStatutoryOtMinutes);
    const fromPresc = take - fromOt;

    reducedOt.set(d.dateStr, fromOt);
    reducedPresc.set(d.dateStr, fromPresc);
    promoted.set(d.dateStr, take);
    excess -= take;
  }

  return days.map((d) => {
    const p = promoted.get(d.dateStr) ?? 0;
    return {
      dateStr: d.dateStr,
      withinPrescribedMinutes:
        d.withinPrescribedMinutes - (reducedPresc.get(d.dateStr) ?? 0),
      withinStatutoryOtMinutes:
        d.withinStatutoryOtMinutes - (reducedOt.get(d.dateStr) ?? 0),
      overStatutoryOtMinutes: d.dailyOverStatutoryOtMinutes + p,
      promotedMinutes: p,
    };
  });
}

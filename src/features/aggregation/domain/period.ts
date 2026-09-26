import { addDaysStr } from "@/lib/date-range";

/**
 * 締め日で区切った集計期間（純粋関数）。日付は 'YYYY-MM-DD'。
 * closingDay: 31 = 月末。1–30 は該当日締め（その月に存在しなければ月末へクランプ）。
 */
export type PeriodRange = { startStr: string; endStr: string };

export function periodRangeFor(
  dateStr: string,
  closingDay: number,
): PeriodRange {
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  const cd = closingDay <= 0 ? 31 : Math.min(closingDay, 31);

  // その年月の実際の締め日（短い月は月末へクランプ）
  const closeDayOf = (yy: number, mm: number) =>
    Math.min(cd, lastDayOfMonth(yy, mm));
  const endStrOf = (yy: number, mm: number) =>
    toStr(yy, mm, closeDayOf(yy, mm));

  // この日付が属する期間の「終了月」
  let endY = y;
  let endM = m;
  if (d > closeDayOf(y, m)) {
    const nx = addMonth(y, m, 1);
    endY = nx.y;
    endM = nx.m;
  }

  const prev = addMonth(endY, endM, -1);
  return {
    startStr: addDaysStr(endStrOf(prev.y, prev.m), 1),
    endStr: endStrOf(endY, endM),
  };
}

/** 期間の開始日（MonthlyAggregate.periodStart のキー表現）。 */
export function periodKey(dateStr: string, closingDay: number): string {
  return periodRangeFor(dateStr, closingDay).startStr;
}

function addMonth(
  y: number,
  m: number,
  delta: number,
): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta; // y >= 2000 のため常に正
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

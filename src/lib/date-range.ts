/** 'YYYY-MM-DD' 〜 'YYYY-MM-DD'（両端含む）の日付文字列を列挙する。 */
export function eachDateStr(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startStr}T00:00:00Z`);
  const end = new Date(`${endStr}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** 'YYYY-MM-DD' に日数を加算した文字列。 */
export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD'（画面表示用。内部処理・CSV/URL では ISO 形式のまま使うこと）。 */
export function formatDateSlash(dateStr: string): string {
  return dateStr.replaceAll("-", "/");
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 'YYYY-MM-DD' → "9/7(月)" 形式。 */
export function formatDateJa(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY_JA[d.getUTCDay()]})`;
}

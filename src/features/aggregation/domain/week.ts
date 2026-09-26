import { dateOnlyUtc } from "@/lib/datetime";

/** dateStr が属する週の開始日（weekStartsOn: 0=日, 1=月…）を 'YYYY-MM-DD' で返す。 */
export function weekStartOf(dateStr: string, weekStartsOn: number): string {
  const d = dateOnlyUtc(dateStr);
  const dow = d.getUTCDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** dateStr が属する週の 7 日ぶんの 'YYYY-MM-DD' を返す（開始日から昇順）。 */
export function weekDatesOf(dateStr: string, weekStartsOn: number): string[] {
  const start = dateOnlyUtc(weekStartOf(dateStr, weekStartsOn));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

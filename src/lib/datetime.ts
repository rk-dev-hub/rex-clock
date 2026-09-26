/**
 * 日付・時刻ユーティリティ。DB は UTC 保存、表示・集計は JST 固定。
 * ここでは date-fns-tz を使わず、JST(+09:00) 固定のため単純なオフセット計算で扱う。
 */

export const JST_OFFSET_MIN = 9 * 60;
const DAY_MIN = 24 * 60;

/** Date を JST の 'YYYY-MM-DD' に変換する。 */
export function jstDateStr(d: Date): string {
  const jst = new Date(d.getTime() + JST_OFFSET_MIN * 60_000);
  return jst.toISOString().slice(0, 10);
}

/** Date の JST における「その日の 0:00 からの経過分」。0–1439。 */
export function jstMinutesOfDay(d: Date): number {
  const jst = new Date(d.getTime() + JST_OFFSET_MIN * 60_000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

/**
 * Prisma の `@db.Date` カラム用。日付のみを表す Date（UTC 0:00）。
 * Prisma は @db.Date を UTC の年月日で解釈するため、JST ではなく UTC 深夜を使う。
 */
export function dateOnlyUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** `@db.Date` から読み出した Date を 'YYYY-MM-DD' に戻す。 */
export function dateOnlyStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' + 'HH:mm' (JST) の Date（UTC 実体）。 */
export function jstDateTimeUtc(dateStr: string, hm: string): Date {
  return new Date(`${dateStr}T${padHm(hm)}:00+09:00`);
}

/** 'HH:mm' → 0:00 からの分。 */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number.parseInt(x, 10));
  return h * 60 + m;
}

/** 分 → 'H:MM'（負値は '-H:MM'）。 */
export function minutesToHm(min: number): string {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

/** 2 つの Date の差（分、切り捨てなしの実数ではなく整数丸め）。 */
export function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** 'YYYY-MM-DD' の曜日（0=日）。 */
export function jstWeekday(dateStr: string): number {
  return dateOnlyUtc(dateStr).getUTCDay();
}

/** [aStart,aEnd) と [bStart,bEnd) の重なり長さ（分, 数直線上）。 */
export function overlapMinutes(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function padHm(hm: string): string {
  const [h, m = "0"] = hm.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

export { DAY_MIN };

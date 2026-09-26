import type { ClockType } from "@prisma/client";
import { clockTypeLabel } from "@/features/time-clock/labels";
import { minutesToHm, jstMinutesOfDay } from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";

// 監査ログの before/after（生の JSON）を、管理画面で読みやすい差分行に変換する。
// Prisma / Next に依存しない純粋関数（単体テスト対象）。

export type AuditDiffLine = {
  key: string;
  kind: "changed" | "added" | "removed" | "info";
  text: string;
};

const FIELD_LABEL: Record<string, string> = {
  status: "状態",
  dayType: "区分",
  isHoliday: "休日扱い",
  name: "名称",
  standardDailyMinutes: "所定労働時間(分)",
  closingDay: "締め日",
  weekStartsOn: "週の開始曜日",
  overtimeRatePct: "時間外割増率(%)",
  nightRatePct: "深夜割増率(%)",
  legalHolidayRatePct: "法定休日割増率(%)",
  over60hRatePct: "月60時間超割増率(%)",
  nightStart: "深夜開始",
  nightEnd: "深夜終了",
  breakPolicy: "休憩ポリシー",
  legalHolidayWeekday: "法定休日の曜日",
  prescribedHolidayWeekdays: "所定休日の曜日",
  email: "メールアドレス",
  employeeCode: "社員番号",
  role: "権限",
  periodStart: "期間開始",
  periodEnd: "期間終了",
  type: "種別",
  dayPart: "区分",
  kind: "種別",
  grantedDays: "付与日数",
  expiryDate: "失効日",
  days: "日数",
  imported: "取込件数",
};

function label(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

type JsonRecord = Record<string, unknown>;
type EventEntry = { type: string; at: string };

function isPlainObject(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isEventEntry(v: unknown): v is EventEntry {
  return (
    isPlainObject(v) && typeof v.type === "string" && typeof v.at === "string"
  );
}

function isEventArray(v: unknown): v is EventEntry[] {
  return Array.isArray(v) && v.every(isEventEntry);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T/;

function formatJstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDateSlash(iso.slice(0, 10))} ${minutesToHm(jstMinutesOfDay(d))}`;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "はい" : "いいえ";
  if (typeof v === "string") {
    if (DATE_RE.test(v)) return formatDateSlash(v);
    if (DATETIME_RE.test(v)) return formatJstDateTime(v);
    return v;
  }
  if (typeof v === "number") return String(v);
  // 配列・オブジェクトなど複雑な値はコンパクトな JSON にフォールバック
  return JSON.stringify(v);
}

function formatEventLabel(e: EventEntry): string {
  const d = new Date(e.at);
  const time = Number.isNaN(d.getTime())
    ? e.at
    : minutesToHm(jstMinutesOfDay(d));
  return `${clockTypeLabel[e.type as ClockType] ?? e.type} ${time}`;
}

function diffEvents(
  before: EventEntry[],
  after: EventEntry[],
): AuditDiffLine[] {
  const eventKey = (e: EventEntry) => `${e.type}@${e.at}`;
  const beforeKeys = new Set(before.map(eventKey));
  const afterKeys = new Set(after.map(eventKey));
  const lines: AuditDiffLine[] = [];
  for (const e of after) {
    if (!beforeKeys.has(eventKey(e))) {
      lines.push({
        key: `add:${eventKey(e)}`,
        kind: "added",
        text: `追加: ${formatEventLabel(e)}`,
      });
    }
  }
  for (const e of before) {
    if (!afterKeys.has(eventKey(e))) {
      lines.push({
        key: `del:${eventKey(e)}`,
        kind: "removed",
        text: `削除: ${formatEventLabel(e)}`,
      });
    }
  }
  if (lines.length === 0) {
    lines.push({ key: "_none", kind: "info", text: "打刻の変更なし" });
  }
  return lines;
}

/** before/after を人が読める差分行のリストに変換する。 */
export function buildAuditDiffLines(
  before: unknown,
  after: unknown,
): AuditDiffLine[] {
  // 打刻修正承認（CorrectionRequest）: { events: [...] } 形式は専用の差分にする
  if (
    isPlainObject(before) &&
    isPlainObject(after) &&
    Object.keys(before).length === 1 &&
    Object.keys(after).length === 1 &&
    isEventArray(before.events) &&
    isEventArray(after.events)
  ) {
    return diffEvents(before.events, after.events);
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const lines: AuditDiffLine[] = [];
    for (const k of keys) {
      const inBefore = k in before;
      const inAfter = k in after;
      const bStr = formatValue(before[k]);
      const aStr = formatValue(after[k]);
      if (inBefore && inAfter) {
        if (bStr !== aStr) {
          lines.push({
            key: k,
            kind: "changed",
            text: `${label(k)}: ${bStr} → ${aStr}`,
          });
        }
      } else if (inAfter) {
        lines.push({ key: k, kind: "added", text: `${label(k)}: ${aStr}` });
      } else {
        lines.push({ key: k, kind: "removed", text: `${label(k)}: ${bStr}` });
      }
    }
    if (lines.length === 0) {
      lines.push({ key: "_none", kind: "info", text: "変更なし" });
    }
    return lines;
  }

  // 片方のみ存在（作成系ログなど）: フラットな項目一覧として表示
  const only = isPlainObject(after)
    ? after
    : isPlainObject(before)
      ? before
      : null;
  if (only) {
    return Object.entries(only).map(([k, v]) => ({
      key: k,
      kind: "info",
      text: `${label(k)}: ${formatValue(v)}`,
    }));
  }

  // それ以外（配列・プリミティブなど想定外の形）はコンパクトな JSON にフォールバック
  const lines: AuditDiffLine[] = [];
  if (before !== null && before !== undefined) {
    lines.push({
      key: "_before",
      kind: "removed",
      text: `変更前: ${formatValue(before)}`,
    });
  }
  if (after !== null && after !== undefined) {
    lines.push({
      key: "_after",
      kind: "added",
      text: `変更後: ${formatValue(after)}`,
    });
  }
  return lines;
}

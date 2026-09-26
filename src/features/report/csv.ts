import iconv from "iconv-lite";
import type { Column } from "@/features/report/csv-schema";

export type CsvEncoding = "utf8" | "utf8-bom" | "shift_jis";

/** 1 セルを RFC4180 準拠でクオートする。 */
function quote(v: string): string {
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** 行配列 → CSV 文字列（改行は CRLF）。 */
export function toCsvString<T>(
  rows: T[],
  columns: Column<T>[],
  extraHeaderLines: string[] = [],
): string {
  const lines: string[] = [];
  for (const l of extraHeaderLines) lines.push(quote(l));
  lines.push(columns.map((c) => quote(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => quote(c.value(row))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** CSV 文字列 → 指定エンコーディングの Buffer。 */
export function encodeCsv(csv: string, encoding: CsvEncoding): Buffer {
  if (encoding === "shift_jis") {
    return iconv.encode(csv, "Shift_JIS");
  }
  const body = Buffer.from(csv, "utf8");
  if (encoding === "utf8-bom") {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
  }
  return body;
}

export function csvContentType(encoding: CsvEncoding): string {
  const charset = encoding === "shift_jis" ? "Shift_JIS" : "UTF-8";
  return `text/csv; charset=${charset}`;
}

/** ダウンロード用の Content-Disposition。ファイル名は ASCII セーフ + RFC5987。 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  const enc = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${enc}`;
}

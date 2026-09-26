import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { authorizeExport } from "@/features/report/export-guard";
import {
  buildUserReport,
  buildAllSummary,
} from "@/features/report/build-report";
import { SUMMARY_COLUMNS } from "@/features/report/csv-schema";
import {
  toCsvString,
  encodeCsv,
  csvContentType,
  contentDisposition,
  type CsvEncoding,
} from "@/features/report/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId");
  const periodStart = sp.get("periodStart");
  const all = sp.get("all") === "1";
  if (!periodStart || (!all && !userId)) {
    return new Response("periodStart と userId（または all=1）が必要です", {
      status: 400,
    });
  }

  const authz = await authorizeExport(userId, all);
  if (!authz.ok) return new Response(null, { status: authz.status });

  const encoding = (env.CSV_ENCODING as CsvEncoding) ?? "utf8-bom";

  if (all) {
    const s = await buildAllSummary(periodStart);
    const header = [
      "月次サマリ（全従業員）",
      `期間 ${s.periodStart} 〜 ${s.periodEnd}`,
      s.closed ? "" : "※未締め期間のため暫定値です",
    ].filter(Boolean);
    const csv = toCsvString(s.rows, SUMMARY_COLUMNS, header);
    const body = encodeCsv(csv, encoding);
    return csvResponse(body, encoding, `summary_all_${s.periodStart}.csv`);
  }

  const report = await buildUserReport(userId!, periodStart);
  const header = [
    `月次サマリ  ${report.user.employeeCode} ${report.user.name}`,
    `期間 ${report.periodStart} 〜 ${report.periodEnd}`,
    report.closed ? "" : "※未締め期間のため暫定値です",
  ].filter(Boolean);
  const csv = toCsvString([report.summaryRow], SUMMARY_COLUMNS, header);
  const body = encodeCsv(csv, encoding);
  return csvResponse(
    body,
    encoding,
    `summary_${report.user.employeeCode}_${report.periodStart}.csv`,
  );
}

function csvResponse(body: Buffer, encoding: CsvEncoding, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": csvContentType(encoding),
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
}

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { authorizeExport } from "@/features/report/export-guard";
import { buildUserReport } from "@/features/report/build-report";
import { DAILY_COLUMNS } from "@/features/report/csv-schema";
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
  if (!userId || !periodStart) {
    return new Response("userId と periodStart が必要です", { status: 400 });
  }

  const authz = await authorizeExport(userId, false);
  if (!authz.ok) return new Response(null, { status: authz.status });

  const report = await buildUserReport(userId, periodStart);
  const encoding = (env.CSV_ENCODING as CsvEncoding) ?? "utf8-bom";

  const header = [
    `勤務表 日別明細  ${report.user.employeeCode} ${report.user.name}`,
    `期間 ${report.periodStart} 〜 ${report.periodEnd}`,
    report.closed ? "" : "※未締め期間のため暫定値です",
  ].filter(Boolean);

  const csv = toCsvString(report.dailyRows, DAILY_COLUMNS, header);
  const body = encodeCsv(csv, encoding);

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": csvContentType(encoding),
      "Content-Disposition": contentDisposition(
        `attendance_${report.user.employeeCode}_${report.periodStart}.csv`,
      ),
      "Cache-Control": "no-store",
    },
  });
}

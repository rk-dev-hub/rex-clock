import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { authorizeExport } from "@/features/report/export-guard";
import { buildUserReport } from "@/features/report/build-report";
import { WorksheetPdf } from "@/features/report/worksheet-pdf";
import { contentDisposition } from "@/features/report/csv";

export const dynamic = "force-dynamic";
// @react-pdf/renderer は Node ランタイムが必要
export const runtime = "nodejs";

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
  const buf = await renderToBuffer(<WorksheetPdf report={report} />);

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(
        `worksheet_${report.user.employeeCode}_${report.periodStart}.pdf`,
      ),
      "Cache-Control": "no-store",
    },
  });
}

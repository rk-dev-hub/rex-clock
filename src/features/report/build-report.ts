import { prisma } from "@/lib/prisma";
import { getMonthly } from "@/features/aggregation/usecase";
import { getPeriodView } from "@/features/attendance/period-view";
import { isPeriodClosed } from "@/features/closing/guard";
import type { DailyCsvRow, SummaryCsvRow } from "@/features/report/csv-schema";

export type UserReport = {
  user: { id: string; name: string; employeeCode: string };
  periodStart: string;
  periodEnd: string;
  closed: boolean;
  dailyRows: DailyCsvRow[];
  summaryRow: SummaryCsvRow;
};

/** 1 ユーザー × 締め期間ぶんの勤務表データ（CSV/PDF 共通）。 */
export async function buildUserReport(
  userId: string,
  ref: string,
): Promise<UserReport> {
  const [user, view, monthly] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, employeeCode: true },
    }),
    getPeriodView(userId, ref),
    getMonthly(userId, ref),
  ]);
  const closed = await isPeriodClosed(view.startStr);

  return {
    user,
    periodStart: view.startStr,
    periodEnd: view.endStr,
    closed,
    dailyRows: view.rows.map((r) => ({
      date: r.date,
      dayType: r.dayType,
      summary: r.summary,
    })),
    summaryRow: {
      employeeCode: user.employeeCode,
      name: user.name,
      aggregate: monthly.aggregate,
    },
  };
}

/** 全ユーザーの月次サマリ（all=1）。 */
export async function buildAllSummary(ref: string): Promise<{
  periodStart: string;
  periodEnd: string;
  closed: boolean;
  rows: SummaryCsvRow[];
}> {
  const users = await prisma.user.findMany({
    orderBy: { employeeCode: "asc" },
    select: { id: true, name: true, employeeCode: true },
  });
  const rows: SummaryCsvRow[] = [];
  let periodStart = ref;
  let periodEnd = ref;
  for (const u of users) {
    const m = await getMonthly(u.id, ref);
    periodStart = m.period.startStr;
    periodEnd = m.period.endStr;
    rows.push({
      employeeCode: u.employeeCode,
      name: u.name,
      aggregate: m.aggregate,
    });
  }
  const closed = await isPeriodClosed(periodStart);
  return { periodStart, periodEnd, closed, rows };
}

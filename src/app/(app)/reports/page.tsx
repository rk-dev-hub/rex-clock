import { requireUser } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import { jstDateStr } from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";
import { getMonthly } from "@/features/aggregation/usecase";
import { getPeriodView } from "@/features/attendance/period-view";
import { AttendanceTable } from "@/features/attendance/attendance-table";
import {
  DailyBarChart,
  type ChartDay,
} from "@/features/report/daily-bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Minutes } from "@/components/minutes";
import { PeriodNav } from "@/components/period-nav";
import { UserPicker } from "./user-picker";

export const metadata = { title: "勤務表 — RexClock" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: PageProps<"/reports">) {
  const me = await requireUser();
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : jstDateStr(new Date());

  const isAdmin = me.role === "ADMIN";
  const requestedUser = typeof sp.user === "string" ? sp.user : null;
  const targetId = isAdmin && requestedUser ? requestedUser : me.id;

  const [target, users, { aggregate, period }, view] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: targetId },
      select: { id: true, name: true, employeeCode: true },
    }),
    isAdmin
      ? prisma.user.findMany({
          orderBy: { employeeCode: "asc" },
          select: { id: true, name: true, employeeCode: true },
        })
      : Promise.resolve([]),
    getMonthly(targetId, ref),
    getPeriodView(targetId, ref),
  ]);

  const chartDays: ChartDay[] = view.rows.map((r) => {
    const s = r.summary;
    const legal =
      r.dayType === "LEGAL_HOLIDAY" ? (s?.legalHolidayMinutes ?? 0) : 0;
    const within =
      !s || r.dayType === "LEGAL_HOLIDAY"
        ? 0
        : Math.max(
            0,
            s.workedMinutes -
              s.withinStatutoryOtMinutes -
              s.overStatutoryOtMinutes,
          );
    const [, m, d] = r.date.split("-");
    return {
      dateStr: r.date,
      label: `${Number(m)}/${Number(d)}`,
      within,
      withinOt: s?.withinStatutoryOtMinutes ?? 0,
      overOt: s?.overStatutoryOtMinutes ?? 0,
      legal,
    };
  });

  const userParam = isAdmin && requestedUser ? `&user=${targetId}` : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">勤務表</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatDateSlash(period.startStr)} 〜{" "}
            {formatDateSlash(period.endStr)}（{target.employeeCode}{" "}
            {target.name}）
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {isAdmin ? <UserPicker users={users} current={targetId} /> : null}
          <PeriodNav
            basePath="/reports"
            startStr={period.startStr}
            endStr={period.endStr}
            closingDay={view.closingDay}
            extraParams={userParam}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="出勤日数" text={`${aggregate.workDays} 日`} />
        <Stat label="総労働" min={aggregate.totalWorkedMinutes} />
        <Stat label="所定内" min={aggregate.withinPrescribedMinutes} />
        <Stat label="法定内残業" min={aggregate.withinStatutoryOtMinutes} />
        <Stat label="時間外 25%" min={aggregate.overtime25Minutes} />
        <Stat label="時間外 50%" min={aggregate.overtime50Minutes} />
        <Stat label="深夜 25%" min={aggregate.nightMinutes} />
        <Stat label="法定休日 35%" min={aggregate.legalHolidayMinutes} />
        <Stat
          label="有給"
          text={`${aggregate.paidLeaveFullDays} 日 + 半 ${aggregate.paidLeaveHalfDays}`}
        />
        <Stat label="有給みなし時間" min={aggregate.paidLeaveMinutes} />
        <Stat label="欠勤" text={`${aggregate.absenceDays} 日`} />
        <Stat
          label="遅刻"
          text={`${aggregate.lateCount} 回 / ${fmt(aggregate.lateMinutes)}`}
        />
        <Stat
          label="早退"
          text={`${aggregate.earlyLeaveCount} 回 / ${fmt(aggregate.earlyLeaveMinutes)}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">出力:</span>
        <a
          href={`/api/export/attendance.csv?userId=${targetId}&periodStart=${period.startStr}`}
          className="border-border hover:bg-accent rounded-md border px-3 py-1.5"
        >
          日別 CSV
        </a>
        <a
          href={`/api/export/summary.csv?userId=${targetId}&periodStart=${period.startStr}`}
          className="border-border hover:bg-accent rounded-md border px-3 py-1.5"
        >
          サマリ CSV
        </a>
        <a
          href={`/api/export/worksheet.pdf?userId=${targetId}&periodStart=${period.startStr}`}
          className="border-border hover:bg-accent rounded-md border px-3 py-1.5"
        >
          勤務表 PDF
        </a>
        {isAdmin ? (
          <a
            href={`/api/export/summary.csv?all=1&periodStart=${period.startStr}`}
            className="border-border hover:bg-accent rounded-md border px-3 py-1.5"
          >
            全員サマリ CSV
          </a>
        ) : null}
      </div>

      {chartDays.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <DailyBarChart days={chartDays} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>日別明細</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceTable rows={view.rows} />
          <p className="text-muted-foreground mt-3 text-xs">
            法定外残業は週 40 時間の壁を反映済み。集計は締め日（
            {view.closingDay === 31 ? "月末" : `${view.closingDay} 日`}
            ）で区切った期間。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  min,
  text,
}: {
  label: string;
  min?: number;
  text?: string;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-0.5 text-base font-semibold">
        {text ?? <Minutes value={min} dashOnZero={false} />}
      </div>
    </div>
  );
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

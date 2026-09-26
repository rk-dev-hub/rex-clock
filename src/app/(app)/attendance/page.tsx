import { requireUser } from "@/features/auth/rbac";
import { jstDateStr } from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";
import { getPeriodView } from "@/features/attendance/period-view";
import { AttendanceTable } from "@/features/attendance/attendance-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodNav } from "@/components/period-nav";

export const metadata = { title: "勤怠一覧 — RexClock" };
export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: PageProps<"/attendance">) {
  const user = await requireUser();
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : jstDateStr(new Date());

  const view = await getPeriodView(user.id, ref);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">勤怠一覧</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatDateSlash(view.startStr)} 〜 {formatDateSlash(view.endStr)}（
            {user.name}）
          </p>
        </div>
        <PeriodNav
          basePath="/attendance"
          startStr={view.startStr}
          endStr={view.endStr}
          closingDay={view.closingDay}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>日別</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceTable rows={view.rows} />
          <p className="text-muted-foreground mt-3 text-xs">
            打刻漏れや誤打刻は「申請」から打刻修正を申請してください。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

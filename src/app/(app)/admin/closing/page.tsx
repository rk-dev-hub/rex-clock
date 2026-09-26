import { requireAdmin } from "@/features/auth/rbac";
import { formatDateSlash } from "@/lib/date-range";
import { listPeriods, getClosingPrecheck } from "@/features/closing/usecase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloseButton, ReopenButton, RecomputeForm } from "./close-form";

export const metadata = { title: "月次締め — RexClock" };
export const dynamic = "force-dynamic";

export default async function ClosingPage() {
  await requireAdmin();
  const periods = await listPeriods(6);
  // 直近の OPEN 期間の事前チェック
  const target = periods.find((p) => p.status === "OPEN") ?? periods[0];
  const precheck = await getClosingPrecheck(target.periodStart);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">月次締め</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          締め日で区切った期間を確定します。締め後の変更は再オープンが必要です。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            事前チェック（{formatDateSlash(precheck.periodStart)}〜
            {formatDateSlash(precheck.periodEnd)}）
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-4">
            <span>
              未処理の打刻修正:{" "}
              <b
                className={
                  precheck.pendingCorrections ? "text-warning-foreground" : ""
                }
              >
                {precheck.pendingCorrections}
              </b>
            </span>
            <span>
              未処理の休暇:{" "}
              <b
                className={
                  precheck.pendingLeaves ? "text-warning-foreground" : ""
                }
              >
                {precheck.pendingLeaves}
              </b>
            </span>
            <span>
              フラグのある日数: <b>{precheck.flaggedDays}</b>
            </span>
          </div>
          {precheck.usersMissingClock.length > 0 ? (
            <div>
              <p className="text-muted-foreground text-xs">
                打刻漏れのある従業員:
              </p>
              <ul className="list-inside list-disc">
                {precheck.usersMissingClock.map((u) => (
                  <li key={u.employeeCode}>
                    {u.employeeCode} {u.name} — {u.days} 日
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-success text-xs">打刻漏れはありません。</p>
          )}
          <div className="mt-2">
            <RecomputeForm
              defaultFrom={precheck.periodStart}
              defaultTo={precheck.periodEnd}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>期間一覧</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">期間</th>
                <th className="py-2 pr-3 font-medium">状態</th>
                <th className="py-2 pr-3 font-medium">締め日時</th>
                <th className="py-2 pl-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={p.periodStart}
                  className="border-border/50 border-b last:border-0"
                >
                  <td className="tabular py-2 pr-3">
                    {formatDateSlash(p.periodStart)}〜
                    {formatDateSlash(p.periodEnd)}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={p.status === "CLOSED" ? "success" : "outline"}
                    >
                      {p.status === "CLOSED" ? "締め済み" : "オープン"}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground py-2 pr-3 text-xs">
                    {p.closedAt
                      ? new Date(p.closedAt).toLocaleString("ja-JP")
                      : "—"}
                  </td>
                  <td className="py-2 pl-3">
                    {p.status === "OPEN" ? (
                      <CloseButton
                        periodStart={p.periodStart}
                        periodEnd={p.periodEnd}
                      />
                    ) : (
                      <ReopenButton periodStart={p.periodStart} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

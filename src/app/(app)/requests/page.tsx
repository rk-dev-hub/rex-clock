import { requireUser } from "@/features/auth/rbac";
import { dateOnlyStr } from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";
import { getLeaveBalance, listMyLeaveRequests } from "@/features/leave/usecase";
import { listMyCorrections } from "@/features/correction/usecase";
import {
  dayPartLabel,
  leaveTypeLabel,
  statusLabel,
} from "@/features/approval/usecase";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveForm } from "./leave-form";
import { CorrectionForm } from "./correction-form";
import { CancelRequestButton } from "./cancel-button";

export const metadata = { title: "申請 — RexClock" };
export const dynamic = "force-dynamic";

const statusVariant = {
  DRAFT: "outline",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELED: "outline",
} as const;

export default async function RequestsPage() {
  const user = await requireUser();
  const [balance, leaves, corrections] = await Promise.all([
    getLeaveBalance(user.id),
    listMyLeaveRequests(user.id),
    listMyCorrections(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">申請</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          休暇・打刻修正の申請と、その状況。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>休暇申請</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveForm balance={balance} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>打刻修正申請</CardTitle>
          </CardHeader>
          <CardContent>
            <CorrectionForm />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>休暇申請の状況</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">期間</th>
                <th className="py-2 pr-3 font-medium">種別</th>
                <th className="py-2 pr-3 font-medium">理由</th>
                <th className="py-2 pr-3 font-medium">状態</th>
                <th className="py-2 pr-3 font-medium">コメント</th>
                <th className="py-2 pl-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground py-3">
                    申請はありません。
                  </td>
                </tr>
              ) : null}
              {leaves.map((l) => (
                <tr
                  key={l.id}
                  className="border-border/50 border-b last:border-0"
                >
                  <td className="tabular py-1.5 pr-3">
                    {dateOnlyStr(l.startDate) === dateOnlyStr(l.endDate)
                      ? formatDateSlash(dateOnlyStr(l.startDate))
                      : `${formatDateSlash(dateOnlyStr(l.startDate))}〜${formatDateSlash(dateOnlyStr(l.endDate))}`}
                    {l.kind === "CANCELLATION" ? "（取消申請）" : ""}
                  </td>
                  <td className="py-1.5 pr-3">
                    {leaveTypeLabel(l.type)} {dayPartLabel(l.dayPart)}
                  </td>
                  <td
                    className="max-w-48 truncate py-1.5 pr-3"
                    title={l.reason}
                  >
                    {l.reason}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={statusVariant[l.status]}>
                      {statusLabel(l.status)}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground py-1.5 pr-3">
                    {l.decisionComment ?? "—"}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    {l.status === "PENDING" ? (
                      <CancelRequestButton kind="LEAVE" id={l.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>打刻修正申請の状況</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">対象日</th>
                <th className="py-2 pr-3 font-medium">明細</th>
                <th className="py-2 pr-3 font-medium">理由</th>
                <th className="py-2 pr-3 font-medium">状態</th>
                <th className="py-2 pr-3 font-medium">コメント</th>
                <th className="py-2 pl-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {corrections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground py-3">
                    申請はありません。
                  </td>
                </tr>
              ) : null}
              {corrections.map((c) => (
                <tr
                  key={c.id}
                  className="border-border/50 border-b last:border-0"
                >
                  <td className="tabular py-1.5 pr-3">
                    {formatDateSlash(dateOnlyStr(c.targetDate))}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">{c.lines.length} 件</td>
                  <td
                    className="max-w-48 truncate py-1.5 pr-3"
                    title={c.reason}
                  >
                    {c.reason}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={statusVariant[c.status]}>
                      {statusLabel(c.status)}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground py-1.5 pr-3">
                    {c.decisionComment ?? "—"}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    {c.status === "PENDING" ? (
                      <CancelRequestButton kind="CORRECTION" id={c.id} />
                    ) : null}
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

import Link from "next/link";
import { requireAdmin } from "@/features/auth/rbac";
import { listAuditLogs } from "@/features/admin/master-usecase";
import { buildAuditDiffLines } from "@/features/admin/audit-diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "監査ログ — RexClock" };
export const dynamic = "force-dynamic";

const ACTIONS = [
  "CLOCK_EDIT",
  "APPROVE",
  "REJECT",
  "CLOSE",
  "REOPEN",
  "USER_CREATE",
  "USER_DISABLE",
  "PASSWORD_RESET",
  "MASTER_CHANGE",
  "LEAVE_GRANT",
];

const ACTION_LABEL: Record<string, string> = {
  CLOCK_EDIT: "打刻編集",
  APPROVE: "承認",
  REJECT: "却下",
  CLOSE: "締め",
  REOPEN: "再オープン",
  USER_CREATE: "ユーザー作成",
  USER_DISABLE: "ユーザー無効化",
  PASSWORD_RESET: "パスワード",
  MASTER_CHANGE: "マスタ変更",
  LEAVE_GRANT: "有給付与/調整",
};

export default async function AuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action : undefined;
  const logs = await listAuditLogs({ action, limit: 200 });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">監査ログ</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          打刻編集・承認・締め・マスタ変更などの操作履歴（新しい順・最大 200
          件）。
        </p>
      </div>

      <div className="flex flex-wrap gap-1 text-xs">
        <Link
          href="/admin/audit"
          className={
            !action
              ? "bg-primary text-primary-foreground rounded px-2 py-1"
              : "border-border rounded border px-2 py-1"
          }
        >
          すべて
        </Link>
        {ACTIONS.map((a) => (
          <Link
            key={a}
            href={`/admin/audit?action=${a}`}
            className={
              action === a
                ? "bg-primary text-primary-foreground rounded px-2 py-1"
                : "border-border rounded border px-2 py-1"
            }
          >
            {ACTION_LABEL[a]}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>履歴（{logs.length}）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">日時</th>
                <th className="py-2 pr-3 font-medium">操作</th>
                <th className="py-2 pr-3 font-medium">操作者</th>
                <th className="py-2 pr-3 font-medium">対象</th>
                <th className="py-2 pr-3 font-medium">対象者</th>
                <th className="py-2 pl-3 font-medium">コメント / 変更</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-border/50 border-b align-top last:border-0"
                >
                  <td className="tabular py-1.5 pr-3 whitespace-nowrap">
                    {l.createdAt.toLocaleString("ja-JP")}
                  </td>
                  <td className="py-1.5 pr-3">
                    {ACTION_LABEL[l.action] ?? l.action}
                  </td>
                  <td className="py-1.5 pr-3">
                    {l.actor.employeeCode} {l.actor.name}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">
                    {l.targetType}
                    {l.targetId ? (
                      <span className="text-muted-foreground">
                        {" "}
                        {l.targetId.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3">
                    {l.subjectUser
                      ? `${l.subjectUser.employeeCode} ${l.subjectUser.name}`
                      : "—"}
                  </td>
                  <td className="text-muted-foreground py-1.5 pl-3 text-xs">
                    {l.comment ?? ""}
                    {l.before || l.after ? (
                      <details className="mt-0.5">
                        <summary className="cursor-pointer">差分</summary>
                        <ul className="mt-1 max-w-md list-inside list-disc space-y-0.5">
                          {buildAuditDiffLines(l.before, l.after).map((d) => (
                            <li
                              key={d.key}
                              className={cn(
                                d.kind === "added" && "text-success",
                                d.kind === "removed" && "text-destructive",
                              )}
                            >
                              {d.text}
                            </li>
                          ))}
                        </ul>
                      </details>
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

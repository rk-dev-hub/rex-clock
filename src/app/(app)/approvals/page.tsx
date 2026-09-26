import { requireAdmin } from "@/features/auth/rbac";
import { listPending } from "@/features/approval/usecase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApprovalRow } from "./approval-row";

export const metadata = { title: "承認待ち — RexClock" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const admin = await requireAdmin();
  const items = await listPending();

  // 自己申請は承認不可のため一覧から除外（本人の /requests から取消は可能）
  const actionable = items.filter((i) => i.requesterId !== admin.id);
  const ownPending = items.length - actionable.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">承認待ち</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          打刻修正・休暇・休暇取消の申請を 1 件ずつ確認して承認/却下します。
          {ownPending > 0
            ? ` 自分の申請 ${ownPending} 件は表示していません。`
            : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>未処理（{actionable.length}）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {actionable.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              承認待ちの申請はありません。
            </p>
          ) : (
            actionable.map((item) => (
              <ApprovalRow key={`${item.kind}:${item.id}`} item={item} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveAction,
  rejectAction,
  type ApprovalState,
} from "@/features/approval/actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PendingItem } from "@/features/approval/usecase";

const KIND_LABEL: Record<PendingItem["kind"], string> = {
  CORRECTION: "打刻修正",
  LEAVE: "休暇",
  LEAVE_CANCELLATION: "休暇取消",
};

export function ApprovalRow({ item }: { item: PendingItem }) {
  const router = useRouter();
  const [approving, startApprove] = useTransition();
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectState, rejectForm, rejecting] = useActionState<
    ApprovalState,
    FormData
  >(rejectAction, null);

  const rejectKind = item.kind === "CORRECTION" ? "CORRECTION" : "LEAVE";

  useEffect(() => {
    if (rejectState && !rejectState.ok) router.refresh();
  }, [rejectState, router]);

  return (
    <div
      className="border-border flex flex-col gap-2 rounded-lg border p-3"
      data-testid="approval-row"
      data-kind={item.kind}
      data-requester={item.requesterCode}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs font-medium">
          {KIND_LABEL[item.kind]}
        </span>
        <span className="font-medium">
          {item.requesterCode} {item.requesterName}
        </span>
        <span className="tabular text-muted-foreground">
          {item.targetLabel}
        </span>
        <span className="text-muted-foreground text-xs">
          {item.createdAt.toLocaleString("ja-JP")}
        </span>
      </div>

      <div className="text-sm">{item.detail}</div>
      <div className="text-muted-foreground text-sm">理由: {item.reason}</div>

      {approveErr ? (
        <p className="text-destructive text-xs">{approveErr}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={approving}
          onClick={() => {
            setApproveErr(null);
            startApprove(async () => {
              const r = await approveAction(item.kind, item.id);
              if (!r?.ok) {
                // 本人による取消等と競合した場合、この行は既に無効になっている
                // ため一覧を再取得して消す（さもないと押せる古い行が残り続ける）。
                setApproveErr(r?.message ?? "承認に失敗しました");
                router.refresh();
              }
            });
          }}
        >
          {approving ? "承認中…" : "承認"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowReject((v) => !v)}
        >
          却下
        </Button>
      </div>

      {showReject ? (
        <form action={rejectForm} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="kind" value={rejectKind} />
          <input type="hidden" name="id" value={item.id} />
          <label className="flex flex-1 flex-col gap-1 text-xs">
            却下理由（必須）
            <Input name="comment" required minLength={1} />
          </label>
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={rejecting}
          >
            {rejecting ? "処理中…" : "却下する"}
          </Button>
          {rejectState && !rejectState.ok ? (
            <span className="text-destructive text-xs">
              {rejectState.message}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

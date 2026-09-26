"use client";

import { useActionState } from "react";
import type { UserStatus } from "@prisma/client";
import {
  resetPasswordAction,
  setStatusAction,
  type AdminActionState,
} from "@/features/admin/actions";
import { Button } from "@/components/ui/button";

export function UserRowActions({
  userId,
  status,
  isSelf,
}: {
  userId: string;
  status: UserStatus;
  isSelf: boolean;
}) {
  const [resetState, resetForm, resetting] = useActionState<
    AdminActionState,
    FormData
  >(resetPasswordAction, null);
  const [statusState, statusForm, updating] = useActionState<
    AdminActionState,
    FormData
  >(setStatusAction, null);

  const nextStatus: UserStatus = status === "ACTIVE" ? "DISABLED" : "ACTIVE";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={resetForm}>
          <input type="hidden" name="userId" value={userId} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={resetting}
          >
            {resetting ? "…" : "PW リセット"}
          </Button>
        </form>

        <form action={statusForm}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={nextStatus} />
          <Button
            type="submit"
            variant={status === "ACTIVE" ? "destructive" : "secondary"}
            size="sm"
            disabled={updating || isSelf}
            title={isSelf ? "自分自身は変更できません" : undefined}
          >
            {updating ? "…" : status === "ACTIVE" ? "無効化" : "再有効化"}
          </Button>
        </form>
      </div>

      {resetState?.tempPassword ? (
        <p className="text-xs">
          新パスワード:{" "}
          <span className="font-mono text-sm">{resetState.tempPassword}</span>
        </p>
      ) : null}
      {(resetState && !resetState.ok) || (statusState && !statusState.ok) ? (
        <p className="text-destructive text-xs">
          {resetState?.message ?? statusState?.message}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useTransition, useState } from "react";
import { cancelOwnRequestAction } from "@/features/approval/actions";
import { Button } from "@/components/ui/button";

export function CancelRequestButton({
  kind,
  id,
}: {
  kind: "CORRECTION" | "LEAVE";
  id: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await cancelOwnRequestAction(kind, id);
            if (!r?.ok) setErr(r?.message ?? "取消に失敗しました");
          })
        }
      >
        {pending ? "…" : "取消"}
      </Button>
      {err ? <span className="text-destructive text-xs">{err}</span> : null}
    </span>
  );
}

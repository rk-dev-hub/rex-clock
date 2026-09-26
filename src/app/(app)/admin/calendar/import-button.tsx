"use client";

import { useState, useTransition } from "react";
import { importHolidaysAction } from "@/features/admin/master-actions";
import { Button } from "@/components/ui/button";

export function ImportHolidaysButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await importHolidaysAction();
            setErr(!r?.ok);
            setMsg(r?.message ?? null);
          })
        }
      >
        {pending ? "取込中…" : "内蔵データを取り込む"}
      </Button>
      {msg ? (
        <span
          className={err ? "text-destructive text-sm" : "text-success text-sm"}
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
}

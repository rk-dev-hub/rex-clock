"use client";

import { useActionState } from "react";
import { formatDateSlash } from "@/lib/date-range";
import {
  closePeriodAction,
  reopenPeriodAction,
  recomputeRangeAction,
  type MasterState,
} from "@/features/admin/master-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Banner({ s }: { s: MasterState }) {
  if (!s?.message) return null;
  return (
    <p
      className={
        s.ok
          ? "bg-success/10 text-success rounded-md px-3 py-2 text-sm"
          : "bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
      }
      role="alert"
    >
      {s.message}
    </p>
  );
}

export function CloseButton({
  periodStart,
  periodEnd,
}: {
  periodStart: string;
  periodEnd: string;
}) {
  const [state, action, pending] = useActionState<MasterState, FormData>(
    closePeriodAction,
    null,
  );
  return (
    <form
      action={action}
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `${formatDateSlash(periodStart)}〜${formatDateSlash(periodEnd)} を締めます。締め後は打刻・申請反映がロックされます。`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="reason" value="" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "処理中…" : "締める"}
      </Button>
      <Banner s={state} />
    </form>
  );
}

export function ReopenButton({ periodStart }: { periodStart: string }) {
  const [state, action, pending] = useActionState<MasterState, FormData>(
    reopenPeriodAction,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="periodStart" value={periodStart} />
      <label className="flex flex-col gap-1 text-xs">
        再オープン理由（必須）
        <Input name="reason" required className="h-9 w-56" />
      </label>
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        {pending ? "処理中…" : "再オープン"}
      </Button>
      <Banner s={state} />
    </form>
  );
}

export function RecomputeForm({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, action, pending] = useActionState<MasterState, FormData>(
    recomputeRangeAction,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        開始
        <Input
          name="from"
          type="date"
          defaultValue={defaultFrom}
          className="h-9"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        終了
        <Input name="to" type="date" defaultValue={defaultTo} className="h-9" />
      </label>
      <input type="hidden" name="userId" value="" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "再計算中…" : "全員を再計算"}
      </Button>
      <Banner s={state} />
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import {
  submitLeaveAction,
  type LeaveFormState,
} from "@/features/leave/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function LeaveForm({ balance }: { balance: number }) {
  const [state, action, pending] = useActionState<LeaveFormState, FormData>(
    submitLeaveAction,
    null,
  );
  const [single, setSingle] = useState(true);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? (
        <p
          className={
            state.ok && !state.warning
              ? "bg-success/10 text-success rounded-md px-3 py-2 text-sm"
              : state.ok
                ? "bg-warning/20 text-warning-foreground rounded-md px-3 py-2 text-sm"
                : "bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          }
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <p className="text-muted-foreground text-sm">
        現在の有給残日数: <span className="tabular font-medium">{balance}</span>{" "}
        日
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="種別" htmlFor="type">
          <select
            id="type"
            name="type"
            defaultValue="PAID"
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          >
            <option value="PAID">有給休暇</option>
            <option value="ABSENCE">欠勤</option>
            <option value="SPECIAL_UNPAID">特別休暇（無給）</option>
          </select>
        </Field>

        <Field label="期間" htmlFor="range-mode">
          <select
            id="range-mode"
            value={single ? "single" : "range"}
            onChange={(e) => setSingle(e.target.value === "single")}
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          >
            <option value="single">単日</option>
            <option value="range">期間</option>
          </select>
        </Field>

        <Field
          label={single ? "取得日" : "開始日"}
          htmlFor="startDate"
          error={state?.fields?.startDate}
        >
          <Input id="startDate" name="startDate" type="date" required />
        </Field>

        {single ? (
          <Field label="半休区分" htmlFor="dayPart">
            <select
              id="dayPart"
              name="dayPart"
              defaultValue="FULL"
              className="border-input bg-background h-10 rounded-md border px-3 text-sm"
            >
              <option value="FULL">全日</option>
              <option value="AM">午前半休</option>
              <option value="PM">午後半休</option>
            </select>
          </Field>
        ) : (
          <Field
            label="終了日"
            htmlFor="endDate"
            error={state?.fields?.endDate}
          >
            <Input id="endDate" name="endDate" type="date" required />
          </Field>
        )}
      </div>

      <Field label="理由" htmlFor="reason" error={state?.fields?.reason}>
        <Input id="reason" name="reason" required />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "申請中…" : "休暇を申請"}
        </Button>
      </div>
    </form>
  );
}

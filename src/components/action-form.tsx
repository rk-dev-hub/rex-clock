"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type ActionResult = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
} | null;

type ActionFn = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/**
 * Server Action + メッセージバナー + 送信ボタンをまとめた汎用フォーム。
 * children はプレーンな要素（RSC 境界を越えるため関数 child は不可）。
 * フィールド単位のエラーは message に集約して表示する。
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "処理中…",
  hidden,
  children,
  confirm,
}: {
  action: ActionFn;
  submitLabel: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
  confirm?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    action,
    null,
  );

  const fieldMsgs = state?.fields
    ? Object.entries(state.fields).map(([k, v]) => `${k}: ${v}`)
    : [];

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {hidden
        ? Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))
        : null}

      {state?.message || fieldMsgs.length > 0 ? (
        <div
          className={
            state?.ok
              ? "bg-success/10 text-success rounded-md px-3 py-2 text-sm"
              : "bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          }
          role="alert"
        >
          {state?.message ? <p>{state.message}</p> : null}
          {fieldMsgs.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-xs">
              {fieldMsgs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {children}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

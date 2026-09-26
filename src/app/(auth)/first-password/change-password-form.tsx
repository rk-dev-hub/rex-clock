"use client";

import { useActionState } from "react";
import { changePasswordAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function ChangePasswordForm({
  submitLabel = "パスワードを変更",
}: {
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error ? (
        <p
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <Field
        label="現在のパスワード"
        htmlFor="currentPassword"
        error={state?.fields?.currentPassword}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state?.fields?.currentPassword}
        />
      </Field>

      <Field
        label="新しいパスワード"
        htmlFor="newPassword"
        hint="8 文字以上"
        error={state?.fields?.newPassword}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={!!state?.fields?.newPassword}
        />
      </Field>

      <Field
        label="新しいパスワード（確認）"
        htmlFor="confirmPassword"
        error={state?.fields?.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={!!state?.fields?.confirmPassword}
        />
      </Field>

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "変更中…" : submitLabel}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {state?.error ? (
        <p
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <Field
        label="メールアドレス"
        htmlFor="email"
        error={state?.fields?.email}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={!!state?.fields?.email}
        />
      </Field>

      <Field
        label="パスワード"
        htmlFor="password"
        error={state?.fields?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state?.fields?.password}
        />
      </Field>

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "ログイン中…" : "ログイン"}
      </Button>
    </form>
  );
}

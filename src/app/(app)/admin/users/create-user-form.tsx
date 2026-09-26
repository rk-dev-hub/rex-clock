"use client";

import { useActionState, useRef } from "react";
import {
  createUserAction,
  type AdminActionState,
} from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

type PatternOption = { id: string; name: string; isDefault: boolean };

export function CreateUserForm({ patterns }: { patterns: PatternOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<AdminActionState, FormData>(
    (prev, fd) =>
      createUserAction(prev, fd).then((res) => {
        if (res?.ok) formRef.current?.reset();
        return res;
      }),
    null,
  );

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      {state?.message ? (
        <div
          className={
            state.ok
              ? "bg-success/10 text-success rounded-md px-3 py-2 text-sm"
              : "bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          }
          role="alert"
        >
          <p>{state.message}</p>
          {state.tempPassword ? (
            <p className="mt-1 font-mono text-base">{state.tempPassword}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="氏名" htmlFor="name" error={state?.fields?.name}>
          <Input id="name" name="name" required />
        </Field>
        <Field
          label="社員番号"
          htmlFor="employeeCode"
          error={state?.fields?.employeeCode}
        >
          <Input id="employeeCode" name="employeeCode" required />
        </Field>
        <Field
          label="メールアドレス"
          htmlFor="email"
          error={state?.fields?.email}
        >
          <Input id="email" name="email" type="email" required />
        </Field>
        <Field
          label="入社日"
          htmlFor="hireDate"
          error={state?.fields?.hireDate}
        >
          <Input id="hireDate" name="hireDate" type="date" required />
        </Field>
        <Field label="雇用区分" htmlFor="employmentType">
          <select
            id="employmentType"
            name="employmentType"
            defaultValue="FULL_TIME"
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          >
            <option value="FULL_TIME">正社員</option>
            <option value="PART_TIME">パート</option>
            <option value="CONTRACT">契約</option>
          </select>
        </Field>
        <Field label="ロール" htmlFor="role">
          <select
            id="role"
            name="role"
            defaultValue="EMPLOYEE"
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          >
            <option value="EMPLOYEE">従業員</option>
            <option value="ADMIN">管理者</option>
          </select>
        </Field>
        <Field label="勤務パターン" htmlFor="workPatternId">
          <select
            id="workPatternId"
            name="workPatternId"
            defaultValue=""
            className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          >
            <option value="">既定</option>
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? "（既定）" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="初期パスワード"
          htmlFor="initialPassword"
          hint="空欄で自動生成。作成後に一度だけ表示されます。"
          error={state?.fields?.initialPassword}
        >
          <Input
            id="initialPassword"
            name="initialPassword"
            type="text"
            autoComplete="off"
          />
        </Field>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "作成中…" : "ユーザーを発行"}
        </Button>
      </div>
    </form>
  );
}

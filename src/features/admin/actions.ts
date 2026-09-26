"use server";

import { revalidatePath } from "next/cache";
import {
  createUser,
  resetUserPassword,
  setUserStatus,
} from "@/features/admin/usecase";

export type AdminActionState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
  tempPassword?: string;
} | null;

export async function createUserAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const result = await createUser(Object.fromEntries(formData));
  if (!result.ok) {
    return {
      ok: false,
      message: result.error.message,
      fields: result.error.fields,
    };
  }
  revalidatePath("/admin/users");
  return {
    ok: true,
    message:
      "ユーザーを作成しました。以下の初期パスワードを本人へ伝えてください。",
    tempPassword: result.value.tempPassword,
  };
}

export async function resetPasswordAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const result = await resetUserPassword({
    userId: formData.get("userId"),
    initialPassword: formData.get("initialPassword") ?? "",
  });
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidatePath("/admin/users");
  return {
    ok: true,
    message: "パスワードをリセットしました。",
    tempPassword: result.value.tempPassword,
  };
}

export async function setStatusAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const result = await setUserStatus({
    userId: formData.get("userId"),
    status: formData.get("status"),
  });
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidatePath("/admin/users");
  return { ok: true, message: "状態を更新しました。" };
}

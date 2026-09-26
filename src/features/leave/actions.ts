"use server";

import { revalidatePath } from "next/cache";
import {
  submitLeaveRequest,
  submitLeaveCancellation,
} from "@/features/leave/usecase";

export type LeaveFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
  warning?: boolean;
} | null;

export async function submitLeaveAction(
  _prev: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const r = await submitLeaveRequest({
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || formData.get("startDate"),
    dayPart: formData.get("dayPart") || "FULL",
    reason: formData.get("reason"),
  });
  if (!r.ok) {
    return { ok: false, message: r.error.message, fields: r.error.fields };
  }
  revalidatePath("/requests");
  revalidatePath("/approvals");
  return {
    ok: true,
    warning: r.value.balanceWarning,
    message: r.value.balanceWarning
      ? "申請しました。有給残日数が不足しています（管理者の判断で承認されます）。"
      : "申請しました。",
  };
}

export async function submitLeaveCancellationAction(
  _prev: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const r = await submitLeaveCancellation({
    requestId: formData.get("requestId"),
    reason: formData.get("reason"),
  });
  if (!r.ok) return { ok: false, message: r.error.message };
  revalidatePath("/requests");
  revalidatePath("/approvals");
  return { ok: true, message: "取消申請しました。" };
}

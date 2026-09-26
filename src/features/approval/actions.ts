"use server";

import { revalidatePath } from "next/cache";
import {
  approveCorrection,
  rejectCorrection,
  cancelCorrection,
} from "@/features/correction/usecase";
import {
  approveLeave,
  rejectLeave,
  cancelLeaveRequest,
} from "@/features/leave/usecase";
import type { Result } from "@/lib/result";

export type ApprovalState = { ok: boolean; message?: string } | null;

function done(r: Result): ApprovalState {
  // 失敗時（例: 本人による取消と競合した CONFLICT）も再検証する。
  // そうしないと画面上に処理不能な古い行が残り続けてしまう。
  revalidatePath("/approvals");
  revalidatePath("/requests");
  revalidatePath("/attendance");
  revalidatePath("/reports");
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true };
}

export async function approveAction(
  kind: "CORRECTION" | "LEAVE" | "LEAVE_CANCELLATION",
  id: string,
  comment?: string,
): Promise<ApprovalState> {
  const r =
    kind === "CORRECTION"
      ? await approveCorrection({ requestId: id, comment })
      : await approveLeave({ requestId: id, comment });
  return done(r);
}

export async function rejectAction(
  _prev: ApprovalState,
  formData: FormData,
): Promise<ApprovalState> {
  const kind = String(formData.get("kind"));
  const id = String(formData.get("id"));
  const comment = String(formData.get("comment") ?? "");
  const r =
    kind === "CORRECTION"
      ? await rejectCorrection({ requestId: id, comment })
      : await rejectLeave({ requestId: id, comment });
  return done(r);
}

export async function cancelOwnRequestAction(
  kind: "CORRECTION" | "LEAVE",
  id: string,
): Promise<ApprovalState> {
  const r =
    kind === "CORRECTION"
      ? await cancelCorrection(id)
      : await cancelLeaveRequest(id);
  return done(r);
}

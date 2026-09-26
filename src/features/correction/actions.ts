"use server";

import { revalidatePath } from "next/cache";
import {
  submitCorrection,
  listEventsForCorrectionForm,
  type CorrectableEvent,
} from "@/features/correction/usecase";
import type { CorrectionLineForm } from "@/features/correction/schema";

/** フォームで「対象の打刻」の選択肢を出すための一覧取得。失敗時は空配列。 */
export async function listEventsForDateAction(
  targetDate: string,
): Promise<CorrectableEvent[]> {
  const r = await listEventsForCorrectionForm(targetDate);
  return r.ok ? r.value : [];
}

export type CorrectionFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
} | null;

/** クライアントから配列を JSON 文字列で受ける（動的明細のため FormData に載せづらい）。 */
export async function submitCorrectionAction(
  _prev: CorrectionFormState,
  formData: FormData,
): Promise<CorrectionFormState> {
  let lines: CorrectionLineForm[];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, message: "明細の形式が不正です。" };
  }

  const r = await submitCorrection({
    targetDate: formData.get("targetDate"),
    reason: formData.get("reason"),
    lines,
  });
  if (!r.ok) {
    return { ok: false, message: r.error.message, fields: r.error.fields };
  }
  revalidatePath("/requests");
  revalidatePath("/approvals");
  return { ok: true, message: "打刻修正を申請しました。" };
}

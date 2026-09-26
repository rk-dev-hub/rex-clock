"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/result";
import {
  updateWorkRule,
  upsertWorkPattern,
  importHolidays,
  overrideCalendarDay,
  addLeaveGrant,
  adjustLeaveLedger,
  recomputeRange,
} from "@/features/admin/master-usecase";
import { closePeriod, reopenPeriod } from "@/features/closing/usecase";

export type MasterState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
} | null;

function finish(r: Result, paths: string[], okMsg: string): MasterState {
  if (!r.ok) {
    return { ok: false, message: r.error.message, fields: r.error.fields };
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true, message: okMsg };
}

export async function updateWorkRuleAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const r = await updateWorkRule(Object.fromEntries(fd));
  return finish(
    r,
    ["/admin/work-rules", "/reports", "/attendance"],
    "就業規則を更新しました。反映には「再計算」を実行してください。",
  );
}

export async function upsertPatternAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const days = JSON.parse(String(fd.get("days") ?? "[]"));
  const r = await upsertWorkPattern({
    patternId: fd.get("patternId"),
    name: fd.get("name"),
    days,
  });
  return finish(r, ["/admin/patterns"], "勤務パターンを更新しました。");
}

export async function importHolidaysAction(): Promise<MasterState> {
  const r = await importHolidays();
  if (!r.ok) return { ok: false, message: r.error.message };
  revalidatePath("/admin/calendar");
  return { ok: true, message: `祝日 ${r.value.count} 件を取り込みました。` };
}

export async function overrideCalendarAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const r = await overrideCalendarDay(Object.fromEntries(fd));
  return finish(
    r,
    ["/admin/calendar", "/attendance", "/reports"],
    "カレンダーを上書きし、影響日を再計算しました。",
  );
}

export async function addLeaveGrantAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const r = await addLeaveGrant(Object.fromEntries(fd));
  return finish(
    r,
    ["/admin/leave-grants", "/requests"],
    "有給を付与しました。",
  );
}

export async function adjustLedgerAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const r = await adjustLeaveLedger(Object.fromEntries(fd));
  return finish(
    r,
    ["/admin/leave-grants", "/requests"],
    "残数を調整しました。",
  );
}

export async function recomputeRangeAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const r = await recomputeRange({
    from: fd.get("from"),
    to: fd.get("to"),
    userId: fd.get("userId") ?? "",
  });
  if (!r.ok)
    return { ok: false, message: r.error.message, fields: r.error.fields };
  revalidatePath("/reports");
  revalidatePath("/attendance");
  return {
    ok: true,
    message: `${r.value.users} 名 × ${r.value.days} 日を再計算しました。`,
  };
}

export async function closePeriodAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const r = await closePeriod({
    periodStart: fd.get("periodStart"),
    reason: fd.get("reason") ?? undefined,
  });
  return finish(r, ["/admin/closing", "/reports"], "期間を締めました。");
}

export async function reopenPeriodAction(
  _prev: MasterState,
  fd: FormData,
): Promise<MasterState> {
  const r = await reopenPeriod({
    periodStart: fd.get("periodStart"),
    reason: fd.get("reason"),
  });
  return finish(
    r,
    ["/admin/closing", "/reports"],
    "期間を再オープンしました。",
  );
}

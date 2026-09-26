"use server";

import { revalidatePath } from "next/cache";
import type { ClockType } from "@prisma/client";
import { punch } from "@/features/time-clock/usecase";

export type PunchResult = { ok: boolean; message?: string };

export async function punchAction(type: ClockType): Promise<PunchResult> {
  const r = await punch(type);
  if (!r.ok) return { ok: false, message: r.error.message };
  revalidatePath("/");
  revalidatePath("/attendance");
  return { ok: true };
}

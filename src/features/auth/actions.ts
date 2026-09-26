"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { auth, signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { recordAudit } from "@/lib/audit";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { fieldErrors } from "@/lib/zod";
import { loginSchema, changePasswordSchema } from "@/features/auth/schema";

export type FormState = {
  error?: string;
  fields?: Record<string, string>;
} | null;

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fields: fieldErrors(parsed.error) };
  }
  const email = parsed.data.email.trim().toLowerCase();
  const next = safeNext(parsed.data.next);

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`login:${ip}:${email}`, 10, 5 * 60_000);
  if (!rl.ok) {
    return {
      error: `試行回数が多すぎます。${rl.retryAfterSec} 秒後に再度お試しください。`,
    };
  }

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { error: "メールアドレスまたはパスワードが違います。" };
    }
    throw e;
  }

  resetRateLimit(`login:${ip}:${email}`);
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fields: fieldErrors(parsed.error) };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");

  const okCurrent = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!okCurrent) {
    return { fields: { currentPassword: "現在のパスワードが違います" } };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await recordAudit(tx, {
      actorId: userId,
      action: "PASSWORD_RESET",
      targetType: "User",
      targetId: userId,
      subjectUserId: userId,
      comment: "本人によるパスワード変更",
    });
  });

  redirect("/");
}

/** オープンリダイレクト防止: 自サイト内の絶対パスのみ許可。 */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

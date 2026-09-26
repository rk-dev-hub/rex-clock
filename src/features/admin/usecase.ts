import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { recordAudit } from "@/lib/audit";
import { getAdminActor, isErr } from "@/features/auth/rbac";
import { ok, errWithDefault, type Result } from "@/lib/result";
import { fieldErrors } from "@/lib/zod";
import {
  createUserSchema,
  resetPasswordSchema,
  setStatusSchema,
} from "@/features/admin/schema";

/** 記号を含む読みやすい一時パスワードを生成する。 */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

async function resolveWorkPatternId(given?: string): Promise<string | null> {
  if (given) {
    const found = await prisma.workPattern.findUnique({ where: { id: given } });
    return found?.id ?? null;
  }
  const def =
    (await prisma.workPattern.findFirst({ where: { isDefault: true } })) ??
    (await prisma.workPattern.findFirst());
  return def?.id ?? null;
}

export type CreateUserResult = { id: string; tempPassword: string };

export async function createUser(
  raw: unknown,
): Promise<Result<CreateUserResult>> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return errWithDefault("VALIDATION", undefined, fieldErrors(parsed.error));
  }
  const input = parsed.data;
  const email = input.email.trim().toLowerCase();

  const [dupEmail, dupCode] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { employeeCode: input.employeeCode } }),
  ]);
  if (dupEmail) {
    return errWithDefault(
      "CONFLICT",
      "このメールアドレスは既に使われています",
      {
        email: "既に使われています",
      },
    );
  }
  if (dupCode) {
    return errWithDefault("CONFLICT", "この社員番号は既に使われています", {
      employeeCode: "既に使われています",
    });
  }

  const workPatternId = await resolveWorkPatternId(
    input.workPatternId || undefined,
  );
  if (!workPatternId) {
    return errWithDefault(
      "CONFLICT",
      "勤務パターンが未設定です。先に勤務パターンを作成してください。",
    );
  }

  const tempPassword = input.initialPassword || generatePassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email,
        employeeCode: input.employeeCode,
        passwordHash,
        role: input.role,
        employmentType: input.employmentType,
        hireDate: new Date(`${input.hireDate}T00:00:00Z`),
        workPatternId,
        mustChangePassword: true,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "USER_CREATE",
      targetType: "User",
      targetId: created.id,
      subjectUserId: created.id,
      after: {
        email: created.email,
        employeeCode: created.employeeCode,
        role: created.role,
      },
    });
    return created;
  });

  return ok({ id: user.id, tempPassword });
}

export async function resetUserPassword(
  raw: unknown,
): Promise<Result<{ tempPassword: string }>> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return errWithDefault("VALIDATION");

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!target) return errWithDefault("NOT_FOUND");

  const tempPassword = parsed.data.initialPassword || generatePassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { passwordHash, mustChangePassword: true },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "PASSWORD_RESET",
      targetType: "User",
      targetId: target.id,
      subjectUserId: target.id,
      comment: "管理者によるパスワードリセット",
    });
  });

  return ok({ tempPassword });
}

export async function setUserStatus(raw: unknown): Promise<Result> {
  const actor = await getAdminActor();
  if (isErr(actor)) return actor;

  const parsed = setStatusSchema.safeParse(raw);
  if (!parsed.success) return errWithDefault("VALIDATION");

  if (parsed.data.userId === actor.id && parsed.data.status === "DISABLED") {
    return errWithDefault("CONFLICT", "自分自身を無効化することはできません");
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!target) return errWithDefault("NOT_FOUND");
  if (target.status === parsed.data.status) return ok(undefined);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { status: parsed.data.status },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "USER_DISABLE",
      targetType: "User",
      targetId: target.id,
      subjectUserId: target.id,
      before: { status: target.status },
      after: { status: parsed.data.status },
    });
  });

  return ok(undefined);
}

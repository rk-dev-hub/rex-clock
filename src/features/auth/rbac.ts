import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { errWithDefault, type Err } from "@/lib/result";
import type { Role, UserStatus } from "@prisma/client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
};

async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || u.status !== "ACTIVE") return null;
  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
  };
}

/**
 * ログイン必須。未ログイン/無効化なら /login へ redirect。
 * `mustChangePassword` の強制は (app)/layout で行うため、ここでは判定しない。
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** ADMIN 必須。 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/** 本人 or ADMIN 必須。画面遷移用（違反時は redirect）。 */
export async function requireSelfOrAdmin(userId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.id !== userId) redirect("/");
  return user;
}

// ---- Server Action 用（redirect ではなく Result のエラーを返す） ----

export async function getActor(): Promise<SessionUser | Err> {
  const user = await currentUser();
  if (!user) return errWithDefault("UNAUTHENTICATED");
  return user;
}

export async function getAdminActor(): Promise<SessionUser | Err> {
  const actor = await getActor();
  if ("ok" in actor) return actor; // Err
  if (actor.role !== "ADMIN") return errWithDefault("FORBIDDEN");
  return actor;
}

export function isErr(v: SessionUser | Err): v is Err {
  return "ok" in v && v.ok === false;
}

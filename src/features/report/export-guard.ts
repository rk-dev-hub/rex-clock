import { auth } from "@/lib/auth";

export type ExportActor =
  | { ok: true; userId: string; role: "EMPLOYEE" | "ADMIN" }
  | { ok: false; status: 401 | 403 };

/**
 * Route Handler 用の認可。requireSelfOrAdmin(targetUserId)。
 * all=true を要求できるのは ADMIN のみ。
 */
export async function authorizeExport(
  targetUserId: string | null,
  wantsAll: boolean,
): Promise<ExportActor> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || u.status !== "ACTIVE") return { ok: false, status: 401 };

  if (wantsAll) {
    if (u.role !== "ADMIN") return { ok: false, status: 403 };
    return { ok: true, userId: u.id, role: u.role };
  }

  if (!targetUserId) return { ok: false, status: 403 };
  if (u.role !== "ADMIN" && u.id !== targetUserId) {
    return { ok: false, status: 403 };
  }
  return { ok: true, userId: u.id, role: u.role };
}

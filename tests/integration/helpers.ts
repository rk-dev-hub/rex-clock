import { vi } from "vitest";
import type { Role, UserStatus } from "@prisma/client";

/**
 * RBAC が読む Auth.js の `auth()` を差し替えるためのモック。
 * 各テストの先頭で vi.mock("@/lib/auth", ...) と併用する。
 */
export function fakeSession(user: {
  id: string;
  name?: string;
  email?: string;
  role: Role;
  status?: UserStatus;
  mustChangePassword?: boolean;
}) {
  return {
    user: {
      id: user.id,
      name: user.name ?? "テスト",
      email: user.email ?? "test@example.com",
      role: user.role,
      status: user.status ?? "ACTIVE",
      mustChangePassword: user.mustChangePassword ?? false,
    },
  };
}

/** 現在セッションを切り替える可変ホルダ。 */
export const sessionHolder: { current: ReturnType<typeof fakeSession> | null } =
  { current: null };

vi.mock("@/lib/auth", () => ({
  auth: async () => sessionHolder.current,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

// next/cache の revalidatePath はテスト環境では no-op
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

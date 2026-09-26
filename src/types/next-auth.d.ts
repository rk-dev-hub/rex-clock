import type { Role, UserStatus } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Session / User の拡張のみ（アプリ側で参照する）。
// JWT は Record<string, unknown> ベースのため auth.ts 内でキャストして扱う。
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      status: UserStatus;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    status: UserStatus;
    mustChangePassword: boolean;
  }
}

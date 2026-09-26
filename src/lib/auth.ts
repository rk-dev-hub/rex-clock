import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import type { Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type TokenExtras = {
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8 時間
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        // 無効化ユーザー・パスワード誤りは区別せず一律 null。
        if (!user || user.status !== "ACTIVE") return null;

        const okPassword = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );
        if (!okPassword) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as Partial<TokenExtras> & { id?: string };
        return {
          ...token,
          uid: u.id,
          role: u.role,
          status: u.status,
          mustChangePassword: u.mustChangePassword,
        };
      }
      // 後続リクエスト: 可変かつセキュリティに関わる項目のみ DB から最新化。
      const uid = token.uid;
      if (typeof uid === "string") {
        const fresh = await prisma.user.findUnique({
          where: { id: uid },
          select: { role: true, status: true, mustChangePassword: true },
        });
        if (fresh) {
          return {
            ...token,
            role: fresh.role,
            status: fresh.status,
            mustChangePassword: fresh.mustChangePassword,
          };
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = typeof token.uid === "string" ? token.uid : "";
      session.user.role = token.role as Role;
      session.user.status = token.status as UserStatus;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      return session;
    },
  },
});

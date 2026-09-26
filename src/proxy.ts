import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16: 旧 middleware。ここでは「未ログインなら /login へ」の楽観的リダイレクトのみ。
// 実際の認可（ロール・本人確認・無効化）は各 Server Component / Server Action で行う。

const PUBLIC_PATHS = ["/login"];

// Auth.js v5(JWT) のセッション Cookie 名。dev は接頭辞なし、prod は __Secure-。
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 静的アセット・API・Auth.js エンドポイントは除外。
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

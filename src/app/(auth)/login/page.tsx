import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン — RexClock" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user?.id && session.user.status === "ACTIVE") {
    redirect("/");
  }

  const next = typeof sp.next === "string" ? sp.next : "/";
  const changed = sp.changed === "1";

  return (
    <Card className="bg-card/90 shadow-xl shadow-sky-950/10 backdrop-blur">
      <CardHeader>
        <CardTitle>ログイン</CardTitle>
        <CardDescription>勤怠管理システム</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {changed ? (
          <p className="bg-success/10 text-success rounded-md px-3 py-2 text-sm">
            パスワードを変更しました。新しいパスワードでログインしてください。
          </p>
        ) : null}
        <LoginForm next={next} />
        <p className="text-muted-foreground text-xs">
          アカウントは管理者が発行します。ログインできない場合は管理者にお問い合わせください。
        </p>
        <p className="text-muted-foreground text-xs">
          <Link href="/" className="underline">
            トップへ
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

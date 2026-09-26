import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "パスワード変更 — RexClock" };

export default async function FirstPasswordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <Card className="bg-card/90 shadow-xl shadow-sky-950/10 backdrop-blur">
      <CardHeader>
        <CardTitle>パスワードの変更</CardTitle>
        <CardDescription>
          初回ログインのため、新しいパスワードを設定してください。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm submitLabel="設定して続ける" />
      </CardContent>
    </Card>
  );
}

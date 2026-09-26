import { requireAdmin } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  roleLabel,
  employmentLabel,
  statusLabel,
} from "@/features/admin/labels";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";

export const metadata = { title: "ユーザー管理 — RexClock" };

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const [users, patterns] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { employeeCode: "asc" }],
      include: { workPattern: { select: { name: true } } },
    }),
    prisma.workPattern.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isDefault: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title">ユーザー管理</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          アカウントの発行、パスワードリセット、有効/無効の切り替え。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ユーザー一覧（{users.length}）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">社員番号</th>
                <th className="py-2 pr-3 font-medium">氏名</th>
                <th className="py-2 pr-3 font-medium">メール</th>
                <th className="py-2 pr-3 font-medium">ロール</th>
                <th className="py-2 pr-3 font-medium">雇用区分</th>
                <th className="py-2 pr-3 font-medium">勤務パターン</th>
                <th className="py-2 pr-3 font-medium">状態</th>
                <th className="py-2 pl-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-border/60 border-b">
                  <td className="py-2 pr-3 font-mono text-xs">
                    {u.employeeCode}
                  </td>
                  <td className="py-2 pr-3">
                    {u.name}
                    {u.id === admin.id ? (
                      <span className="text-muted-foreground ml-1 text-xs">
                        (自分)
                      </span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground py-2 pr-3">{u.email}</td>
                  <td className="py-2 pr-3">{roleLabel[u.role]}</td>
                  <td className="py-2 pr-3">
                    {employmentLabel[u.employmentType]}
                  </td>
                  <td className="py-2 pr-3">{u.workPattern.name}</td>
                  <td className="py-2 pr-3">
                    <Badge
                      variant={
                        u.status === "ACTIVE" ? "success" : "destructive"
                      }
                    >
                      {statusLabel[u.status]}
                    </Badge>
                    {u.mustChangePassword ? (
                      <Badge variant="warning" className="ml-1">
                        PW未変更
                      </Badge>
                    ) : null}
                  </td>
                  <td className="py-2 pl-3">
                    <UserRowActions
                      userId={u.id}
                      status={u.status}
                      isSelf={u.id === admin.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>新規ユーザーを発行</CardTitle>
          <CardDescription>
            作成時に初期パスワードが一度だけ表示されます。本人は初回ログインで変更します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm patterns={patterns} />
        </CardContent>
      </Card>
    </div>
  );
}

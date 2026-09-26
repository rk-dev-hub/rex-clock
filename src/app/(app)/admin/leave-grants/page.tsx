import { requireAdmin } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr } from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";
import { getLeaveBalance } from "@/features/leave/usecase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  addLeaveGrantAction,
  adjustLedgerAction,
} from "@/features/admin/master-actions";

export const metadata = { title: "有給付与 — RexClock" };
export const dynamic = "force-dynamic";

export default async function LeaveGrantsPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { employeeCode: "asc" },
    select: { id: true, name: true, employeeCode: true },
  });
  const balances = await Promise.all(
    users.map((u) => getLeaveBalance(u.id, dateOnlyStr(new Date()))),
  );
  const grants = await prisma.leaveGrant.findMany({
    orderBy: { grantDate: "desc" },
    take: 50,
    include: { user: { select: { name: true, employeeCode: true } } },
  });

  const userOptions = users.map((u) => (
    <option key={u.id} value={u.id}>
      {u.employeeCode} {u.name}
    </option>
  ));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">有給付与</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          有給の付与と残数調整。消化は失効が近い付与から自動で行われます。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>現在の残数</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">社員番号</th>
                <th className="py-2 pr-3 font-medium">氏名</th>
                <th className="py-2 pl-3 text-right font-medium">残日数</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  className="border-border/50 border-b last:border-0"
                >
                  <td className="tabular py-1.5 pr-3">{u.employeeCode}</td>
                  <td className="py-1.5 pr-3">{u.name}</td>
                  <td className="tabular py-1.5 pl-3 text-right font-medium">
                    {balances[i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>付与</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={addLeaveGrantAction} submitLabel="付与する">
              <>
                <Field label="対象者" htmlFor="g-user">
                  <select
                    id="g-user"
                    name="userId"
                    className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                  >
                    {userOptions}
                  </select>
                </Field>
                <Field label="日数（0.5 単位）" htmlFor="grantedDays">
                  <Input
                    id="grantedDays"
                    name="grantedDays"
                    type="number"
                    step="0.5"
                    defaultValue="10"
                  />
                </Field>
                <Field label="付与日" htmlFor="grantDate">
                  <Input id="grantDate" name="grantDate" type="date" required />
                </Field>
                <Field label="失効日" htmlFor="expiryDate">
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    required
                  />
                </Field>
                <Field label="理由" htmlFor="g-reason">
                  <Input
                    id="g-reason"
                    name="reason"
                    defaultValue="法定付与"
                    required
                  />
                </Field>
              </>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>残数調整</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={adjustLedgerAction} submitLabel="調整する">
              <>
                <Field label="対象者" htmlFor="a-user">
                  <select
                    id="a-user"
                    name="userId"
                    className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                  >
                    {userOptions}
                  </select>
                </Field>
                <Field label="増減日数（±, 0.5 単位）" htmlFor="days">
                  <Input
                    id="days"
                    name="days"
                    type="number"
                    step="0.5"
                    placeholder="例: -1 / 2.5"
                  />
                </Field>
                <Field label="発生日" htmlFor="effectiveDate">
                  <Input
                    id="effectiveDate"
                    name="effectiveDate"
                    type="date"
                    required
                  />
                </Field>
                <Field label="理由" htmlFor="a-note">
                  <Input id="a-note" name="note" required />
                </Field>
              </>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>付与履歴</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">対象者</th>
                <th className="py-2 pr-3 text-right font-medium">日数</th>
                <th className="py-2 pr-3 font-medium">付与日</th>
                <th className="py-2 pr-3 font-medium">失効日</th>
                <th className="py-2 pl-3 font-medium">理由</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr
                  key={g.id}
                  className="border-border/50 border-b last:border-0"
                >
                  <td className="py-1.5 pr-3">
                    {g.user.employeeCode} {g.user.name}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {Number(g.grantedDays)}
                  </td>
                  <td className="tabular py-1.5 pr-3">
                    {formatDateSlash(dateOnlyStr(g.grantDate))}
                  </td>
                  <td className="tabular py-1.5 pr-3">
                    {formatDateSlash(dateOnlyStr(g.expiryDate))}
                  </td>
                  <td className="text-muted-foreground py-1.5 pl-3">
                    {g.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

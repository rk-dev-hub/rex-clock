import { requireAdmin } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import { dateOnlyStr, dateOnlyUtc, jstDateStr } from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { dayTypeLabel } from "@/features/calendar/labels";
import { overrideCalendarAction } from "@/features/admin/master-actions";
import { ImportHolidaysButton } from "./import-button";

export const metadata = { title: "休日カレンダー — RexClock" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requireAdmin();
  const today = jstDateStr(new Date());
  const from = dateOnlyUtc(today);
  const to = dateOnlyUtc(`${today.slice(0, 4)}-12-31`);

  const [holidays, overrides, holidayCount] = await Promise.all([
    prisma.holiday.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      take: 30,
    }),
    prisma.calendarDay.findMany({
      orderBy: { date: "desc" },
      take: 30,
    }),
    prisma.holiday.count(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">休日カレンダー</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          内蔵祝日データの取込と、特定日の区分の手動上書き（振替・特別営業日など）。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>祝日データ（登録 {holidayCount} 件）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ImportHolidaysButton />
          <ul className="flex flex-wrap gap-2 text-xs">
            {holidays.map((h) => (
              <li
                key={h.id}
                className="border-border rounded-md border px-2 py-1"
              >
                <span className="tabular">
                  {formatDateSlash(dateOnlyStr(h.date))}
                </span>{" "}
                {h.name}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>日の区分を上書き</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={overrideCalendarAction}
            submitLabel="上書きして再計算"
            pendingLabel="再計算中…"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="対象日" htmlFor="ov-date">
                <Input id="ov-date" name="date" type="date" required />
              </Field>
              <Field label="区分" htmlFor="ov-type">
                <select
                  id="ov-type"
                  name="dayType"
                  className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                >
                  <option value="WORKDAY">平日（営業日）</option>
                  <option value="PRESCRIBED_HOLIDAY">所定休日</option>
                  <option value="LEGAL_HOLIDAY">法定休日</option>
                </select>
              </Field>
              <Field label="休業日として扱う" htmlFor="ov-holiday">
                <select
                  id="ov-holiday"
                  name="isHoliday"
                  className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                  defaultValue="true"
                >
                  <option value="true">はい</option>
                  <option value="false">いいえ</option>
                </select>
              </Field>
              <Field label="表示名（任意）" htmlFor="ov-label">
                <Input id="ov-label" name="label" placeholder="創立記念日 等" />
              </Field>
              <Field label="理由" htmlFor="ov-reason" className="sm:col-span-2">
                <Input id="ov-reason" name="overrideReason" required />
              </Field>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      {overrides.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>上書き済みの日</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">日付</th>
                  <th className="py-2 pr-3 font-medium">区分</th>
                  <th className="py-2 pr-3 font-medium">表示名</th>
                  <th className="py-2 pl-3 font-medium">理由</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr
                    key={o.id}
                    className="border-border/50 border-b last:border-0"
                  >
                    <td className="tabular py-1.5 pr-3">
                      {formatDateSlash(dateOnlyStr(o.date))}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="outline">{dayTypeLabel[o.dayType]}</Badge>
                    </td>
                    <td className="py-1.5 pr-3">{o.label ?? "—"}</td>
                    <td className="text-muted-foreground py-1.5 pl-3">
                      {o.overrideReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

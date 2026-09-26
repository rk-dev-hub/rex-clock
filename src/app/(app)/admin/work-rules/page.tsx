import { requireAdmin } from "@/features/auth/rbac";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { updateWorkRuleAction } from "@/features/admin/master-actions";

export const metadata = { title: "就業規則 — RexClock" };
export const dynamic = "force-dynamic";

export default async function WorkRulesPage() {
  await requireAdmin();
  const rule = await getDefaultWorkRule();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">就業規則</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          割増率・締め日・深夜帯などの組織設定。変更後は「再計算」で既存データへ反映します。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>設定</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateWorkRuleAction} submitLabel="保存">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="所定労働（分/日）" htmlFor="standardDailyMinutes">
                <Input
                  id="standardDailyMinutes"
                  name="standardDailyMinutes"
                  type="number"
                  defaultValue={rule.standardDailyMinutes}
                />
              </Field>
              <Field label="締め日（31=月末）" htmlFor="closingDay">
                <Input
                  id="closingDay"
                  name="closingDay"
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={rule.closingDay}
                />
              </Field>
              <Field label="週の起算（0=日,1=月）" htmlFor="weekStartsOn">
                <Input
                  id="weekStartsOn"
                  name="weekStartsOn"
                  type="number"
                  min={0}
                  max={6}
                  defaultValue={rule.weekStartsOn}
                />
              </Field>
              <Field label="時間外割増 %" htmlFor="overtimeRatePct">
                <Input
                  id="overtimeRatePct"
                  name="overtimeRatePct"
                  type="number"
                  defaultValue={rule.overtimeRatePct}
                />
              </Field>
              <Field label="深夜割増 %" htmlFor="nightRatePct">
                <Input
                  id="nightRatePct"
                  name="nightRatePct"
                  type="number"
                  defaultValue={rule.nightRatePct}
                />
              </Field>
              <Field label="法定休日割増 %" htmlFor="legalHolidayRatePct">
                <Input
                  id="legalHolidayRatePct"
                  name="legalHolidayRatePct"
                  type="number"
                  defaultValue={rule.legalHolidayRatePct}
                />
              </Field>
              <Field label="月60h超割増 %" htmlFor="over60hRatePct">
                <Input
                  id="over60hRatePct"
                  name="over60hRatePct"
                  type="number"
                  defaultValue={rule.over60hRatePct}
                />
              </Field>
              <Field label="深夜開始 (HH:mm)" htmlFor="nightStart">
                <Input
                  id="nightStart"
                  name="nightStart"
                  defaultValue={rule.nightStart}
                />
              </Field>
              <Field label="深夜終了 (HH:mm)" htmlFor="nightEnd">
                <Input
                  id="nightEnd"
                  name="nightEnd"
                  defaultValue={rule.nightEnd}
                />
              </Field>
              <Field label="休憩の基準" htmlFor="breakPolicy">
                <select
                  id="breakPolicy"
                  name="breakPolicy"
                  defaultValue={rule.breakPolicy}
                  className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                >
                  <option value="ACTUAL">実打刻を採用</option>
                  <option value="AUTO_DEDUCT">所定休憩を自動控除</option>
                </select>
              </Field>
              <Field
                label="法定休日の曜日（0=日）"
                htmlFor="legalHolidayWeekday"
              >
                <Input
                  id="legalHolidayWeekday"
                  name="legalHolidayWeekday"
                  type="number"
                  min={0}
                  max={6}
                  defaultValue={rule.legalHolidayWeekday}
                />
              </Field>
              <Field
                label="所定休日の曜日（カンマ区切り）"
                htmlFor="prescribedHolidayWeekdays"
              >
                <Input
                  id="prescribedHolidayWeekdays"
                  name="prescribedHolidayWeekdays"
                  defaultValue={rule.prescribedHolidayWeekdays.join(",")}
                />
              </Field>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

import { requireUser } from "@/features/auth/rbac";
import { getTodayState } from "@/features/time-clock/usecase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClockPanel } from "./clock-panel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const today = await getTodayState(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">打刻</h1>
        <p className="text-muted-foreground mt-1 text-sm">{user.name} さん</p>
      </div>

      <Card className="overflow-hidden">
        {/* 打刻はこのアプリの中心の操作なので、上端にブランドカラーの帯を付けて目立たせる */}
        <div aria-hidden="true" className="brand-gradient h-1" />
        <CardHeader>
          <CardTitle>本日の打刻</CardTitle>
        </CardHeader>
        <CardContent>
          <ClockPanel initial={today} />
        </CardContent>
      </Card>
    </div>
  );
}

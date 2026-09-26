import { requireAdmin } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PatternEditor } from "./pattern-editor";

export const metadata = { title: "勤務パターン — RexClock" };
export const dynamic = "force-dynamic";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

export default async function PatternsPage() {
  await requireAdmin();
  const patterns = await prisma.workPattern.findMany({
    orderBy: { name: "asc" },
    include: { days: { orderBy: { weekday: "asc" } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">勤務パターン</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          曜日ごとの所定始業・終業・休憩・所定労働時間。変更後は「再計算」で反映します。
        </p>
      </div>

      {patterns.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>
              {p.name}
              {p.isDefault ? "（既定）" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PatternEditor
              patternId={p.id}
              name={p.name}
              days={WD.map((_, weekday) => {
                const d = p.days.find((x) => x.weekday === weekday);
                return {
                  weekday,
                  label: WD[weekday],
                  isWorkday: d?.isWorkday ?? false,
                  startTime: d?.startTime ?? "09:00",
                  endTime: d?.endTime ?? "18:00",
                  breakMinutes: d?.breakMinutes ?? 60,
                  prescribedMinutes: d?.prescribedMinutes ?? 0,
                };
              })}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

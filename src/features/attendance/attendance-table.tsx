import { formatDateJa } from "@/lib/date-range";
import { jstDateStr } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Minutes } from "@/components/minutes";
import { dayTypeBadgeVariant, dayTypeLabel } from "@/features/calendar/labels";
import {
  displayFlagLabel,
  flagBadgeClass,
} from "@/features/attendance/flag-labels";
import type { PeriodRow } from "@/features/attendance/period-view";

function jstHm(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60_000);
  return `${String(jst.getUTCHours()).padStart(2, "0")}:${String(
    jst.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * 今日はまだ勤務日の途中で退勤していなくて当然なので、当日ぶんの
 * MISSING_CLOCK_OUT は「打刻漏れ」として出さない（過去日はそのまま表示）。
 */
function displayFlags(dateStr: string, flags: string[]): string[] {
  if (dateStr !== jstDateStr(new Date())) return flags;
  return flags.filter((f) => f !== "MISSING_CLOCK_OUT");
}

/** 締め期間の日別明細テーブル（勤怠一覧・勤務表で共用）。 */
export function AttendanceTable({ rows }: { rows: PeriodRow[] }) {
  const t = rows.reduce(
    (acc, { summary: s }) => ({
      worked: acc.worked + (s?.workedMinutes ?? 0),
      brk: acc.brk + (s?.breakMinutes ?? 0),
      within: acc.within + (s?.withinStatutoryOtMinutes ?? 0),
      over: acc.over + (s?.overStatutoryOtMinutes ?? 0),
      night: acc.night + (s?.nightMinutes ?? 0),
      legal: acc.legal + (s?.legalHolidayMinutes ?? 0),
      late: acc.late + (s?.lateMinutes ?? 0),
      early: acc.early + (s?.earlyLeaveMinutes ?? 0),
    }),
    {
      worked: 0,
      brk: 0,
      within: 0,
      over: 0,
      night: 0,
      legal: 0,
      late: 0,
      early: 0,
    },
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-border border-b text-left text-xs">
            <th className="py-2 pr-3 font-medium">日付</th>
            <th className="py-2 pr-3 font-medium">区分</th>
            <th className="py-2 pr-3 font-medium">出勤</th>
            <th className="py-2 pr-3 font-medium">退勤</th>
            <th className="py-2 pr-3 text-right font-medium">休憩</th>
            <th className="py-2 pr-3 text-right font-medium">実働</th>
            <th className="py-2 pr-3 text-right font-medium">法定内残業</th>
            <th className="py-2 pr-3 text-right font-medium">法定外残業</th>
            <th className="py-2 pr-3 text-right font-medium">深夜</th>
            <th className="py-2 pr-3 text-right font-medium">法定休日</th>
            <th className="py-2 pr-3 text-right font-medium">遅刻</th>
            <th className="py-2 pr-3 text-right font-medium">早退</th>
            <th className="py-2 pl-3 font-medium">フラグ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ date, dayType, summary: s }) => (
            <tr key={date} className="border-border/50 border-b last:border-0">
              <td className="tabular py-1.5 pr-3 whitespace-nowrap">
                {formatDateJa(date)}
              </td>
              <td className="py-1.5 pr-3">
                <Badge variant={dayTypeBadgeVariant[dayType]}>
                  {dayTypeLabel[dayType]}
                </Badge>
              </td>
              <td className="tabular py-1.5 pr-3">
                {s?.firstIn ? jstHm(s.firstIn) : "—"}
              </td>
              <td className="tabular py-1.5 pr-3">
                {s?.lastOut ? jstHm(s.lastOut) : "—"}
              </td>
              <td className="py-1.5 pr-3 text-right">
                <Minutes value={s?.breakMinutes} />
              </td>
              <td className="py-1.5 pr-3 text-right font-medium">
                <Minutes value={s?.workedMinutes} />
              </td>
              <td className="py-1.5 pr-3 text-right">
                <Minutes value={s?.withinStatutoryOtMinutes} />
              </td>
              <td className="py-1.5 pr-3 text-right">
                <Minutes value={s?.overStatutoryOtMinutes} />
              </td>
              <td className="py-1.5 pr-3 text-right">
                <Minutes value={s?.nightMinutes} />
              </td>
              <td className="py-1.5 pr-3 text-right">
                <Minutes value={s?.legalHolidayMinutes} />
              </td>
              <td className="py-1.5 pr-3 text-right">
                <Minutes value={s?.lateMinutes} />
              </td>
              <td className="py-1.5 pr-3 text-right">
                <Minutes value={s?.earlyLeaveMinutes} />
              </td>
              <td className="py-1.5 pl-3">
                <div className="flex flex-wrap gap-1">
                  {displayFlags(
                    date,
                    (s?.flags as string[] | undefined) ?? [],
                  ).map((f) => (
                    <span
                      key={f}
                      className={cn(
                        "rounded px-1 text-[10px]",
                        flagBadgeClass(f),
                      )}
                    >
                      {displayFlagLabel(f)}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-border border-t font-medium">
            <td className="py-2 pr-3" colSpan={4}>
              合計
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.brk} dashOnZero={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.worked} dashOnZero={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.within} dashOnZero={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.over} dashOnZero={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.night} dashOnZero={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.legal} dashOnZero={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.late} dashOnZero={false} />
            </td>
            <td className="py-2 pr-3 text-right">
              <Minutes value={t.early} dashOnZero={false} />
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

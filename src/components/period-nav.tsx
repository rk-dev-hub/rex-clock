import Link from "next/link";
import { jstDateStr } from "@/lib/datetime";
import { addDaysStr } from "@/lib/date-range";
import { periodRangeFor } from "@/features/aggregation/domain/period";

const linkClass = "border-border hover:bg-accent rounded-md border px-3 py-1.5";

function periodLabel(endStr: string): string {
  return `${Number(endStr.split("-")[1])}月`;
}

/** 勤怠一覧・勤務表で共用する期間切り替えナビ。締め日をまたいだ隣接期間の月表示を計算する。 */
export function PeriodNav({
  basePath,
  startStr,
  endStr,
  closingDay,
  extraParams = "",
}: {
  basePath: string;
  startStr: string;
  endStr: string;
  closingDay: number;
  extraParams?: string;
}) {
  const prevRef = addDaysStr(startStr, -1);
  const nextRef = addDaysStr(endStr, 1);
  const prevPeriod = periodRangeFor(prevRef, closingDay);
  const nextPeriod = periodRangeFor(nextRef, closingDay);

  const today = jstDateStr(new Date());
  const isCurrent = periodRangeFor(today, closingDay).startStr === startStr;

  return (
    <div className="flex gap-2 text-sm">
      <Link
        href={`${basePath}?ref=${prevRef}${extraParams}`}
        className={linkClass}
      >
        ← {periodLabel(prevPeriod.endStr)}
      </Link>
      {!isCurrent ? (
        <Link
          href={`${basePath}?ref=${today}${extraParams}`}
          className={linkClass}
        >
          今月
        </Link>
      ) : null}
      <Link
        href={`${basePath}?ref=${nextRef}${extraParams}`}
        className={linkClass}
      >
        {periodLabel(nextPeriod.endStr)} →
      </Link>
    </div>
  );
}

import { minutesToHm } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/** 分を H:MM で表示（等幅）。0 は淡色のダッシュ。 */
export function Minutes({
  value,
  className,
  dashOnZero = true,
}: {
  value: number | null | undefined;
  className?: string;
  dashOnZero?: boolean;
}) {
  if (value == null || (dashOnZero && value === 0)) {
    return (
      <span className={cn("tabular text-muted-foreground", className)}>—</span>
    );
  }
  return <span className={cn("tabular", className)}>{minutesToHm(value)}</span>;
}

/** ISO 文字列を JST の HH:mm で表示。 */
export function JstTime({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60_000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return <span className="tabular">{`${hh}:${mm}`}</span>;
}

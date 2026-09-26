"use client";

import { useState, useTransition } from "react";
import type { ClockType } from "@prisma/client";
import { punchAction } from "@/features/time-clock/actions";
import { clockStateLabel, clockTypeLabel } from "@/features/time-clock/labels";
import type { TodayState } from "@/features/time-clock/usecase";
import { Button } from "@/components/ui/button";
import { Minutes, JstTime } from "@/components/minutes";
import { cn } from "@/lib/utils";
import { formatDateSlash } from "@/lib/date-range";
import {
  displayFlagLabel,
  flagBadgeClass,
} from "@/features/attendance/flag-labels";

const VARIANT: Record<
  ClockType,
  "default" | "secondary" | "outline" | "destructive"
> = {
  CLOCK_IN: "default",
  CLOCK_OUT: "destructive",
  BREAK_START: "secondary",
  BREAK_END: "secondary",
};

export function ClockPanel({ initial }: { initial: TodayState }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPunch(type: ClockType) {
    setError(null);
    start(async () => {
      const res = await punchAction(type);
      if (!res.ok) setError(res.message ?? "打刻に失敗しました");
    });
  }

  const crossDay = initial.businessDate !== todayJst();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
            initial.state === "WORKING" &&
              "from-success/10 to-success/20 text-success ring-success/25 bg-gradient-to-br",
            initial.state === "ON_BREAK" &&
              "from-warning/15 to-warning/30 text-warning-foreground ring-warning/35 bg-gradient-to-br",
            (initial.state === "OUT" || initial.state === "DONE") &&
              "bg-secondary text-secondary-foreground ring-border",
          )}
        >
          {clockStateLabel[initial.state]}
        </span>
        <span className="text-muted-foreground text-sm">
          対象勤務日: {formatDateSlash(initial.businessDate)}
          {crossDay ? "（前日からの勤務）" : ""}
        </span>
      </div>

      {error ? (
        <p
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {initial.allowed.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {initial.allowed.map((type) => (
            <Button
              key={type}
              size="lg"
              className="min-w-32 text-base"
              variant={VARIANT[type]}
              disabled={pending}
              onClick={() => onPunch(type)}
            >
              {clockTypeLabel[type]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          本日は退勤済みです。修正が必要な場合は「申請」から打刻修正を申請してください。
        </p>
      )}

      {initial.summary ? (
        <dl className="border-border/80 from-accent to-card grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-gradient-to-br p-4 text-sm sm:grid-cols-4">
          <Stat label="実働" value={initial.summary.workedMinutes} />
          <Stat label="休憩" value={initial.summary.breakMinutes} />
          <Stat
            label="法定外残業"
            value={initial.summary.overStatutoryOtMinutes}
          />
          <Stat label="深夜" value={initial.summary.nightMinutes} />
        </dl>
      ) : null}

      {initial.events.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-medium">本日の打刻</h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {initial.events.map((e, i) => (
              <li
                key={i}
                className="border-border bg-card tabular rounded-full border px-3 py-1 shadow-sm"
              >
                {clockTypeLabel[e.type]} <JstTime iso={e.at} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {initial.summary?.flags.length ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {initial.summary.flags.map((f) => (
            <li
              key={f}
              className={cn("rounded-full px-2 py-0.5", flagBadgeClass(f))}
            >
              {displayFlagLabel(f)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="tabular text-lg font-semibold">
        <Minutes value={value} dashOnZero={false} />
      </dd>
    </div>
  );
}

function todayJst(): string {
  const d = new Date(Date.now() + 9 * 60 * 60_000);
  return d.toISOString().slice(0, 10);
}

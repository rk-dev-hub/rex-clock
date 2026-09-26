"use client";

import { useActionState, useState } from "react";
import {
  upsertPatternAction,
  type MasterState,
} from "@/features/admin/master-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = {
  weekday: number;
  label: string;
  isWorkday: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  prescribedMinutes: number;
};

export function PatternEditor({
  patternId,
  name: initialName,
  days: initial,
}: {
  patternId: string;
  name: string;
  days: Row[];
}) {
  const [state, action, pending] = useActionState<MasterState, FormData>(
    upsertPatternAction,
    null,
  );
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<Row[]>(initial);

  const patch = (weekday: number, p: Partial<Row>) =>
    setRows((xs) =>
      xs.map((x) => (x.weekday === weekday ? { ...x, ...p } : x)),
    );

  const daysPayload = JSON.stringify(
    rows.map((r) => ({
      weekday: r.weekday,
      isWorkday: r.isWorkday,
      startTime: r.startTime,
      endTime: r.endTime,
      breakMinutes: r.breakMinutes,
      prescribedMinutes: r.prescribedMinutes,
    })),
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="patternId" value={patternId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="days" value={daysPayload} />

      {state?.message ? (
        <p
          className={
            state.ok
              ? "bg-success/10 text-success rounded-md px-3 py-2 text-sm"
              : "bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          }
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <label className="flex max-w-xs flex-col gap-1 text-xs">
        パターン名
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left text-xs">
              <th className="py-2 pr-3 font-medium">曜日</th>
              <th className="py-2 pr-3 font-medium">勤務日</th>
              <th className="py-2 pr-3 font-medium">始業</th>
              <th className="py-2 pr-3 font-medium">終業</th>
              <th className="py-2 pr-3 font-medium">休憩(分)</th>
              <th className="py-2 pr-3 font-medium">所定(分)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.weekday}
                className="border-border/50 border-b last:border-0"
              >
                <td className="py-1.5 pr-3">{r.label}</td>
                <td className="py-1.5 pr-3">
                  <input
                    type="checkbox"
                    checked={r.isWorkday}
                    onChange={(e) =>
                      patch(r.weekday, { isWorkday: e.target.checked })
                    }
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="time"
                    value={r.startTime}
                    onChange={(e) =>
                      patch(r.weekday, { startTime: e.target.value })
                    }
                    className="border-input bg-background h-8 rounded border px-1 text-sm"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="time"
                    value={r.endTime}
                    onChange={(e) =>
                      patch(r.weekday, { endTime: e.target.value })
                    }
                    className="border-input bg-background h-8 rounded border px-1 text-sm"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="number"
                    value={r.breakMinutes}
                    onChange={(e) =>
                      patch(r.weekday, {
                        breakMinutes: Number(e.target.value),
                      })
                    }
                    className="border-input bg-background h-8 w-16 rounded border px-1 text-sm"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="number"
                    value={r.prescribedMinutes}
                    onChange={(e) =>
                      patch(r.weekday, {
                        prescribedMinutes: Number(e.target.value),
                      })
                    }
                    className="border-input bg-background h-8 w-20 rounded border px-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>
    </form>
  );
}

import type { ClockType } from "@prisma/client";

// docs/01 FR-M1/M3、docs/03 §3.7。打刻修正申請の明細を実データ操作へ変換（純粋関数）。

export type ExistingEvent = {
  id: string;
  type: ClockType;
  occurredAt: string; // ISO
  canceled: boolean;
};

export type CorrectionLineInput = {
  op: "ADD" | "UPDATE" | "DELETE";
  targetEventId?: string | null;
  clockType?: ClockType | null;
  occurredAt?: string | null; // ISO
};

export type CorrectionPlan = {
  cancelEventIds: string[];
  addEvents: { type: ClockType; occurredAt: string }[];
};

export type PlanResult =
  { ok: true; plan: CorrectionPlan } | { ok: false; errors: string[] };

export function planCorrection(
  existing: ExistingEvent[],
  lines: CorrectionLineInput[],
): PlanResult {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const cancelEventIds: string[] = [];
  const addEvents: { type: ClockType; occurredAt: string }[] = [];
  const errors: string[] = [];

  if (lines.length === 0) errors.push("明細が空です。");

  lines.forEach((line, i) => {
    const n = i + 1;
    if (line.op === "ADD") {
      if (!line.clockType || !line.occurredAt) {
        errors.push(`明細${n}: 追加には種別と時刻が必要です。`);
        return;
      }
      addEvents.push({ type: line.clockType, occurredAt: line.occurredAt });
      return;
    }

    // UPDATE / DELETE は対象イベントが必要
    const target = line.targetEventId
      ? byId.get(line.targetEventId)
      : undefined;
    if (!target) {
      errors.push(`明細${n}: 対象の打刻が見つかりません。`);
      return;
    }
    if (target.canceled) {
      errors.push(`明細${n}: 対象の打刻はすでに取消済みです。`);
      return;
    }
    if (cancelEventIds.includes(target.id)) {
      errors.push(`明細${n}: 同じ打刻を複数の明細で操作しています。`);
      return;
    }

    if (line.op === "DELETE") {
      cancelEventIds.push(target.id);
      return;
    }

    // UPDATE
    if (!line.clockType || !line.occurredAt) {
      errors.push(`明細${n}: 変更には種別と時刻が必要です。`);
      return;
    }
    cancelEventIds.push(target.id);
    addEvents.push({ type: line.clockType, occurredAt: line.occurredAt });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: { cancelEventIds, addEvents } };
}

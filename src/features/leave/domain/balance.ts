// docs/01 FR-L3/L6/L7、docs/03 §3.9。有給残数と FIFO 消化（純粋関数）。

export type LedgerEntry = {
  kind: "GRANT" | "CONSUME" | "EXPIRE" | "ADJUST";
  days: number; // + 付与 / − 消化・失効
  effectiveDate: string; // 'YYYY-MM-DD'
};

/** 基準日時点の有給残数（effectiveDate ≤ asOf の合算）。 */
export function computeBalance(entries: LedgerEntry[], asOf: string): number {
  return round1(
    entries
      .filter((e) => e.effectiveDate <= asOf)
      .reduce((s, e) => s + e.days, 0),
  );
}

export type GrantLot = {
  grantId: string;
  remainingDays: number; // その付与の未消化残
  expiryDate: string; // 'YYYY-MM-DD'
  grantDate: string;
};

export type ConsumePlan = { grantId: string; days: number };

/**
 * consumeDays を、失効が近い（expiryDate 昇順、同日は grantDate 昇順）付与から消化する。
 * 残数不足でも可能な分だけ割り当て、shortage に不足日数を返す。
 */
export function planFifoConsumption(
  lots: GrantLot[],
  consumeDays: number,
): { plan: ConsumePlan[]; shortageDays: number } {
  const ordered = [...lots]
    .filter((l) => l.remainingDays > 0)
    .sort(
      (a, b) =>
        a.expiryDate.localeCompare(b.expiryDate) ||
        a.grantDate.localeCompare(b.grantDate),
    );

  let remaining = round1(consumeDays);
  const plan: ConsumePlan[] = [];
  for (const lot of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingDays, remaining);
    if (take > 0) {
      plan.push({ grantId: lot.grantId, days: round1(take) });
      remaining = round1(remaining - take);
    }
  }
  return { plan, shortageDays: round1(Math.max(0, remaining)) };
}

/** 0.5 日単位に丸め（浮動小数の誤差対策）。 */
function round1(n: number): number {
  return Math.round(n * 2) / 2;
}

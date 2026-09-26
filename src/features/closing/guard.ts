import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc } from "@/lib/datetime";
import { periodRangeFor } from "@/features/aggregation/domain/period";
import { getDefaultWorkRule } from "@/features/attendance/usecase";
import { errWithDefault, type Err } from "@/lib/result";

type Db = Prisma.TransactionClient | typeof prisma;

/** dateStr（'YYYY-MM-DD'）が属する締め期間が CLOSED なら true。 */
export async function isPeriodClosed(
  dateStr: string,
  db: Db = prisma,
): Promise<boolean> {
  const rule = await getDefaultWorkRule(db);
  const { startStr } = periodRangeFor(dateStr, rule.closingDay);
  const period = await db.closingPeriod.findUnique({
    where: { periodStart: dateOnlyUtc(startStr) },
  });
  return period?.status === "CLOSED";
}

/**
 * 対象日（複数可）のいずれかが締め済み期間なら PERIOD_CLOSED エラーを返す。
 * 開いていれば null。usecase の冒頭で `const closed = await assertPeriodOpen(...); if (closed) return closed;`
 */
export async function assertPeriodOpen(
  dateStrs: string | string[],
  db: Db = prisma,
): Promise<Err | null> {
  const list = Array.isArray(dateStrs) ? dateStrs : [dateStrs];
  for (const d of list) {
    if (await isPeriodClosed(d, db)) return errWithDefault("PERIOD_CLOSED");
  }
  return null;
}

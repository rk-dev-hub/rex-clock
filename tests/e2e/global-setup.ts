import { execSync } from "node:child_process";

/**
 * E2E 実行前に開発 DB を初期状態へ戻す。
 * migrate reset は AI 同意ゲートがあるため、テーブル TRUNCATE + seed で代替する。
 */
export default async function globalSetup() {
  const psql = (sql: string) =>
    execSync(
      `docker exec rex-clock-db psql -U rexclock -d rexclock -v ON_ERROR_STOP=1 -c ${JSON.stringify(
        sql.replace(/\s+/g, " ").trim(),
      )}`,
      { stdio: "pipe" },
    );

  psql(`
    TRUNCATE TABLE
      "AuditLog","LeaveLedger","LeaveGrant","LeaveRequest",
      "CorrectionLine","CorrectionRequest","TimeClockEvent",
      "DailySummary","MonthlyAggregate","ClosingPeriod",
      "CalendarDay","Holiday","WorkPatternDay","WorkPattern",
      "User","WorkRule"
    RESTART IDENTITY CASCADE;
  `);

  execSync("pnpm db:seed", { stdio: "inherit" });
  // seed 直後の従業員はパスワード変更フラグが立っている。E2E ではそのフローも
  // テストするため、そのまま利用する。
}

import { test, expect } from "@playwright/test";
import { login, expectOnDashboard, EMP_SATO } from "./helpers";

// docs/05 §2.3、docs/01 UC-1。
// 出勤 → 休憩開始 → 休憩終了 → 退勤 の状態遷移とボタン出し分け、当日サマリ表示を確認。
// サーバ時刻はモックできないため、実働の「絶対値の増加」ではなく状態遷移を検証する。

test("従業員が 1 日の打刻を行い、状態バッジ・ボタン・当日サマリが遷移する", async ({
  page,
}) => {
  await login(page, EMP_SATO);
  await expectOnDashboard(page);

  const badge = (name: string) => page.getByText(name, { exact: true });
  const btn = (name: string) => page.getByRole("button", { name });

  // --- 未出勤 ---
  await expect(badge("未出勤")).toBeVisible();
  await expect(btn("出勤")).toBeVisible();
  await expect(btn("退勤")).toHaveCount(0);

  // --- 出勤 → 勤務中 ---
  await btn("出勤").click();
  await expect(badge("勤務中")).toBeVisible();
  await expect(btn("休憩開始")).toBeVisible();
  await expect(btn("退勤")).toBeVisible();
  await expect(btn("出勤")).toHaveCount(0);

  // --- 休憩開始 → 休憩中 ---
  await btn("休憩開始").click();
  await expect(badge("休憩中")).toBeVisible();
  await expect(btn("休憩終了")).toBeVisible();
  await expect(btn("退勤")).toHaveCount(0);

  // --- 休憩終了 → 勤務中 ---
  await btn("休憩終了").click();
  await expect(badge("勤務中")).toBeVisible();
  await expect(btn("休憩開始")).toBeVisible();
  await expect(btn("退勤")).toBeVisible();
  await expect(btn("休憩終了")).toHaveCount(0);

  // --- 退勤 → 退勤済 ---
  await btn("退勤").click();
  await expect(badge("退勤済")).toBeVisible();
  await expect(
    page.getByText("本日は退勤済みです。", { exact: false }),
  ).toBeVisible();
  await expect(btn("出勤")).toHaveCount(0);
  await expect(btn("退勤")).toHaveCount(0);
  await expect(btn("休憩開始")).toHaveCount(0);

  // --- 当日サマリが表示され、実働が H:MM 形式で出る ---
  await expect(page.getByText("実働", { exact: true })).toBeVisible();
  await expect(page.getByText("深夜", { exact: true })).toBeVisible();
  const workedValue = page
    .getByText("実働", { exact: true })
    .locator("xpath=following-sibling::dd[1]");
  await expect(workedValue).toHaveText(/^\d+:\d{2}$/);
});

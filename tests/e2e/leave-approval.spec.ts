import { test, expect } from "@playwright/test";
import { login, logout, futureWorkday, ADMIN, EMP_TANAKA } from "./helpers";

// docs/05 §2.6/2.8/2.7、docs/01 UC-3。
// 従業員が有給を 1 日申請 → ADMIN が承認 → 勤務表にその日の有給が反映される。

test("有給申請 → ADMIN 承認 → 勤務表に有給が反映", async ({ page }) => {
  const leaveDate = futureWorkday(2); // 未来の営業日（週末・祝日を除外）

  // --- 従業員: 有給を申請 ---
  await login(page, EMP_TANAKA);
  await page.goto("/requests");

  const leaveForm = page.locator("form", {
    has: page.getByRole("button", { name: "休暇を申請" }),
  });
  await expect(leaveForm.getByText(/現在の有給残日数:/)).toBeVisible();

  await leaveForm.getByLabel("取得日").fill(leaveDate);
  await leaveForm.getByLabel("理由").fill("E2E: 私用のため有給取得");
  await leaveForm.getByRole("button", { name: "休暇を申請" }).click();

  await expect(page.getByText("申請しました。", { exact: true })).toBeVisible();
  // 休暇申請の状況テーブルに PENDING 行が出る。
  await expect(
    page.getByRole("row", { name: new RegExp(`${leaveDate}.*申請中`) }),
  ).toBeVisible();

  await logout(page);

  // --- ADMIN: 承認 ---
  await login(page, ADMIN);
  await page.goto("/approvals");

  const row = page.locator(
    '[data-testid="approval-row"][data-requester="EMP004"]',
  );
  await expect(row).toBeVisible();
  await expect(row).toContainText("休暇");
  await expect(row).toContainText(leaveDate);
  await row.getByRole("button", { name: "承認" }).click();

  // 承認後は一覧から消える。
  await expect(row).toHaveCount(0);

  await logout(page);

  // --- 従業員: 反映確認 ---
  await login(page, EMP_TANAKA);

  // 申請一覧では承認済みに。
  await page.goto("/requests");
  await expect(
    page.getByRole("row", { name: new RegExp(`${leaveDate}.*承認`) }),
  ).toBeVisible();

  // 勤務表（当該期間）の月合計に有給 1 日が計上される。
  await page.goto(`/reports?ref=${leaveDate}`);
  const paidStat = page
    .getByText("有給", { exact: true })
    .locator("xpath=following-sibling::div[1]");
  await expect(paidStat).toHaveText(/1 日/);
});

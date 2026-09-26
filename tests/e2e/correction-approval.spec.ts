import { test, expect } from "@playwright/test";
import { login, logout, jstToday, ADMIN, EMP_SUZUKI } from "./helpers";

// docs/05 §2.6/2.8/2.4、docs/01 UC-2。
// 従業員が打刻漏れの是正（出勤・退勤の追加）を申請 → ADMIN が承認 →
// 勤怠一覧でその日の実働が更新される。
// 打刻時刻を 09:00/18:00 に固定するため、サーバ時刻に依存せず実働は 9:00（休憩なし）になる。

test("打刻修正申請 → ADMIN 承認 → 勤怠一覧の実働が更新", async ({ page }) => {
  const targetDate = jstToday();

  // --- 従業員: 修正前は当日の実働なし ---
  await login(page, EMP_SUZUKI);
  await page.goto("/attendance");
  await expect(
    page.getByRole("cell", { name: "9:00", exact: true }),
  ).toHaveCount(0);

  // --- 従業員: 打刻修正を申請（明細2件: 退勤 18:00 追加 / 出勤 09:00 追加） ---
  await page.goto("/requests");
  const form = page.locator("form", {
    has: page.getByRole("button", { name: "打刻修正を申請" }),
  });

  await form.getByLabel("対象勤務日").fill(targetDate);

  const times = form.locator('input[type="time"]');
  // 既定明細（op=追加 / 種別=退勤）
  await times.nth(0).fill("18:00");
  // 明細を追加（op=追加 / 種別=出勤）
  await form.getByRole("button", { name: "明細を追加" }).click();
  await expect(times).toHaveCount(2);
  await times.nth(1).fill("09:00");

  await form.getByLabel("理由").fill("E2E: 打刻漏れのため出退勤を追加");
  await form.getByRole("button", { name: "打刻修正を申請" }).click();

  await expect(
    page.getByText("打刻修正を申請しました。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(`${targetDate}.*申請中`) }),
  ).toBeVisible();

  await logout(page);

  // --- ADMIN: 承認 ---
  await login(page, ADMIN);
  await page.goto("/approvals");

  const row = page.locator(
    '[data-testid="approval-row"][data-requester="EMP003"]',
  );
  await expect(row).toBeVisible();
  await expect(row).toContainText("打刻修正");
  await row.getByRole("button", { name: "承認" }).click();
  await expect(row).toHaveCount(0);

  await logout(page);

  // --- 従業員: 反映確認 ---
  await login(page, EMP_SUZUKI);

  await page.goto("/requests");
  await expect(
    page.getByRole("row", { name: new RegExp(`${targetDate}.*承認`) }),
  ).toBeVisible();

  await page.goto("/attendance");
  // 修正前は 0 件だった「実働 9:00」セルが、承認後に出現する（09:00-18:00・休憩なし）。
  await expect(
    page.getByRole("cell", { name: "9:00", exact: true }).first(),
  ).toBeVisible();
});

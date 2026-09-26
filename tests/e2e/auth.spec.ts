import { test, expect } from "@playwright/test";
import { EMP_YAMADA, NEW_PASSWORD } from "./helpers";

// docs/05 §2.1-2.3、docs/01 FR-A2/FR-A3。
// 各 test は Playwright 既定でクリーンな context（Cookie 非共有）で動く。

test("初回ログイン → 強制パスワード変更 → ダッシュボード到達", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(EMP_YAMADA.email);
  await page.getByLabel("パスワード").fill(EMP_YAMADA.password);
  await page.getByRole("button", { name: "ログイン" }).click();

  // mustChangePassword のため /first-password へ。
  await page.waitForURL(/\/first-password$/);
  await expect(
    page.getByRole("heading", { name: "パスワードの変更" }),
  ).toBeVisible();

  await page.getByLabel("現在のパスワード").fill(EMP_YAMADA.password);
  await page.getByLabel("新しいパスワード", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("新しいパスワード（確認）").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "設定して続ける" }).click();

  await page.waitForURL((u) => u.pathname === "/");
  await expect(
    page.getByRole("heading", { name: "打刻", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
});

test("誤ったパスワードでエラーが表示される", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("nobody@example.com");
  await page.getByLabel("パスワード").fill("WrongPass999!");
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page.locator('p[role="alert"]')).toContainText(
    "メールアドレスまたはパスワードが違います。",
  );
  await expect(page).toHaveURL(/\/login/);
});

test("未ログインで /attendance にアクセスすると /login へリダイレクト", async ({
  page,
}) => {
  await page.goto("/attendance");

  await page.waitForURL(/\/login/);
  // next パラメータで戻り先が保持される。
  await expect(page).toHaveURL(/[?&]next=/);
  await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
});

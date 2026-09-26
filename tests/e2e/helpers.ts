import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@example.com", password: "ChangeMe123!" };

/** seed の従業員（全員 初期PW = Password123! / 初回PW変更フラグあり）。 */
export const EMPLOYEE = {
  email: "yamada@example.com",
  password: "Password123!",
};
export const EMP_YAMADA = EMPLOYEE;
export const EMP_SATO = { email: "sato@example.com", password: "Password123!" };
export const EMP_SUZUKI = {
  email: "suzuki@example.com",
  password: "Password123!",
};
export const EMP_TANAKA = {
  email: "tanaka@example.com",
  password: "Password123!",
};

export const NEW_PASSWORD = "NewPass123!";

/**
 * ログイン。
 * - 初回ログイン（mustChangePassword）なら NEW_PASSWORD へ変更してから続行。
 * - すでに別 spec で NEW_PASSWORD へ変更済みの場合は、初期PWが弾かれたら
 *   NEW_PASSWORD で再試行する（E2E は globalSetup で 1 回だけ DB リセットのため、
 *   同一ユーザーが複数 spec からログインされうる）。
 */
type Where =
  "login-error" | "login-pending" | "first-password" | "app" | "app-pending";

/** ログイン後、遷移が落ち着いた状態を判定する（/ → /first-password の二段遷移に耐える）。 */
async function settledState(page: Page): Promise<Where> {
  let last: Where = "app-pending";
  await expect
    .poll(
      async () => {
        const path = new URL(page.url()).pathname;
        if (path.startsWith("/login")) {
          // Next のルートアナウンサー（常設の空 div[role=alert]）を避け、
          // フォームのエラー <p role="alert"> だけを見る。
          last = (await page.locator('p[role="alert"]').first().isVisible())
            ? "login-error"
            : "login-pending";
        } else if (path === "/first-password") {
          last = "first-password";
        } else {
          last = (await page
            .getByRole("button", { name: "ログアウト" })
            .isVisible())
            ? "app"
            : "app-pending";
        }
        return last;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^(login-error|first-password|app)$/);
  return last;
}

export async function login(
  page: Page,
  who: { email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(who.email);
  await page.getByLabel("パスワード").fill(who.password);
  await page.getByRole("button", { name: "ログイン" }).click();

  let state = await settledState(page);

  // 初期PWが弾かれた（= 別 spec で変更済み）: 新パスワードで再ログイン。
  if (state === "login-error") {
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(who.email);
    await page.getByLabel("パスワード").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    state = await settledState(page);
  }

  // 初回ログイン: 強制パスワード変更フロー。
  if (state === "first-password") {
    await page.getByLabel("現在のパスワード").fill(who.password);
    await page
      .getByLabel("新しいパスワード", { exact: true })
      .fill(NEW_PASSWORD);
    await page.getByLabel("新しいパスワード（確認）").fill(NEW_PASSWORD);
    await page
      .getByRole("button", { name: /設定して続ける|パスワードを変更/ })
      .click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
  }

  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
}

/** 現在ログイン中のユーザーをログアウト。 */
export async function logout(page: Page) {
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForURL(/\/login/);
}

export async function expectOnDashboard(page: Page) {
  await expect(
    page.getByRole("heading", { name: "打刻", level: 1 }),
  ).toBeVisible();
}

// ---- 日付ユーティリティ（サーバ時刻をモックできないため相対計算で使う） ----

/** 今日（JST）の 'YYYY-MM-DD'。 */
export function jstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/**
 * 未来の営業日（JST 月〜金・内蔵祝日を除外）の 'YYYY-MM-DD'。
 * data/holidays.json は seed が Holiday テーブルへ投入するものと同一。
 */
export function futureWorkday(minDaysAhead = 1): string {
  const holidays = new Set(
    (
      JSON.parse(readFileSync("data/holidays.json", "utf8")).holidays as {
        date: string;
      }[]
    ).map((h) => h.date),
  );
  const d = new Date();
  for (let i = 1; i <= 120; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const wd = d.toLocaleDateString("en-US", {
      timeZone: "Asia/Tokyo",
      weekday: "short",
    });
    if (i < minDaysAhead) continue;
    if (wd === "Sat" || wd === "Sun") continue;
    if (holidays.has(iso)) continue;
    return iso;
  }
  throw new Error("未来の営業日が見つかりませんでした");
}

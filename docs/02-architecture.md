# アーキテクチャ・技術選定

## 1. 技術スタック

| レイヤ         | 採用                                          | 理由                                                                         |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| 言語           | TypeScript 5.x（strict）                      | 型安全。集計ロジックの信頼性                                                 |
| フレームワーク | Next.js 16 App Router / React 19              | フルスタック単一リポジトリ。Server Actions で API 層を薄く。Turbopack が既定 |
| ランタイム     | Node.js 22 LTS                                | Prisma / bcrypt のネイティブ依存が安定                                       |
| DB             | PostgreSQL 16（Docker Compose）               | 決定事項。日付/時刻・集計に強い                                              |
| ORM            | Prisma 6                                      | スキーマ駆動、マイグレーション、`DATABASE_URL` 差し替えのみで移行            |
| 認証           | Auth.js (NextAuth) v5 / Credentials           | 外部依存なし。管理者発行モデルに合う。JWT セッション                         |
| パスワード     | bcryptjs (cost 12)                            | ネイティブビルド不要で他環境でも動く                                         |
| バリデーション | Zod                                           | フォーム・Server Action 入力・環境変数を一元検証                             |
| フォーム       | React Hook Form + `@hookform/resolvers/zod`   | 制御しやすくバリデーションを共有                                             |
| UI             | Tailwind CSS v4 + shadcn/ui (Radix)           | デザイントークンで配色・余白を統一。アクセシブルな部品                       |
| 表・カレンダー | 自前コンポーネント（TanStack Table は必要時） | 勤務表は要件特化のため自前が早い                                             |
| 日付処理       | date-fns + date-fns-tz                        | 軽量、JST 変換、期間計算                                                     |
| チャート       | Recharts（色覚に配慮した配色）                | ダッシュボードの残業推移など                                                 |
| PDF            | `@react-pdf/renderer`                         | 勤務表 A4 をコンポーネントで組める。サーバで生成                             |
| CSV            | 自前ユーティリティ（依存最小）                | 文字コード/BOM/区切りを設定対応                                              |
| テスト（単体） | Vitest                                        | 集計ロジックの純粋関数を高速に網羅                                           |
| テスト（E2E）  | Playwright                                    | 打刻→申請→承認→出力の主要フロー                                              |
| Lint/Format    | ESLint (next/core-web-vitals) + Prettier      | 標準構成                                                                     |
| Git hooks      | lefthook                                      | pre-commit で lint/format/typecheck、pre-push で単体テスト                   |
| パッケージ管理 | pnpm                                          | ワークスペース不要だが高速・厳密                                             |

### Next.js 16 の注意点（実装時の前提）

- `next dev` / `next build` は **Turbopack が既定**（フラグ不要）。webpack 設定は追加しない。
- ミドルウェアは **`proxy.ts`**（旧 `middleware.ts` は非推奨）。認可の本処理には使わず、
  ログイン有無の楽観的リダイレクトのみ。実際の認可は各 Server Action / Server Component で行う。
- `params` / `searchParams` / `cookies()` / `headers()` はすべて **async**。
- ルート型は生成物（`LayoutProps` / `PageProps`）。`typecheck` は `next typegen && tsc --noEmit`。
- `next lint` は廃止 → ESLint CLI（`eslint` フラット設定）を直接使う。
- Server Component は既定で静的化されうる。ユーザー依存ページは `cookies()` 参照や
  `export const dynamic = "force-dynamic"` で動的化する。
- Auth.js v5(beta): `Session` / `User` の型拡張は `declare module "next-auth"` で効くが、
  `next-auth/jwt` の `JWT` 拡張は再エクスポート経由で merge されない。JWT は
  `Record<string, unknown>` として `src/lib/auth.ts` 内でキャストして扱う。
- 認証フロー: Credentials + JWT セッション。`jwt` callback で毎リクエスト `role` /
  `status` / `mustChangePassword` を DB から最新化（PW 変更・無効化を即時反映）。
  `mustChangePassword` の強制は `(app)/layout` で `/first-password` へ redirect。

## 2. レイヤ構成（依存の向き）

```
app/ (ルーティング・画面・Server Actions の入口)
   ↓ 呼ぶ
features/<domain>/  … usecase（トランザクション境界・認可）
   ↓ 呼ぶ
features/<domain>/domain … 純粋なドメインロジック（集計・状態機械・割増計算）
   ↓ 参照のみ
lib/ (prisma, auth, env, result, datetime)  … 横断ユーティリティ
```

- **domain 層は Prisma / Next に依存しない純粋関数**。入力は plain object、出力も plain object。
  → 集計・割増計算・打刻状態機械はここ。単体テストの主対象。
- **usecase 層**が「認可 → 取得 → domain 呼び出し → 永続化 → 監査ログ」を担う。Server Action は usecase を呼ぶだけの薄いアダプタ。
- 画面（Server Component）は usecase の read 系を直接呼んでよい。write は必ず Server Action 経由。

## 3. ディレクトリ構成

```
rex-clock/
├─ docs/                         設計ドキュメント
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                    架空データ + 標準マスタ + 祝日取込
├─ data/
│  └─ holidays.json              内蔵祝日データ（scripts で再生成）
├─ scripts/
│  ├─ update-holidays.ts         内閣府CSV → holidays.json 変換
│  ├─ create-admin.ts            本番向けに管理者だけを作成
│  ├─ docker-entrypoint.sh       お試し起動（app プロファイル）の起動処理
│  └─ db-is-empty.ts             初回起動時だけ seed するための判定
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/
│  │  ├─ (auth)/first-password/
│  │  ├─ (app)/
│  │  │  ├─ layout.tsx                共通ナビ（ロール別メニュー）
│  │  │  ├─ page.tsx                  ダッシュボード＝打刻
│  │  │  ├─ attendance/               勤怠一覧（自分／ADMINは対象切替）
│  │  │  ├─ requests/                 自分の申請一覧・新規（打刻修正／休暇）
│  │  │  ├─ approvals/                承認待ち一覧（ADMIN）
│  │  │  ├─ reports/                  月次勤務表・CSV/PDF
│  │  │  └─ admin/
│  │  │     ├─ users/                 ユーザー発行・無効化・PWリセット
│  │  │     ├─ work-rules/            就業規則設定
│  │  │     ├─ patterns/              勤務パターン
│  │  │     ├─ calendar/              休日カレンダー・祝日取込
│  │  │     ├─ leave-grants/          有給付与
│  │  │     ├─ closing/               月次締め・再オープン
│  │  │     └─ audit/                 監査ログ
│  │  ├─ api/
│  │  │  ├─ auth/[...nextauth]/route.ts
│  │  │  └─ export/                   CSV / PDF ストリーム（Route Handler）
│  │  ├─ layout.tsx
│  │  └─ globals.css
│  ├─ features/
│  │  ├─ auth/                     { usecase, rbac.ts }
│  │  ├─ time-clock/               打刻: domain(状態機械) + usecase
│  │  ├─ attendance/               日次サマリ導出: domain + usecase
│  │  ├─ correction/               打刻修正申請: usecase
│  │  ├─ leave/                    休暇・付与・残数: domain(消化順) + usecase
│  │  ├─ approval/                 承認ワークフロー: domain(状態遷移) + usecase
│  │  ├─ aggregation/              月次集計・割増計算: domain（中核）+ usecase
│  │  ├─ report/                   勤務表整形・CSV・PDF: usecase
│  │  ├─ calendar/                 休日判定・祝日: domain + usecase
│  │  └─ admin/                    マスタ CRUD: usecase
│  ├─ components/
│  │  ├─ ui/                       shadcn/ui 生成物
│  │  └─ <共有部品>
│  ├─ lib/
│  │  ├─ prisma.ts                 PrismaClient シングルトン
│  │  ├─ auth.ts                   Auth.js 設定・helpers
│  │  ├─ env.ts                    Zod で process.env 検証
│  │  ├─ datetime.ts               JST 変換・期間ユーティリティ
│  │  ├─ result.ts                 Result 型（例外に頼らないエラー伝播）
│  │  └─ audit.ts                  監査ログ記録
│  └─ styles/ (tokens)
├─ tests/
│  ├─ unit/                        aggregation / time-clock / leave / calendar
│  ├─ fixtures/                    ケースデータ（就業規則・打刻列）
│  └─ e2e/                         Playwright シナリオ
├─ docker-compose.yml              postgres:16（＋任意で adminer）。app プロファイルでアプリも起動
├─ Dockerfile                      お試し起動用イメージ（Next.js 開発サーバー。本番用ではない）
├─ .env.example
├─ .env                            ← .gitignore
├─ lefthook.yml
├─ vitest.config.ts
├─ playwright.config.ts
├─ next.config.ts
├─ tsconfig.json
└─ package.json
```

## 4. データフロー例（打刻修正の承認）

1. 画面 `/approvals` (Server Component) が `approval.listPending()` を呼び一覧表示。
2. ADMIN が「承認」→ Server Action `approveCorrection(id, comment)`。
3. usecase: `assertRole('ADMIN')` → 対象申請取得 → `assertNotSelf` → 締め状態チェック
   → `approval.domain.canApprove()` → トランザクションで
   (a) 打刻イベントへ差分適用（取消フラグ／新イベント追加）
   (b) 対象日の `DailySummary` を `attendance.domain.buildDailySummary()` で再構築
   (c) 影響する月次 `MonthlyAggregate` を無効化（次回参照時に再計算）
   (d) `audit.record(...)`
4. `revalidatePath` で一覧と当該ユーザーの勤怠を更新。

## 5. 環境変数（`.env.example`）

| 変数                     | 例（ダミー）                                                           | 用途                                                       |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://rexclock:rexclock@localhost:5432/rexclock?schema=public` | Prisma 接続。本番では各自の値に変更                        |
| `AUTH_SECRET`            | `dummy-generate-with-openssl-rand-base64-32`                           | Auth.js セッション署名。各自再生成                         |
| `AUTH_URL`               | `http://localhost:3000`                                                | Auth.js コールバック基点                                   |
| `APP_TIMEZONE`           | `Asia/Tokyo`                                                           | 表示・集計 TZ（固定推奨）                                  |
| `INITIAL_ADMIN_EMAIL`    | `admin@example.com`                                                    | seed が作る初期管理者                                      |
| `INITIAL_ADMIN_PASSWORD` | `ChangeMe123!`                                                         | 同上。初回ログインで変更必須                               |
| `CSV_ENCODING`           | `utf8-bom`                                                             | 既定の CSV 文字コード（`utf8` / `utf8-bom` / `shift_jis`） |

- `src/lib/env.ts` で Zod 検証し、未設定なら起動時に明確なエラー。
- `.env` は `.gitignore`。CI やレビュー用途では `.env.example` をコピーして使う。

## 6. 起動・開発フロー（README と同期）

起動方法は 2 通り。

**2-A. お試し起動（Docker だけで完結）** — `docker compose --profile app up`

- `Dockerfile`（node:22 + pnpm）のコンテナで Next.js 開発サーバーを動かす。Node.js / pnpm のインストールは不要。
- 起動時に `scripts/docker-entrypoint.sh` が依存インストール → `prisma generate` → `prisma migrate deploy` を行い、
  DB にユーザーがいないときだけ `pnpm db:seed` を流す（seed は既存ユーザーのパスワードを初期値へ戻すため、毎回は流さない）。
- `DATABASE_URL` などは `docker-compose.yml` の `environment` で渡す（DB はサービス名 `db` で参照）。
- ソースはボリュームマウントで即時反映。`node_modules` / `.next` はホストと混ざらないよう名前付きボリュームに分ける。
- `pnpm install` は `--ignore-scripts` で実行する。`prepare` の `lefthook install` がマウントしたホストの `.git/hooks` を書き換えるのを防ぐため。

**2-B. ネイティブ開発** — PostgreSQL だけ Docker で起動し、アプリはホストの Node.js で動かす。
型チェック・Git フック（lefthook）・結合テスト・E2E テストはこちらを前提にする。

```bash
pnpm install
cp .env.example .env                 # 必要に応じて値を変更
docker compose up -d                  # PostgreSQL
pnpm prisma migrate dev              # スキーマ適用
pnpm db:seed                         # 架空データ＋マスタ＋祝日
pnpm dev                             # http://localhost:3000
```

- 本番環境では: `DATABASE_URL` を自前の PostgreSQL に向け、`AUTH_SECRET` を再生成、`pnpm prisma migrate deploy`、seed は流さず ADMIN のみ作成する CLI (`pnpm create:admin`) を用意。

## 7. 品質ゲート

- `pnpm typecheck` (tsc --noEmit)
- `pnpm lint`
- `pnpm test` (Vitest) — 集計・状態機械はカバレッジ目標 100% 近辺
- `pnpm test:e2e` (Playwright) — 主要 5 シナリオ
- lefthook: pre-commit で lint（差分ファイルのみ）/format/typecheck、pre-push で単体テスト

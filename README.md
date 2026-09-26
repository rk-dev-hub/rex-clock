# RexClock

勤怠管理システムです。
出退勤・休憩の打刻、打刻修正・休暇の申請と承認、労働基準法に沿った月次の労働時間・割増時間の集計、CSV / PDF 出力を行えます。

機能要件の詳細は [docs/01-requirements.md](./docs/01-requirements.md)、アーキテクチャは [docs/02-architecture.md](./docs/02-architecture.md)、データベース設計は [docs/03-database.md](./docs/03-database.md) を参照してください。

## 主な機能

- 認証・ロール管理（従業員 / 管理者、初回ログイン時のパスワード変更、ログイン試行の回数制限）
- 打刻（出勤・休憩・退勤、日をまたぐ勤務、締め済みの期間への打刻防止）
- 集計（日次→週 40 時間→月次。時間外 25% / 月 60 時間超 50%・深夜 25%・法定休日 35%・遅刻早退・有給休暇の扱い）
- 申請（打刻修正・休暇・取消。有給休暇は失効が近い付与分から消化）
- 承認（承認待ち一覧、1 件ずつ承認・却下（却下はコメント必須、自分の申請は承認不可）、操作履歴の記録）
- マスタ管理（就業規則・勤務パターン・休日カレンダー（祝日の取り込みと手動の上書き）・有給休暇の付与と調整）
- 月次の締め（締め前のチェック、締め、理由を記録した再オープン、期間を指定した再計算）
- 出力（日別 CSV・月次サマリ CSV・勤務表 PDF。CSV の文字コードを選択可能）

割増計算は労働基準法に沿った固定のロジックです（1 日 8 時間 / 週 40 時間）。フレックスタイム制・裁量労働制・変形労働時間制・シフト制は対象外です。詳細は [docs/04-aggregation-spec.md](./docs/04-aggregation-spec.md) を参照してください。

## 技術スタック

- フレームワーク: Next.js 16 (App Router) + React 19 + TypeScript
- UI: Tailwind CSS v4 + shadcn/ui
- 認証: Auth.js v5
- データベース: PostgreSQL 16 + Prisma 6
- テスト: Vitest + Playwright

詳細は [docs/02-architecture.md](./docs/02-architecture.md) を参照してください。

## 動作環境

- Docker / Docker Compose（お試し起動・DB 起動に利用）
- ネイティブでセットアップする場合のみ: Node.js 22 以上、pnpm 10 以上

## セットアップ

### 1. リポジトリの取得

```bash
git clone <このリポジトリのURL>
cd rex-clock
```

### 2-A. お試し起動（Docker Compose のみで完結、Node.js / pnpm 不要）

とりあえず動かしてみたいだけの場合はこちらが最短です。

```bash
docker compose --profile app up
```

DB とアプリをまとめてビルド・起動します。初回はイメージの作成と依存パッケージのインストールで数分かかります。`rex-clock-app` のログに `Ready` と出たら準備完了です。

- アプリ: http://localhost:3000
- DB の閲覧（Adminer）: http://localhost:8080

初回起動時だけ、マイグレーションと開発用データ（架空の従業員・標準のマスタ・祝日）を自動で投入します。2 回目以降は既存のデータを残します。

ログイン情報（自動投入済み。初回ログイン時にパスワードの変更を求められます）:

- 管理者: `admin@example.com` / `ChangeMe123!`
- 従業員: `yamada@example.com` など / `Password123!`

停止するには `Ctrl+C`、コンテナごと削除するには `docker compose --profile app down` を実行してください（DB のデータも消す場合は `-v` を付けます）。ソースコードはコンテナにマウントしているので、編集すると自動で反映されます（本格的に開発する場合は下記 2-B を推奨）。

> ポート `3000` / `5432` / `8080` がローカルの別プロセスで既に使われている場合は、`.env` に `APP_PORT` / `DB_PORT` / `ADMINER_PORT` を書いて変更してください（[.env.example](./.env.example) 参照）。

### 2-B. ネイティブセットアップ（開発向け）

エディタの型チェック・Git フック（lefthook）・結合テスト・E2E テストを使いながら開発したい場合はこちらを推奨します。

```bash
pnpm install
cp .env.example .env          # ローカルではデフォルト値のままで動作します
docker compose up -d          # PostgreSQL と Adminer を起動
pnpm prisma migrate dev       # マイグレーションを適用
pnpm db:seed                  # 架空の従業員・標準のマスタ・祝日データを投入
pnpm dev
```

`http://localhost:3000` でアプリが起動します。PostgreSQL はローカルの `5432` ポートで起動します（DB のユーザー名・パスワード・DB 名はすべて `rexclock`）。

初期管理者は `.env` の `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` で作成されます（デフォルトは 2-A と同じ）。`.env` の主な項目は以下のとおりです。

| 変数                                             | 説明                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `DATABASE_URL`                                   | PostgreSQL の接続文字列                                     |
| `AUTH_SECRET`                                    | セッションの署名鍵。`openssl rand -base64 32` で生成        |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | `pnpm db:seed` が作成する初期管理者                         |
| `CSV_ENCODING`                                   | CSV の既定の文字コード（`utf8` / `utf8-bom` / `shift_jis`） |

## テスト

```bash
pnpm verify             # 型チェック + lint + 単体テスト（DB 不要）
pnpm test               # 単体テスト（Vitest）
pnpm test:integration   # 結合テスト（PostgreSQL が必要）
pnpm test:e2e           # E2E テスト（Playwright。開発サーバーを自動で起動）
```

結合テストと E2E テストは、`docker compose up -d` で起動した開発用 DB のデータを削除・再投入します。**実データのある DB に対しては実行しないでください。**

テスト方針は [docs/07-testing.md](./docs/07-testing.md) を参照してください。

## ディレクトリ構成

```
rex-clock/
├── docs/             # 要件定義・設計ドキュメント
├── prisma/           # スキーマ・マイグレーション・seed
├── src/
│   ├── app/          # 画面・Route Handler（Next.js App Router）
│   ├── features/     # 機能ごとのドメインロジック・ユースケース
│   ├── components/   # 共通 UI
│   └── lib/          # 共通処理
├── tests/            # 単体・結合・E2E テスト
├── scripts/          # 管理者作成・祝日データ更新などのスクリプト
├── data/             # 祝日データ
└── docker-compose.yml
```

詳細は [docs/02-architecture.md](./docs/02-architecture.md) の「ディレクトリ構成」を参照してください。

## 本番環境の設定

ホスティング先ごとのデプロイ構成（インフラ定義など）は本リポジトリに含めず、導入先の環境に合わせて設定します。以下の設定変更のみで本番環境に対応できるよう設計しています。

- `DATABASE_URL` を本番の PostgreSQL に向ける
- `AUTH_SECRET` を必ず新しいランダム値に変更する
- `pnpm prisma migrate deploy` を対象のデータベースに対して実行する
- 開発用データの `pnpm db:seed` は実行せず、管理者だけを作成する: `pnpm create:admin --email you@example.com --password '...' --name 氏名`
- 就業規則（所定労働時間・締め日・割増率・深夜の時間帯・法定休日の曜日）を管理画面（`/admin/work-rules`）で設定する
- 祝日データは `pnpm holidays:update`（内閣府の CSV から `data/holidays.json` を再生成）で更新できる

## 著作権

Copyright (c) 2026 rk-dev-hub. All rights reserved.

動作確認・評価を目的とした、ローカル環境での閲覧・起動・実行は自由です。複製・改変・再配布・商用利用は許可していません。

#!/bin/sh
# docker compose --profile app up 用の起動スクリプト（開発サーバー）。本番用ではない。
set -e

# package.json が更新されていても追従できるよう、起動のたびに依存を揃える（最新なら数秒で終わる）。
# コンテナには TTY が無く、pnpm が node_modules の作り直しを確認しようとして中断するため CI=true を付ける
CI=true pnpm install --frozen-lockfile --ignore-scripts
pnpm prisma generate
pnpm prisma migrate deploy

# seed は既存ユーザーのパスワードを初期値に戻す仕様のため、DB が空のときだけ流す
if pnpm exec tsx scripts/db-is-empty.ts; then
  echo "DB が空のため、開発用データを投入します"
  pnpm db:seed
else
  echo "既存データがあるため seed はスキップします（初期データに戻したい場合は docker compose exec app pnpm db:seed）"
fi

exec pnpm dev

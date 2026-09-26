# docker compose --profile app up で使うお試し起動用イメージ（開発サーバー）。本番用ではない。
FROM node:22-bookworm-slim

# Prisma のエンジンが OpenSSL を必要とする
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# prepare スクリプト（lefthook install）は、マウントしたホスト側の .git/hooks を
# コンテナ内のパスで書き換えてしまうため実行しない
RUN pnpm install --frozen-lockfile --ignore-scripts

EXPOSE 3000
CMD ["sh", "scripts/docker-entrypoint.sh"]

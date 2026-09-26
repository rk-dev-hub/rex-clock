import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// DB を使う結合テスト。docker compose の PostgreSQL が必要。
// pnpm test:integration で実行（通常の pnpm test には含めない）。
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

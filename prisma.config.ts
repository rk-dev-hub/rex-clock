import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 に向けて package.json#prisma ではなく設定ファイルを使う。
// prisma.config.ts を置くと Prisma CLI は .env を自動読み込みしないため、
// ここで dotenv を読み込む（Next.js 本体は .env を自動で読む）。
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});

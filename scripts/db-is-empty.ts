/**
 * Docker のお試し起動用。ユーザーが 1 件もなければ終了コード 0、いれば 1 を返す。
 * seed は既存ユーザーのパスワードを初期値へ戻すため、初回起動時だけ流す判定に使う。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const count = await prisma.user.count();
await prisma.$disconnect();
process.exit(count === 0 ? 0 : 1);

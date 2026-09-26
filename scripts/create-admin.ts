/**
 * 本番/実運用向け。架空データを入れずに管理者 1 名だけ作成する。
 *
 *   pnpm create:admin --email you@example.com --password 'Str0ngPass!' --name 田中
 *
 * 省略時は .env の INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD を使う。
 * 既定の就業規則・勤務パターンが無ければ最小構成を作成する。
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureDefaultPattern(): Promise<string> {
  const rule =
    (await prisma.workRule.findFirst({ where: { isDefault: true } })) ??
    (await prisma.workRule.create({ data: { name: "標準", isDefault: true } }));

  let pattern = await prisma.workPattern.findFirst({
    where: { workRuleId: rule.id, isDefault: true },
  });
  if (!pattern) {
    pattern = await prisma.workPattern.create({
      data: { workRuleId: rule.id, name: "標準 9-18", isDefault: true },
    });
    for (let weekday = 0; weekday < 7; weekday++) {
      const isWorkday = weekday >= 1 && weekday <= 5;
      await prisma.workPatternDay.create({
        data: {
          workPatternId: pattern.id,
          weekday,
          isWorkday,
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60,
          prescribedMinutes: isWorkday ? 480 : 0,
        },
      });
    }
  }
  return pattern.id;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
      code: { type: "string" },
    },
  });

  const email = (values.email ?? process.env.INITIAL_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const password = values.password ?? process.env.INITIAL_ADMIN_PASSWORD ?? "";
  const name = values.name ?? "管理者";
  const employeeCode = values.code ?? "ADM001";

  if (!email || password.length < 8) {
    console.error(
      "email と 8 文字以上の password が必要です（--email / --password か .env）。",
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`ユーザー ${email} は既に存在します。`);
    process.exit(1);
  }

  const workPatternId = await ensureDefaultPattern();
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      employeeCode,
      email,
      name,
      passwordHash,
      role: "ADMIN",
      hireDate: new Date(),
      workPatternId,
      mustChangePassword: true,
    },
  });

  console.log(
    `管理者を作成しました: ${admin.email}（初回ログインでパスワード変更）`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

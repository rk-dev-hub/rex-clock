/**
 * 開発用シードデータ。 pnpm db:seed
 *
 * - 就業規則（標準）と勤務パターン（標準 9-18）
 * - 内蔵祝日データ（data/holidays.json、2020 年以降）
 * - 初期管理者（.env の INITIAL_ADMIN_*）と架空の従業員 4 名
 * - 従業員への有給付与
 * - 直近数営業日のサンプル打刻（2 名分）
 *
 * すべて upsert で冪等。公開リポジトリのため人物データはすべて架空。
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recomputeDay } from "@/features/attendance/usecase";

const prisma = new PrismaClient();

const ADMIN_EMAIL = (
  process.env.INITIAL_ADMIN_EMAIL ?? "admin@example.com"
).toLowerCase();
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "ChangeMe123!";
const EMPLOYEE_PASSWORD = "Password123!";

/** JST の壁時計時刻から Date を作る。 */
function jst(dateISO: string, hhmm: string): Date {
  return new Date(`${dateISO}T${hhmm}:00+09:00`);
}

/** 対象日から遡って営業日（月〜金）を n 日ぶん集める。'YYYY-MM-DD' で返す。 */
function recentBusinessDays(n: number, from = new Date()): string[] {
  const out: string[] = [];
  const cur = new Date(from);
  while (out.length < n) {
    cur.setDate(cur.getDate() - 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      out.push(cur.toISOString().slice(0, 10));
    }
  }
  return out.reverse();
}

async function seedWorkRuleAndPattern() {
  const existing = await prisma.workRule.findFirst({
    where: { isDefault: true },
  });
  const workRule =
    existing ??
    (await prisma.workRule.create({ data: { name: "標準", isDefault: true } }));

  let pattern = await prisma.workPattern.findFirst({
    where: { workRuleId: workRule.id, isDefault: true },
  });
  if (!pattern) {
    pattern = await prisma.workPattern.create({
      data: { workRuleId: workRule.id, name: "標準 9-18", isDefault: true },
    });
  }

  for (let weekday = 0; weekday < 7; weekday++) {
    const isWorkday = weekday >= 1 && weekday <= 5;
    await prisma.workPatternDay.upsert({
      where: { workPatternId_weekday: { workPatternId: pattern.id, weekday } },
      update: {},
      create: {
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

  return { workRule, pattern };
}

async function seedHolidays() {
  const raw = await readFile(
    resolve(process.cwd(), "data/holidays.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as {
    holidays: { date: string; name: string }[];
  };
  const target = parsed.holidays.filter((h) => h.date >= "2020-01-01");

  for (const h of target) {
    const date = new Date(`${h.date}T00:00:00Z`);
    await prisma.holiday.upsert({
      where: { date },
      update: { name: h.name, source: "BUILTIN" },
      create: { date, name: h.name, source: "BUILTIN" },
    });
  }
  return target.length;
}

async function seedUsers(patternId: string) {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const empHash = await bcrypt.hash(EMPLOYEE_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    // update にも passwordHash / mustChangePassword を含める。
    // 開発中にログインでパスワードを変更しても、再 seed で既知の認証情報へ戻せるようにする。
    update: {
      role: "ADMIN",
      status: "ACTIVE",
      workPatternId: patternId,
      passwordHash: adminHash,
      mustChangePassword: true,
    },
    create: {
      employeeCode: "ADM001",
      email: ADMIN_EMAIL,
      name: "管理者",
      passwordHash: adminHash,
      role: "ADMIN",
      hireDate: new Date("2023-04-01T00:00:00Z"),
      workPatternId: patternId,
      mustChangePassword: true,
    },
  });

  const employeeSpecs = [
    {
      code: "EMP001",
      email: "yamada@example.com",
      name: "山田 太郎",
      hire: "2023-04-01",
    },
    {
      code: "EMP002",
      email: "sato@example.com",
      name: "佐藤 花子",
      hire: "2024-04-01",
    },
    {
      code: "EMP003",
      email: "suzuki@example.com",
      name: "鈴木 一郎",
      hire: "2024-10-01",
    },
    {
      code: "EMP004",
      email: "tanaka@example.com",
      name: "田中 みなみ",
      hire: "2025-04-01",
    },
  ];

  const employees = [];
  for (const spec of employeeSpecs) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: {
        status: "ACTIVE",
        workPatternId: patternId,
        passwordHash: empHash,
        mustChangePassword: true,
      },
      create: {
        employeeCode: spec.code,
        email: spec.email,
        name: spec.name,
        passwordHash: empHash,
        role: "EMPLOYEE",
        hireDate: new Date(`${spec.hire}T00:00:00Z`),
        workPatternId: patternId,
        mustChangePassword: true,
      },
    });
    employees.push(user);
  }

  return { admin, employees };
}

async function seedLeaveGrants(
  admin: { id: string },
  employees: { id: string; hireDate: Date }[],
) {
  for (const emp of employees) {
    const already = await prisma.leaveGrant.findFirst({
      where: { userId: emp.id },
    });
    if (already) continue;

    const grantDate = new Date(emp.hireDate);
    grantDate.setMonth(grantDate.getMonth() + 6);
    const expiryDate = new Date(grantDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);

    const grant = await prisma.leaveGrant.create({
      data: {
        userId: emp.id,
        grantedDays: "10.0",
        grantDate,
        expiryDate,
        reason: "入社 6 か月経過による法定付与（初回）",
        createdById: admin.id,
      },
    });
    await prisma.leaveLedger.create({
      data: {
        userId: emp.id,
        kind: "GRANT",
        days: "10.0",
        effectiveDate: grantDate,
        grantId: grant.id,
        note: "seed",
      },
    });
  }
}

async function seedSampleClockEvents(employees: { id: string }[]) {
  const targets = employees.slice(0, 2);
  const days = recentBusinessDays(3);
  const touched: { userId: string; day: string }[] = [];

  for (const emp of targets) {
    for (const day of days) {
      const businessDate = new Date(`${day}T00:00:00Z`);
      const existing = await prisma.timeClockEvent.findFirst({
        where: { userId: emp.id, businessDate },
      });
      if (!existing) {
        const rows: Prisma.TimeClockEventCreateManyInput[] = (
          [
            ["CLOCK_IN", "09:00"],
            ["BREAK_START", "12:00"],
            ["BREAK_END", "13:00"],
            ["CLOCK_OUT", "18:00"],
          ] as const
        ).map(([type, at]) => ({
          userId: emp.id,
          type,
          occurredAt: jst(day, at),
          businessDate,
          source: "SELF",
          createdById: emp.id,
        }));
        await prisma.timeClockEvent.createMany({ data: rows });
      }
      touched.push({ userId: emp.id, day });
    }
  }

  for (const t of touched) {
    await recomputeDay(t.userId, t.day, prisma);
  }
  return touched.length;
}

async function main() {
  console.log("seed 開始");
  const { pattern } = await seedWorkRuleAndPattern();
  console.log("  就業規則・勤務パターン OK");

  const holidayCount = await seedHolidays();
  console.log(`  祝日 ${holidayCount} 件 OK`);

  const { admin, employees } = await seedUsers(pattern.id);
  console.log(
    `  ユーザー ${employees.length + 1} 名 OK（管理者: ${ADMIN_EMAIL}）`,
  );

  await seedLeaveGrants(admin, employees);
  console.log("  有給付与 OK");

  const clockDays = await seedSampleClockEvents(employees);
  console.log(`  サンプル打刻 ${clockDays} 日ぶん OK`);

  console.log("seed 完了");
  console.log(`  管理者ログイン: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(
    `  従業員ログイン: yamada@example.com ほか / ${EMPLOYEE_PASSWORD}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

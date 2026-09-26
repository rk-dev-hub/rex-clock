/**
 * 内閣府が公開する「国民の祝日」CSV から data/holidays.json を再生成する。
 *
 *   pnpm holidays:update            # 既定 URL から取得
 *   pnpm holidays:update <path>     # ローカル CSV ファイルから取得
 *
 * CSV は Shift_JIS。ヘッダ行「国民の祝日・休日月日,国民の祝日・休日名称」。
 * ネットワークが無い環境向けに、取得失敗時は既存の data/holidays.json を保持する。
 */
import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CAO_CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";
const OUT_PATH = resolve(process.cwd(), "data/holidays.json");

type HolidayRecord = { date: string; name: string };

function parseCsv(text: string): HolidayRecord[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: HolidayRecord[] = [];
  for (const row of rows) {
    const [rawDate, rawName] = row.split(",");
    // ヘッダや不正行をスキップ
    const m = rawDate?.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (!m || !rawName) continue;
    const [, y, mo, d] = m;
    const date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    out.push({ date, name: rawName.trim() });
  }
  return out;
}

async function loadSource(arg: string | undefined): Promise<string> {
  if (arg) {
    const buf = await readFile(resolve(process.cwd(), arg));
    return new TextDecoder("shift_jis").decode(buf);
  }
  const res = await fetch(CAO_CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder("shift_jis").decode(buf);
}

async function main() {
  const arg = process.argv[2];
  let records: HolidayRecord[];
  try {
    const text = await loadSource(arg);
    records = parseCsv(text);
    if (records.length === 0) throw new Error("パース結果が 0 件");
  } catch (e) {
    console.error(
      `祝日データの取得に失敗しました: ${e instanceof Error ? e.message : e}`,
    );
    console.error(
      "既存の data/holidays.json を保持します。ネットワークがある環境で再実行してください。",
    );
    process.exit(1);
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  const payload = {
    source: arg ?? CAO_CSV_URL,
    generatedAt: new Date().toISOString(),
    count: records.length,
    holidays: records,
  };
  await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(
    `data/holidays.json を更新しました: ${records.length} 件 (${records[0]?.date} 〜 ${records.at(-1)?.date})`,
  );
}

void main();

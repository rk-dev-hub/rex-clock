import { describe, expect, it } from "vitest";
import {
  toCsvString,
  encodeCsv,
  contentDisposition,
} from "@/features/report/csv";
import {
  DAILY_COLUMNS,
  SUMMARY_COLUMNS,
  type DailyCsvRow,
  type SummaryCsvRow,
} from "@/features/report/csv-schema";
import type { DailySummary, MonthlyAggregate } from "@prisma/client";

// --- 列スキーマの固定（列の増減を検知） ---

describe("CSV 列スキーマ", () => {
  it("日別明細の列キーは固定", () => {
    expect(DAILY_COLUMNS.map((c) => c.key)).toEqual([
      "date",
      "weekday",
      "dayType",
      "clockIn",
      "clockOut",
      "breakMinutes",
      "workedMinutes",
      "withinStatutoryOt",
      "overStatutoryOt",
      "night",
      "legalHoliday",
      "late",
      "earlyLeave",
      "leave",
      "paidLeaveMinutes",
      "flags",
    ]);
  });

  it("月次サマリの列キーは固定", () => {
    expect(SUMMARY_COLUMNS.map((c) => c.key)).toEqual([
      "employeeCode",
      "name",
      "workDays",
      "absenceDays",
      "paidLeaveFullDays",
      "paidLeaveHalfDays",
      "totalWorkedMinutes",
      "withinPrescribedMinutes",
      "withinStatutoryOtMinutes",
      "overtime25Minutes",
      "overtime50Minutes",
      "nightMinutes",
      "legalHolidayMinutes",
      "paidLeaveMinutes",
      "lateCount",
      "lateMinutes",
      "earlyLeaveCount",
      "earlyLeaveMinutes",
      "breakMinutes",
    ]);
  });
});

// --- 整形・エンコード ---

const daily: DailySummary = {
  id: "x",
  userId: "u",
  workDate: new Date("2026-09-07T00:00:00Z"),
  dayType: "WORKDAY",
  firstIn: new Date("2026-09-07T00:00:00Z"), // JST 09:00
  lastOut: new Date("2026-09-07T10:15:00Z"), // JST 19:15
  breakMinutes: 60,
  workedMinutes: 555,
  prescribedMinutes: 480,
  withinStatutoryOtMinutes: 0,
  overStatutoryOtMinutes: 75,
  nightMinutes: 0,
  legalHolidayMinutes: 0,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  leaveType: null,
  leaveDayPart: null,
  paidLeaveCountedMinutes: 0,
  flags: ["OVER_STATUTORY_OT"],
  closingPeriodId: null,
  computedAt: new Date(),
};

describe("toCsvString", () => {
  it("ヘッダ行 + データ行を CRLF で組む", () => {
    const rows: DailyCsvRow[] = [
      { date: "2026-09-07", dayType: "WORKDAY", summary: daily },
    ];
    const csv = toCsvString(rows, DAILY_COLUMNS, ["メモ行"]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("メモ行");
    expect(lines[1].startsWith("日付,曜日,区分")).toBe(true);
    expect(
      lines[2].startsWith("2026-09-07,月,平日,09:00,19:15,1:00,9:15"),
    ).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("フラグ列は日本語ラベルで出力される", () => {
    const rows: DailyCsvRow[] = [
      { date: "2026-09-07", dayType: "WORKDAY", summary: daily },
    ];
    const csv = toCsvString(rows, DAILY_COLUMNS);
    expect(csv).toContain("法定外残業あり");
    expect(csv).not.toContain("OVER_STATUTORY_OT");
  });

  it("カンマ・改行・引用符を含む値はクオートされる", () => {
    const row = {
      employeeCode: 'A,B"C',
      name: "改行\nあり",
      aggregate: { workDays: 1 } as MonthlyAggregate,
    } satisfies SummaryCsvRow;
    const csv = toCsvString(
      [row],
      [SUMMARY_COLUMNS[0], SUMMARY_COLUMNS[1], SUMMARY_COLUMNS[2]],
    );
    expect(csv).toContain('"A,B""C"');
    expect(csv).toContain('"改行\nあり"');
  });
});

describe("encodeCsv", () => {
  it("utf8-bom は先頭に EF BB BF", () => {
    const b = encodeCsv("a,b\r\n", "utf8-bom");
    expect([b[0], b[1], b[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("utf8 は BOM なし", () => {
    const b = encodeCsv("a,b\r\n", "utf8");
    expect(b[0]).not.toBe(0xef);
  });

  it("shift_jis は日本語をマルチバイトに変換（非 UTF-8）", () => {
    const b = encodeCsv("日付\r\n", "shift_jis");
    // Shift_JIS の「日」= 0x93 0xFA
    expect(b[0]).toBe(0x93);
    expect(b[1]).toBe(0xfa);
  });
});

describe("contentDisposition", () => {
  it("ASCII フォールバックと RFC5987 の両方を出す", () => {
    const cd = contentDisposition("勤務表_A01_2026-09-01.csv");
    expect(cd).toMatch(/filename="[\x20-\x7e]+\.csv"/);
    expect(cd).toContain("filename*=UTF-8''");
  });
});

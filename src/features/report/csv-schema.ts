import { minutesToHm } from "@/lib/datetime";
import { formatDateJa } from "@/lib/date-range";
import { dayTypeLabel } from "@/features/calendar/labels";
import { dayPartLabel, leaveTypeLabel } from "@/features/approval/labels";
import { displayFlagLabel } from "@/features/attendance/flag-labels";
import type { DailySummary, DayType, MonthlyAggregate } from "@prisma/client";

// CSV の列定義はここに集約し、列の増減をテストで固定する（docs/06 §8）。
// value は必ず string を返す（数値は分→H:MM か素の分か、列ごとに明示）。

export type Column<T> = {
  key: string;
  header: string;
  value: (row: T) => string;
};

export type DailyCsvRow = {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  summary: DailySummary | null;
};

const min = (n: number | undefined | null) => (n == null ? "" : minutesToHm(n));
const rawMin = (n: number | undefined | null) => (n == null ? "" : String(n));

function jstHm(d: Date | null | undefined): string {
  if (!d) return "";
  const j = new Date(d.getTime() + 9 * 60 * 60_000);
  return `${String(j.getUTCHours()).padStart(2, "0")}:${String(
    j.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

export const DAILY_COLUMNS: Column<DailyCsvRow>[] = [
  { key: "date", header: "日付", value: (r) => r.date },
  { key: "weekday", header: "曜日", value: (r) => weekdayJa(r.date) },
  { key: "dayType", header: "区分", value: (r) => dayTypeLabel[r.dayType] },
  { key: "clockIn", header: "出勤", value: (r) => jstHm(r.summary?.firstIn) },
  { key: "clockOut", header: "退勤", value: (r) => jstHm(r.summary?.lastOut) },
  {
    key: "breakMinutes",
    header: "休憩",
    value: (r) => min(r.summary?.breakMinutes),
  },
  {
    key: "workedMinutes",
    header: "実働",
    value: (r) => min(r.summary?.workedMinutes),
  },
  {
    key: "withinStatutoryOt",
    header: "法定内残業",
    value: (r) => min(r.summary?.withinStatutoryOtMinutes),
  },
  {
    key: "overStatutoryOt",
    header: "法定外残業",
    value: (r) => min(r.summary?.overStatutoryOtMinutes),
  },
  {
    key: "night",
    header: "深夜",
    value: (r) => min(r.summary?.nightMinutes),
  },
  {
    key: "legalHoliday",
    header: "法定休日労働",
    value: (r) => min(r.summary?.legalHolidayMinutes),
  },
  {
    key: "late",
    header: "遅刻",
    value: (r) => min(r.summary?.lateMinutes),
  },
  {
    key: "earlyLeave",
    header: "早退",
    value: (r) => min(r.summary?.earlyLeaveMinutes),
  },
  {
    key: "leave",
    header: "休暇",
    value: (r) =>
      r.summary?.leaveType
        ? `${leaveTypeLabel(r.summary.leaveType)}${
            r.summary.leaveDayPart
              ? `(${dayPartLabel(r.summary.leaveDayPart)})`
              : ""
          }`
        : "",
  },
  {
    key: "paidLeaveMinutes",
    header: "有給みなし",
    value: (r) => min(r.summary?.paidLeaveCountedMinutes),
  },
  {
    key: "flags",
    header: "フラグ",
    value: (r) =>
      ((r.summary?.flags as string[] | undefined) ?? [])
        .map(displayFlagLabel)
        .join(";"),
  },
];

export type SummaryCsvRow = {
  employeeCode: string;
  name: string;
  aggregate: MonthlyAggregate;
};

export const SUMMARY_COLUMNS: Column<SummaryCsvRow>[] = [
  { key: "employeeCode", header: "社員番号", value: (r) => r.employeeCode },
  { key: "name", header: "氏名", value: (r) => r.name },
  {
    key: "workDays",
    header: "出勤日数",
    value: (r) => String(r.aggregate.workDays),
  },
  {
    key: "absenceDays",
    header: "欠勤日数",
    value: (r) => String(r.aggregate.absenceDays),
  },
  {
    key: "paidLeaveFullDays",
    header: "有給(全日)",
    value: (r) => String(r.aggregate.paidLeaveFullDays),
  },
  {
    key: "paidLeaveHalfDays",
    header: "有給(半日)",
    value: (r) => String(r.aggregate.paidLeaveHalfDays),
  },
  {
    key: "totalWorkedMinutes",
    header: "総労働",
    value: (r) => min(r.aggregate.totalWorkedMinutes),
  },
  {
    key: "withinPrescribedMinutes",
    header: "所定内",
    value: (r) => min(r.aggregate.withinPrescribedMinutes),
  },
  {
    key: "withinStatutoryOtMinutes",
    header: "法定内残業",
    value: (r) => min(r.aggregate.withinStatutoryOtMinutes),
  },
  {
    key: "overtime25Minutes",
    header: "時間外25%",
    value: (r) => min(r.aggregate.overtime25Minutes),
  },
  {
    key: "overtime50Minutes",
    header: "時間外50%",
    value: (r) => min(r.aggregate.overtime50Minutes),
  },
  {
    key: "nightMinutes",
    header: "深夜25%",
    value: (r) => min(r.aggregate.nightMinutes),
  },
  {
    key: "legalHolidayMinutes",
    header: "法定休日35%",
    value: (r) => min(r.aggregate.legalHolidayMinutes),
  },
  {
    key: "paidLeaveMinutes",
    header: "有給みなし",
    value: (r) => min(r.aggregate.paidLeaveMinutes),
  },
  {
    key: "lateCount",
    header: "遅刻回数",
    value: (r) => String(r.aggregate.lateCount),
  },
  {
    key: "lateMinutes",
    header: "遅刻時間",
    value: (r) => min(r.aggregate.lateMinutes),
  },
  {
    key: "earlyLeaveCount",
    header: "早退回数",
    value: (r) => String(r.aggregate.earlyLeaveCount),
  },
  {
    key: "earlyLeaveMinutes",
    header: "早退時間",
    value: (r) => min(r.aggregate.earlyLeaveMinutes),
  },
  {
    key: "breakMinutes",
    header: "休憩合計",
    value: (r) => min(r.aggregate.breakMinutes),
  },
];

// H:MM ではなく分の生値が欲しい場合の代替（給与ソフト向け拡張余地）。未使用だが公開。
export { rawMin };

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function weekdayJa(dateStr: string): string {
  return WD[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}
export { formatDateJa };

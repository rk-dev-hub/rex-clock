import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { join } from "node:path";
import { minutesToHm } from "@/lib/datetime";
import { formatDateSlash } from "@/lib/date-range";
import { dayTypeLabel } from "@/features/calendar/labels";
import type { DayType, LeaveDayPart, LeaveType } from "@prisma/client";
import type { UserReport } from "@/features/report/build-report";

// A4 縦の月次勤務表。日本語表示のため、実際に使う文言だけを収録した
// サブセットフォント（fonts/NotoSansJP-Subset.ttf, SIL OFL。fonts/OFL.txt 参照）を同梱している。
// 氏名・申請理由などの自由入力文字（任意の漢字）はサブセットに含まれないため
// 表示していない（社員番号のみ）。氏名まで必要な場合は日別 CSV / 画面の勤務表を使う。
//
// 注意: このファイルや features/calendar/labels.ts の日本語文言を追加・変更したら
// フォントの再生成が必要（未収録の文字は文字化けする）。手順:
//   1. Noto Sans JP 可変フォントを wght=400 で静的インスタンス化
//      (fonttools varLib.instancer -o out.ttf NotoSansJP[wght].ttf wght=400)
//   2. このファイル + labels.ts に実際に出現する文字（ASCII 含む）を text ファイルにまとめる
//   3. pyftsubset --text-file=... --layout-features='' --no-hinting --desubroutinize
//      --name-IDs='1,2,3,4,6' --name-legacy --drop-tables+=STAT で再サブセット
//   4. name テーブルの nameID 1/2/4/6 が可変フォントのインスタンス名（Thin 等）を
//      引きずっていないか確認し、必要なら fontTools.ttLib.TTFont で書き換える

const FONT_PATH = join(
  process.cwd(),
  "src/features/report/fonts/NotoSansJP-Subset.ttf",
);
let fontRegistered = false;
function ensureFontRegistered() {
  if (fontRegistered) return;
  Font.register({
    family: "NotoSansJP",
    src: FONT_PATH,
  });
  // このフォントには合字（リガチャ）が無く、fontkit が誤検出すると
  // 文字間に余分な字形が挿入されることがあるため明示的に無効化する。
  Font.registerHyphenationCallback((word) => [word]);
  fontRegistered = true;
}

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "NotoSansJP" },
  h1: { fontSize: 13, marginBottom: 2 },
  meta: { fontSize: 9, color: "#555", marginBottom: 8 },
  note: { fontSize: 8, color: "#a15", marginBottom: 6 },
  row: { flexDirection: "row", borderBottom: "0.5 solid #ccc" },
  head: {
    flexDirection: "row",
    borderBottom: "1 solid #333",
    backgroundColor: "#f0f0f4",
  },
  cell: { padding: 3, borderRight: "0.5 solid #eee" },
  legend: { fontSize: 7, color: "#666", marginTop: 6 },
  summaryTitle: { fontSize: 10, marginTop: 12, marginBottom: 3 },
  summaryLine: { fontSize: 8, marginBottom: 2 },
  foot: { fontSize: 7, color: "#888", marginTop: 10 },
});

const COLS: { w: number; label: string; align?: "right" }[] = [
  { w: 46, label: "日付" },
  { w: 42, label: "区分" },
  { w: 30, label: "出勤" },
  { w: 30, label: "退勤" },
  { w: 32, label: "休憩", align: "right" },
  { w: 36, label: "実働", align: "right" },
  { w: 46, label: "法定内残業", align: "right" },
  { w: 46, label: "法定外残業", align: "right" },
  { w: 32, label: "深夜", align: "right" },
  { w: 38, label: "法定休日", align: "right" },
  { w: 30, label: "遅刻", align: "right" },
  { w: 30, label: "早退", align: "right" },
  { w: 60, label: "休暇" },
];

// PDF は列幅が限られるため、承認画面等より短い表記にする。
const LEAVE_TYPE_SHORT: Record<LeaveType, string> = {
  PAID: "有給",
  ABSENCE: "欠勤",
  SPECIAL_UNPAID: "特別休暇",
};
const LEAVE_PART_SHORT: Record<LeaveDayPart, string> = {
  FULL: "",
  AM: "(午前)",
  PM: "(午後)",
};

function jstHm(d: Date | null | undefined) {
  if (!d) return "";
  const j = new Date(d.getTime() + 9 * 60 * 60_000);
  return `${String(j.getUTCHours()).padStart(2, "0")}:${String(
    j.getUTCMinutes(),
  ).padStart(2, "0")}`;
}
const m = (n: number | null | undefined) => (n ? minutesToHm(n) : "");

export function WorksheetPdf({ report }: { report: UserReport }) {
  ensureFontRegistered();
  const a = report.summaryRow.aggregate;
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <Text style={s.h1}>月次勤務表</Text>
        <Text style={s.meta}>
          社員番号：{report.user.employeeCode}　期間：
          {formatDateSlash(report.periodStart)} 〜{" "}
          {formatDateSlash(report.periodEnd)}
        </Text>
        {!report.closed ? (
          <Text style={s.note}>※未締め期間のため暫定値です</Text>
        ) : null}

        <View style={s.head}>
          {COLS.map((c) => (
            <Text
              key={c.label}
              style={[
                s.cell,
                { width: c.w, textAlign: c.align ?? "left", fontSize: 7 },
              ]}
            >
              {c.label}
            </Text>
          ))}
        </View>

        {report.dailyRows.map((r) => {
          const su = r.summary;
          const leave = su?.leaveType
            ? `${LEAVE_TYPE_SHORT[su.leaveType]}${
                su.leaveDayPart ? LEAVE_PART_SHORT[su.leaveDayPart] : ""
              }`
            : "";
          const vals = [
            r.date.slice(5).replace("-", "/"),
            dayTypeLabel[r.dayType as DayType],
            jstHm(su?.firstIn),
            jstHm(su?.lastOut),
            m(su?.breakMinutes),
            m(su?.workedMinutes),
            m(su?.withinStatutoryOtMinutes),
            m(su?.overStatutoryOtMinutes),
            m(su?.nightMinutes),
            m(su?.legalHolidayMinutes),
            m(su?.lateMinutes),
            m(su?.earlyLeaveMinutes),
            leave,
          ];
          return (
            <View style={s.row} key={r.date}>
              {COLS.map((c, i) => (
                <Text
                  key={c.label}
                  style={[s.cell, { width: c.w, textAlign: c.align ?? "left" }]}
                >
                  {vals[i]}
                </Text>
              ))}
            </View>
          );
        })}

        <Text style={s.legend}>
          ※法定外残業は週40時間の壁を反映済みの値です（日次分＋週次の振替分）。
        </Text>

        <Text style={s.summaryTitle}>期間集計</Text>
        <Text style={s.summaryLine}>
          出勤日数 {a.workDays}日　欠勤 {a.absenceDays}日　有給 全日
          {a.paidLeaveFullDays}日+半日{a.paidLeaveHalfDays}回　総労働{" "}
          {minutesToHm(a.totalWorkedMinutes)}
        </Text>
        <Text style={s.summaryLine}>
          所定内 {minutesToHm(a.withinPrescribedMinutes)}
          　法定内残業（割増なし） {minutesToHm(a.withinStatutoryOtMinutes)}
          　法定外残業25% {minutesToHm(a.overtime25Minutes)}
          　法定外残業50%（月60時間超） {minutesToHm(a.overtime50Minutes)}
        </Text>
        <Text style={s.summaryLine}>
          深夜25% {minutesToHm(a.nightMinutes)}　法定休日35%{" "}
          {minutesToHm(a.legalHolidayMinutes)}　遅刻 {a.lateCount}回（
          {minutesToHm(a.lateMinutes)}）　早退 {a.earlyLeaveCount}回（
          {minutesToHm(a.earlyLeaveMinutes)}）　休憩合計{" "}
          {minutesToHm(a.breakMinutes)}
        </Text>

        <Text style={s.foot} fixed>
          RexClock　労働基準法に準拠した固定ロジックで算出しています。氏名や申請理由など任意入力の文字は収録フォントの都合上この
          PDF には表示していません。詳細は画面の勤務表をご確認ください。
        </Text>
      </Page>
    </Document>
  );
}

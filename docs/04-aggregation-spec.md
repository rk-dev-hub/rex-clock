# 労働時間集計・割増計算 仕様

本書は実装の中核。すべて **純粋関数（`features/aggregation/domain`）** として実装し、
`tests/unit` で網羅的に検証する。前提は「固定時間制・労基法準拠の固定ロジック」。

## 0. 用語と原則

| 用語         | 定義                                                             |
| ------------ | ---------------------------------------------------------------- |
| 所定労働時間 | 勤務パターンが当日について定める労働時間（分）。既定 480 分      |
| 法定労働時間 | 1日 8 時間（480 分）／1週 40 時間（2400 分）。固定値             |
| 実労働時間   | 拘束時間 − 休憩時間。打刻から算出                                |
| 法定内残業   | 所定超過だが日 8h 以内の労働。割増なし（通常賃金）。記録はする   |
| 法定外残業   | 日 8h 超、または週 40h 超の労働。25% 以上割増（月 60h 超は 50%） |
| 深夜労働     | 22:00–翌 5:00 の労働。25% 割増（時間外と独立して加算）           |
| 法定休日労働 | 法定休日（既定：日曜）の労働。35% 割増。週 40h 計算から除外      |
| 所定休日労働 | 法定外休日（既定：土曜）の労働。週 40h 超過分のみ時間外扱い      |

**原則**

1. 集計は打刻・承認済休暇・カレンダー・マスタから**決定的**に再計算できる。
2. 時間は「分」で保持。給与計算に渡すのは各割増バケツの**時間**であり、金額は算出しない。
3. 有給・半休で実際に労働していない時間は、残業・深夜・週 40h の判定基礎に**含めない**。
   賃金支払対象としての「みなし労働時間」は `paidLeaveCountedMinutes` に別途持つ。
4. タイムゾーンは Asia/Tokyo 固定。深夜帯・日跨ぎは JST で判定。

## 1. 入力（domain 関数のシグネチャ）

```ts
type ClockEvent = { type: ClockType; at: Date };            // canceled=false のみ、時刻昇順

type DayContext = {
  workDate: string;                 // 'YYYY-MM-DD' (JST)
  dayType: 'WORKDAY' | 'PRESCRIBED_HOLIDAY' | 'LEGAL_HOLIDAY';
  prescribedMinutes: number;        // 当日の所定（休日は 0）
  scheduledStart?: string;          // 'HH:mm' 所定始業（遅刻判定用、休日は無し）
  scheduledEnd?: string;            // 'HH:mm' 所定終業（早退判定用）
  scheduledBreakMinutes: number;    // 所定休憩
  leave?: { type: LeaveType; part: 'FULL' | 'AM' | 'PM' };
};

type WorkRuleSnapshot = {
  nightStart: string;               // '22:00'
  nightEnd: string;                 // '05:00'
  breakPolicy: 'ACTUAL' | 'AUTO_DEDUCT';
  autoBreakRules: { overMinutes: number; breakMinutes: number }[];
  roundingUnitMinutes: number;      // 1 = 丸めなし
  overtimeRatePct: number; nightRatePct: number;
  legalHolidayRatePct: number; over60hRatePct: number;
};

// 日次
buildDailySummary(events: ClockEvent[], ctx: DayContext, rule: WorkRuleSnapshot): DailySummaryResult

// 週次（40h 壁）
applyWeeklyOvertime(days: DailySummaryResult[], rule, weekStartsOn): DailySummaryResult[]

// 月次
buildMonthlyAggregate(days: DailySummaryResult[], rule): MonthlyAggregateResult
```

## 2. 日次サマリ算出手順（`buildDailySummary`）

### 2.1 拘束区間の構築

1. 打刻列を状態機械（`03` の `ClockType`）で検証。`CLOCK_IN` → (`BREAK_START`→`BREAK_END`)\* → `CLOCK_OUT`。
2. `CLOCK_OUT` が無い → `workedMinutes` は算出せず `flags += MISSING_CLOCK_OUT`（0 分扱い、要修正）。
3. `CLOCK_IN` が無いのに他打刻がある → `flags += MISSING_CLOCK_IN`。
4. 拘束区間 = `[firstIn, lastOut]`。`lastOut < firstIn`（=翌日退勤）は翌日として許容（日跨ぎ）。

### 2.2 休憩時間

- `breakPolicy = ACTUAL`: Σ(`BREAK_END` − `BREAK_START`)。ペア不整合は `flags += BREAK_MISMATCH`。
- `breakPolicy = AUTO_DEDUCT`: 拘束時間から、`autoBreakRules` を `overMinutes` 昇順で評価し
  「拘束 > overMinutes」を満たす最大段階の `breakMinutes` を控除。実打刻があればその合計と比較し**大きい方**を採用。
- 休憩不足チェック（労基法 34 条）: 実拘束 > 360 分かつ休憩 < 45 分、または実拘束 > 480 分かつ休憩 < 60 分 → `flags += BREAK_SHORTAGE`。
  - 既知の簡略化: 34 条は本来「労働時間」6h/8h 超が基準だが、本システムでは判定を簡潔にするため「拘束時間」で判定する。
    長時間休憩で拘束だけが閾値を超える場合に偽陽性となりうる（警告フラグのみ・賃金非関与）。

### 2.3 実労働時間

```
workedMinutes = (lastOut - firstIn) - breakMinutes         // 丸めない
```

- **日次では丸めない**（昭 63.3.14 基発 150 号: 1 日ごとの労働時間の端数切り捨ては不可）。
  丸めが必要なら、月次の時間外・深夜・法定休日それぞれの**合計**に対する 30 分未満四捨五入
  として `buildMonthlyAggregate` 側で実装する。`WorkRule.roundingUnitMinutes` は当面未使用
  （将来この月次丸めの単位として再利用する）。
- `workedMinutes < 0` は 0 にクランプし `flags += NEGATIVE_WORK`。
- 実装補足: 拘束・休憩・実労働の差分は `diffMinutes`（秒→分は四捨五入）で求める。

### 2.4 深夜労働

- 深夜帯 = 当日 `nightStart`（22:00）〜翌日 `nightEnd`（05:00）、および前日 22:00〜当日 05:00。
- `nightMinutes` = 拘束区間 ∩ 深夜帯 の長さから、その区間に含まれる休憩を按分控除した実労働分。
- 深夜は `dayType` に関係なく算出（法定休日でも深夜割増は加算されるため）。

### 2.5 dayType 別の振り分け

**A. `LEGAL_HOLIDAY`（法定休日）**

- `legalHolidayMinutes = workedMinutes`（全時間が 35%）。
- `withinStatutoryOtMinutes = 0`、`overStatutoryOtMinutes = 0`（週 40h 計算に加えない）。
- `nightMinutes` は 2.4 のまま（法定休日深夜 = 35% + 25%）。
- 遅刻・早退は算出しない。

**B. `PRESCRIBED_HOLIDAY`（所定休日）／`WORKDAY`（平日）で `prescribedMinutes` 起点に振り分け**

```
base           = leave 補正後の所定（§2.7）
withinPrescribed = min(workedMinutes, base)
afterPrescribed  = max(workedMinutes - base, 0)

// 法定内残業：所定超〜日 8h まで
withinStatutoryOt = clamp(min(workedMinutes, 480) - base, 0, ...)     // base < 480 のときのみ正
// 日次法定外残業：日 8h 超
dailyOverStatutoryOt = max(workedMinutes - 480, 0)
```

- 所定休日は `prescribedMinutes = 0` のため `withinPrescribed = 0`、全労働が
  `withinStatutoryOt`（8h まで）＋ `dailyOverStatutoryOt`（8h 超）に入る。
  週 40h 判定（§3）で `withinStatutoryOt` の一部が 25% に昇格しうる。
- `overStatutoryOtMinutes`（日次確定分）= `dailyOverStatutoryOt`。週次で加算される（§3）。

### 2.6 遅刻・早退（`WORKDAY` かつ `leave` なし／半休は §2.7）

```
lateMinutes       = max(0, (firstIn の JST 時刻) - scheduledStart)
earlyLeaveMinutes = max(0, scheduledEnd - (lastOut の JST 時刻))
```

- 残業がある日でも早退判定は所定終業基準で行う（所定終業前に退勤していれば早退）。
- 中抜け（勤務時間帯内の私用外出）は扱わない（休憩打刻で吸収）。

### 2.7 休暇日の補正

| leave.part                | 扱い                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FULL` + `PAID`           | 打刻が無ければ `workedMinutes=0`。`paidLeaveCountedMinutes = prescribedMinutes`。残業等バケツは全 0。遅刻早退なし                                                                                       |
| `FULL` + `ABSENCE`        | すべて 0。`absence` フラグ。`paidLeaveCountedMinutes=0`                                                                                                                                                 |
| `AM`（午前半休）          | `base = prescribedMinutes / 2`。所定時間帯は後半にシフト（`scheduledStart` を所定の中央に）。`paidLeaveCountedMinutes = prescribedMinutes/2`（PAID の場合）。実打刻があれば午後の労働として §2.5 を適用 |
| `PM`（午後半休）          | `base = prescribedMinutes / 2`。所定時間帯は前半。早退判定は半休開始時刻を `scheduledEnd` とみなす                                                                                                      |
| `FULL` + `SPECIAL_UNPAID` | `workedMinutes=0`、`paidLeaveCountedMinutes=0`、`specialLeave` フラグ                                                                                                                                   |

- 半休 + 実労働で日 8h を超えるケースも §2.5 の式で自然に処理（`base` が小さいだけ）。
  ただし残業判定の基礎は**実労働時間のみ**（有給の 0.5 日分は加えない）。
- 既知の簡略化: 「所定の中央」は始業・終業の単純中点で計算し、休憩を勘案しない。
  9:00–18:00（休憩 1h）の PM 半休は実勤務の中点 14:00 ではなく 13:30 となり、遅刻/早退を僅かに過少判定しうる。
- 振り分け基準 `base` は `min(当日所定, 480)` にクランプする（所定 > 8h の誤設定でも
  `worked = withinPrescribed + withinStatutoryOt + overStatutoryOt` の総和不変を保つため）。

### 2.8 日次出力（`DailySummaryResult`）

`workedMinutes, breakMinutes, withinPrescribedMinutes, withinStatutoryOtMinutes,
overStatutoryOtMinutes, nightMinutes, legalHolidayMinutes, lateMinutes,
earlyLeaveMinutes, paidLeaveCountedMinutes, dayType, leaveType?, leaveDayPart?, flags[]`

この時点の `overStatutoryOtMinutes` は**日次確定分のみ**。週次で増える。

## 3. 週 40 時間の壁（`applyWeeklyOvertime`）

対象: `weekStartsOn`（既定 月曜）起算の 7 日間。**法定休日の労働は除外**。

```
weeklyCountable = Σ over days( withinPrescribedMinutes + withinStatutoryOtMinutes )
                   // = 「日 8h 以下」かつ「法定休日でない」実労働の合計
weeklyExcess    = max(0, weeklyCountable - 2400)            // 40h = 2400 分
```

- `weeklyExcess` を、週内の日について**時系列の遅い順**に `withinStatutoryOt`／`withinPrescribed` から
  差し引き、その分を各日の `overStatutoryOtMinutes` に移す（＝ 25% へ昇格）。
  遅い順にするのは「週の後半で 40h に到達する」実態に合わせるため（給与実務の一般慣行）。
- 日 8h 超で既に `overStatutoryOtMinutes` に入っている分は二重カウントしない
  （`weeklyCountable` に含めていないため自然に回避）。
- 月をまたぐ週は、各日が属する期間（`ClosingPeriod`）側の月次に集計されるが、
  週 40h 判定は**暦週**で行い、結果を日次に反映してから月次へ積む。

## 4. 深夜の扱い（再掲・注意）

- `nightMinutes` は「時間帯」による集計。時間外・法定休日と**排他ではない**。
- 給与計算側の割増率合成例（本アプリは率を掛けないが仕様として明記）:
  - 平日法定外残業 + 深夜 = 1.25 + 0.25 = **1.50**
  - 法定休日 + 深夜 = 1.35 + 0.25 = **1.60**
  - 月 60h 超残業 + 深夜 = 1.50 + 0.25 = **1.75**
- したがって `nightMinutes` は他バケツから**引かない**。重複して持つのが正しい。

## 5. 月次集計（`buildMonthlyAggregate`）

対象期間 = `ClosingPeriod.periodStart..periodEnd`（締め日で区切る。31=月末）。

```
sumOverStatutoryOt = Σ day.overStatutoryOtMinutes         // 週次反映後
overtime50Minutes  = max(0, sumOverStatutoryOt - 3600)    // 月 60h = 3600 分 超
overtime25Minutes  = sumOverStatutoryOt - overtime50Minutes

withinStatutoryOtMinutes = Σ day.withinStatutoryOtMinutes // 割増なし（記録）
withinPrescribedMinutes  = Σ day.withinPrescribedMinutes
nightMinutes             = Σ day.nightMinutes
legalHolidayMinutes      = Σ day.legalHolidayMinutes
totalWorkedMinutes       = Σ day.workedMinutes

workDays        = 実労働のあった日数（workedMinutes > 0）
absenceDays     = leaveType = ABSENCE の日数
paidLeaveFullDays = PAID かつ part=FULL の日数
paidLeaveHalfDays = PAID かつ part∈{AM,PM} の回数
lateCount / lateMinutes            = Σ（lateMinutes>0 の日数 / 分）
earlyLeaveCount / earlyLeaveMinutes = 同上
breakMinutes    = Σ day.breakMinutes
paidLeaveMinutes = Σ day.paidLeaveCountedMinutes   // 有給みなし労働時間（賃金支払対象）
```

- `withinPrescribedMinutes` は `DailySummary` に列を持たず、
  `worked = withinPrescribed + withinStatutoryOt + overStatutoryOt` の不変条件から復元する
  （週次昇格は within/over 間の移動のみで総和不変。§3）。`LEGAL_HOLIDAY` の日は 0。
- マスタ変更・休暇承認・打刻修正承認・締め再オープンは、影響週すべてに対し
  `recomputeWeek` → `recomputeMonth`（`recomputeUserRange`）を必ず呼ぶこと。
  `recomputeMonth` は `DailySummary` を信頼して合算するだけなので、日次が古いと誤る。

- `over60hRatePct` は既定 50。中小企業への猶予は 2023-04 に終了しているため猶予オプションは持たない
  （必要なら将来 WorkRule に `over60hEnabled` を追加）。
- 60h 判定は**暦月**ではなく**締め期間**で行う（実務は暦月が原則だが、締め日設定に追従する方針。
  `04` の注記として残し、暦月固定が要件なら切替フラグを追加）。

## 6. フラグ一覧（`DailySummary.flags`）

| フラグ                                   | 条件                      | 画面表示             |
| ---------------------------------------- | ------------------------- | -------------------- |
| `MISSING_CLOCK_IN` / `MISSING_CLOCK_OUT` | 出勤/退勤打刻欠落         | 赤・要修正申請       |
| `BREAK_MISMATCH`                         | 休憩開始/終了のペア不整合 | 赤                   |
| `BREAK_SHORTAGE`                         | 法定休憩不足（34 条）     | 橙・警告             |
| `NEGATIVE_WORK`                          | 実労働が負                | 赤                   |
| `HOLIDAY_WORK`                           | 法定/所定休日に労働       | 橙                   |
| `OVER_STATUTORY_OT`                      | 日次法定外残業 > 0        | 情報                 |
| `LONG_DAY`                               | 拘束 > 13h                | 橙・警告（過重労働） |
| `PAST_LEAVE`                             | 過去日への休暇申請        | 情報（ADMIN 承認可） |

## 7. ワークド例（テストケースの雛形）

### 例 1: 標準日（9:00–19:15、休憩 12:00–13:00、平日、所定 480）

- 拘束 615、休憩 60 → `workedMinutes = 555`
- `withinPrescribed = 480`、`withinStatutoryOt = 0`（所定=8h）、
  日次 `overStatutoryOt = max(555-480,0)=75`
- 深夜 0、遅刻 0、早退 0
- 週 40h 未達なら月次は `overtime25Minutes += 75`

### 例 2: 深夜またぎ（22:00–翌 2:00、休憩なし、平日、所定 480、当日は他に労働なし）

- `workedMinutes = 240`。§2.5B の総量ベース式に従い `withinPrescribed = 240`（所定 480 未満）、
  `withinStatutoryOt = 0`、日次 `overStatutoryOt = 0`（8h 未満）
- `nightMinutes = 240`（22:00–24:00 と 24:00–02:00）
- 週 40h 判定で `weeklyCountable` に 240 が入り、40h 超なら超過分が `overStatutoryOt` へ昇格。深夜 240 は不変
- ※ 実働が所定時間帯（9–18）の外でも、集計は「いつ働いたか」ではなく総量で振り分ける（総量ベース）

### 例 3: 法定休日出勤（日曜、10:00–16:00、休憩 1h）

- `legalHolidayMinutes = 300`、`withinStatutoryOt = overStatutoryOt = 0`
- 週 40h の `weeklyCountable` には**加えない**
- 深夜 0

### 例 4: 午前半休 + 午後勤務（所定 480、AM 半休、13:00–19:30、休憩なし）

- `base = 240`、実労働 390
- `paidLeaveCountedMinutes = 240`（PAID）
- `withinStatutoryOt = min(390,480) - 240 = 150`、日次 `overStatutoryOt = max(390-480,0) = 0`
- 早退なし（所定終業まで勤務）、遅刻なし（半休で始業繰下げ）

### 例 5: 週 40h 超（月〜金 各 9h 実働・所定 8h、法定休日労働なし）

- 各日: `withinPrescribed=480`, `withinStatutoryOt=0`, 日次 `overStatutoryOt=60`（9h-8h）
- `weeklyCountable = 5 × 480 = 2400` → `weeklyExcess = 0`（8h 以下ぶんだけで 40h ちょうど）
- 結果、法定外残業は日次分の `60×5 = 300` 分のみ。妥当

### 例 6: 週 40h 超（月〜土 各 7h 実働・所定 7h、土は所定休日）

- 月〜金: `withinPrescribed=420`、`overStatutoryOt=0`
- 土（所定休日）: `withinStatutoryOt=420`（8h 未満）、`overStatutoryOt=0`
- `weeklyCountable = 420×5 + 420 = 2520` → `weeklyExcess = 120`
- 遅い順（＝土曜）から 120 分を `overStatutoryOt` へ昇格 → 土の 25% 対象が 120 分

## 8. 実装チェックリスト（`aggregation-verifier` エージェントで検証）

- [ ] 日跨ぎ（`lastOut` < `firstIn`）で実労働・深夜が正しい
- [ ] 深夜帯が前日 22:00 と当日 5:00 の両側で算出される
- [ ] 法定休日労働が週 40h 計算から除外される
- [ ] 週次昇格が「遅い順」で二重カウントしない
- [ ] 月 60h 超の 50% 切り出しが週次反映後の値で行われる
- [ ] 半休 + 実労働、AM/PM で所定時間帯シフトが正しい
- [ ] `roundingUnitMinutes>1` が労働者不利にならない方向に丸める
- [ ] 締め期間が月末以外（20 日締め等）でも期間境界が正しい
- [ ] 有給・欠勤・特別休暇で残業/深夜バケツが 0、`paidLeaveCountedMinutes` のみ設定
- [ ] `flags` が §6 の条件どおり立つ

# Server Actions / Route Handler 一覧

- 変更系はすべて **Server Action**（`features/<domain>/usecase` を呼ぶ薄いアダプタ）。
- 参照系は Server Component から usecase の read を直接呼ぶ（Action 不要）。
- ストリーム応答（CSV / PDF）と認証コールバックのみ **Route Handler**。
- すべての Action 冒頭で `requireUser()` / `requireAdmin()` と本人・締め状態チェック。
- 入力は Zod スキーマ（`features/<domain>/schema.ts`）。戻り値は `Result<T, AppError>`。

## 1. 共通

| 関数                         | 場所                           | 説明                                                          |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------- |
| `requireUser()`              | `features/auth/rbac`           | 未ログインは `/login` へ redirect。返り値 `{ id, role, ... }` |
| `requireAdmin()`             | 同上                           | `ADMIN` 以外は 403                                            |
| `requireSelfOrAdmin(userId)` | 同上                           | 本人 or ADMIN のみ                                            |
| `assertPeriodOpen(date)`     | `features/aggregation/usecase` | 対象日が CLOSED 期間なら `PERIOD_CLOSED` エラー               |
| `recordAudit(tx, {...})`     | `lib/audit`                    | 同一トランザクションで監査ログ書込                            |

`AppError` 種別: `UNAUTHENTICATED` `FORBIDDEN` `VALIDATION` `CONFLICT`（状態機械違反）
`PERIOD_CLOSED` `NOT_FOUND` `SELF_APPROVAL` `LEAVE_OVERLAP`。

## 2. 認証

| 種別          | 名前                               | 入力                         | 処理                                                                               |
| ------------- | ---------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Route Handler | `GET/POST /api/auth/[...nextauth]` | —                            | Auth.js。Credentials（email, password）→ bcrypt 照合 → JWT                         |
| Action        | `changeOwnPassword`                | `{ current, next, confirm }` | 本人。bcrypt 照合 → 更新 → `mustChangePassword=false`。監査 `PASSWORD_RESET(self)` |

## 3. 打刻（time-clock）

| 名前    | 入力                  | 処理                                                                                                                                                                                                                                        |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `punch` | `{ type: ClockType }` | 本人。サーバ時刻で `TimeClockEvent` 追加。`time-clock/domain` の状態機械で可否判定（不可なら `CONFLICT`）。`businessDate` 導出。当該日 `DailySummary` 再計算・月次 stale。監査は `source=SELF` のため通常ログ不要（打刻テーブル自体が記録） |

管理者による代理打刻は未実装。ADMIN が打刻を修正する場合も「打刻修正申請」の
管理者承認フロー（§4）を経由する。

## 4. 打刻修正申請（correction）

| 名前                   | 入力                                              | 処理                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitCorrection`     | `{ targetDate, reason, lines: CorrectionLine[] }` | 本人。`assertPeriodOpen(targetDate)` → `PENDING` で作成。lines を `correction/domain` で検証（対象イベント存在・二重操作・時刻整合）。**現行実装は `DRAFT` を省略しフォームから直接 `PENDING`**（`saveCorrectionDraft` は未実装。`RequestStatus.DRAFT` と状態機械の `SUBMIT` 遷移は将来のため残置） |
| `cancelCorrection`     | `{ id }`                                          | 本人。`PENDING` → `CANCELED`                                                                                                                                                                                                                                                                        |
| `approveCorrection` 🔒 | `{ id, comment? }`                                | ADMIN。`assertNotSelf` → `assertPeriodOpen` → tx 内で lines 適用（`ADD`=新 event、`UPDATE`=旧 `canceled=true`＋新 event、`DELETE`=`canceled=true`）→ `DailySummary` 再構築 → 月次 stale → `status=APPROVED` → 監査 `APPROVE`（before/after=打刻列）                                                 |
| `rejectCorrection` 🔒  | `{ id, comment }`                                 | ADMIN。comment 必須。`status=REJECTED`。監査 `REJECT`                                                                                                                                                                                                                                               |

## 5. 休暇（leave）

| 名前                      | 入力                                            | 処理                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitLeaveRequest`      | `{ type, startDate, endDate, dayPart, reason }` | 本人。期間重複チェック（`LEAVE_OVERLAP`）。期間指定は `dayPart=FULL` のみ。過去日は `PAST_LEAVE` フラグ付与（提出可）。残日数を計算して警告値を添付                                                                                                                                                                                    |
| `cancelLeaveRequest`      | `{ id }`                                        | 本人。`PENDING` → `CANCELED`                                                                                                                                                                                                                                                                                                           |
| `submitLeaveCancellation` | `{ id, reason }`                                | 本人。`APPROVED` 済に対する取消申請。`kind=CANCELLATION` の新規 `LeaveRequest` を作成し ADMIN 承認を待つ                                                                                                                                                                                                                               |
| `approveLeave` 🔒         | `{ id, comment? }`                              | ADMIN。`assertNotSelf`。対象日すべて `assertPeriodOpen`。`kind=TAKE`: `status=APPROVED` → 各日 `DailySummary` に休暇反映（§`04` 2.7）→ `LeaveLedger` に `CONSUME` 行を FIFO（`expiryDate` 昇順）生成。`kind=CANCELLATION`: 元申請を `CANCELED` にし消化を打ち消す `ADJUST(+)` 行・対象日サマリ復元。いずれも月次 stale・監査 `APPROVE` |
| `rejectLeave` 🔒          | `{ id, comment }`                               | ADMIN。comment 必須。監査 `REJECT`                                                                                                                                                                                                                                                                                                     |

## 6. 管理マスタ（admin）

| 名前                                               | 入力                                                                                            | 処理                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `createUser` 🔒                                    | `{ name, email, employeeCode, hireDate, employmentType, role, workPatternId, initialPassword }` | email/code 一意。bcrypt。`mustChangePassword=true`。監査 `USER_CREATE`                   |
| `resetUserPassword` 🔒                             | `{ userId, initialPassword? }`                                                                  | 自動生成可。`mustChangePassword=true`。監査 `PASSWORD_RESET`                             |
| `setUserStatus` 🔒                                 | `{ userId, status }`                                                                            | `ACTIVE`/`DISABLED`。監査 `USER_DISABLE`                                                 |
| `updateWorkRule` 🔒                                | `WorkRule` フィールド                                                                           | Zod で率・時刻・締め日を検証。監査 `MASTER_CHANGE`（before/after）。再計算は明示ボタン   |
| `recomputeRange` 🔒                                | `{ from, to, userId? }`                                                                         | 指定範囲の `DailySummary` を再構築、月次 stale。影響件数を返す                           |
| `upsertWorkPattern` 🔒 / `upsertWorkPatternDay` 🔒 | 各フィールド                                                                                    | 監査 `MASTER_CHANGE`                                                                     |
| `importHolidays` 🔒                                | `{ year? }`                                                                                     | `data/holidays.json` を読み `Holiday` upsert、`CalendarDay` 再生成。監査 `MASTER_CHANGE` |
| `overrideCalendarDay` 🔒                           | `{ date, dayType, isHoliday, label?, overrideReason }`                                          | `CalendarDay` upsert。影響日の `DailySummary` stale。監査 `MASTER_CHANGE`                |
| `addLeaveGrant` 🔒                                 | `{ userId, grantedDays, grantDate, expiryDate, reason }`                                        | `LeaveGrant` ＋ `LeaveLedger(GRANT)`。監査 `LEAVE_GRANT`                                 |
| `adjustLeaveLedger` 🔒                             | `{ userId, days, effectiveDate, note }`                                                         | `LeaveLedger(ADJUST)`。監査 `LEAVE_GRANT`                                                |

## 7. 月次締め（closing）

| 名前                           | 入力                      | 処理                                                                                             |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `getClosingPrecheck` 🔒 (read) | `{ periodStart }`         | 未処理申請数、フラグ日数、打刻漏れユーザー一覧                                                   |
| `closePeriod` 🔒               | `{ periodStart }`         | 全ユーザーの当該期間 `MonthlyAggregate` を確定計算 → `ClosingPeriod.status=CLOSED`。監査 `CLOSE` |
| `reopenPeriod` 🔒              | `{ periodStart, reason }` | `status=OPEN`。監査 `REOPEN`（reason 必須）                                                      |

## 8. 出力（Route Handler / report usecase）

| 種別          | ルート                           | クエリ                               | 出力                                                                                                                                                                                                            |
| ------------- | -------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route Handler | `GET /api/export/attendance.csv` | `userId, periodStart[, all=1]`       | 日別明細 CSV。`CSV_ENCODING` 準拠。ADMIN のみ `all=1`                                                                                                                                                           |
| Route Handler | `GET /api/export/summary.csv`    | `(userId または all=1), periodStart` | 月次サマリ CSV（`MonthlyAggregate` 列）                                                                                                                                                                         |
| Route Handler | `GET /api/export/worksheet.pdf`  | `userId, periodStart`                | `@react-pdf/renderer` で A4 日本語勤務表。表示文言のみのサブセットフォント（Noto Sans JP）を同梱。氏名・申請理由など任意入力の文字は収録対象外のため表示しない（社員番号のみ。氏名まで必要なら日別 CSV / 画面） |

- 認可: `requireSelfOrAdmin(userId)`。`all=1` は `requireAdmin`。
- 未締め期間は暫定値である旨をヘッダ行／PDF 脚注に明記。
- CSV 列定義は `features/report/csv-schema.ts` に集約し、テストで固定（列の増減を検知）。

## 9. バリデーション・スキーマ配置

```
features/<domain>/schema.ts     … Zod スキーマ（Action 入力・フォーム共有）
features/<domain>/errors.ts      … AppError ファクトリ
lib/result.ts                    … Result<T,E>, ok(), err(), isOk()
```

- フォームは RHF + `zodResolver(schema)`。同じ `schema` を Action でも `schema.parse()`。
- Action の戻りは `Result`。UI 側で `err` の `code` に応じてトースト／フィールドエラー表示。

## 10. 認可マトリクス（要点）

| リソース                                    | EMPLOYEE | ADMIN                        |
| ------------------------------------------- | -------- | ---------------------------- |
| 自分の打刻・申請・勤怠・勤務表              | ○        | ○                            |
| 他人の打刻・勤怠・勤務表                    | ✕        | ○（読み取り・代理打刻・CSV） |
| 申請の承認/却下                             | ✕        | ○（自己申請を除く）          |
| マスタ（就業規則/パターン/カレンダー/付与） | ✕        | ○                            |
| 月次締め/再オープン                         | ✕        | ○                            |
| 監査ログ閲覧                                | ✕        | ○                            |

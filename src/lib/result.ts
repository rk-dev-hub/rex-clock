/**
 * 例外に頼らないエラー伝播。usecase / Server Action の戻り値に使う。
 * UI 側は `code` に応じてトースト/フィールドエラーを出し分ける。
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "PERIOD_CLOSED"
  | "NOT_FOUND"
  | "SELF_APPROVAL"
  | "LEAVE_OVERLAP";

export type AppError = {
  code: AppErrorCode;
  message: string;
  /** フィールド単位のバリデーションエラー（RHF に流し込む用） */
  fields?: Record<string, string>;
};

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: AppError };
export type Result<T = void> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(
  code: AppErrorCode,
  message: string,
  fields?: Record<string, string>,
): Err {
  return { ok: false, error: { code, message, fields } };
}

export function isOk<T>(r: Result<T>): r is Ok<T> {
  return r.ok;
}

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "ログインが必要です。",
  FORBIDDEN: "この操作を行う権限がありません。",
  VALIDATION: "入力内容を確認してください。",
  CONFLICT: "現在の状態ではこの操作を実行できません。",
  PERIOD_CLOSED: "対象期間は締め済みです。",
  NOT_FOUND: "対象が見つかりません。",
  SELF_APPROVAL: "自分の申請は承認できません。",
  LEAVE_OVERLAP: "期間が重複する申請があります。",
};

export function errWithDefault(
  code: AppErrorCode,
  message?: string,
  fields?: Record<string, string>,
): Err {
  return err(code, message ?? DEFAULT_MESSAGES[code], fields);
}

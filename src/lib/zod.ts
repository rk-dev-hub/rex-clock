import type { ZodError } from "zod";

/** ZodError を { フィールド名: 先頭メッセージ } に変換する（RHF / フォーム表示用）。 */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) {
      out[key] = issue.message;
    }
  }
  return out;
}

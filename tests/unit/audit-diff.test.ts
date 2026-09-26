import { describe, expect, it } from "vitest";
import { buildAuditDiffLines } from "@/features/admin/audit-diff";

describe("buildAuditDiffLines", () => {
  it("フラットなオブジェクトは変更のあったフィールドだけ before → after で出す", () => {
    const lines = buildAuditDiffLines(
      { closingDay: 31, standardDailyMinutes: 480 },
      { closingDay: 20, standardDailyMinutes: 480 },
    );
    expect(lines).toEqual([
      { key: "closingDay", kind: "changed", text: "締め日: 31 → 20" },
    ]);
  });

  it("after にしかないキーは追加として出す", () => {
    const lines = buildAuditDiffLines(
      { status: "ACTIVE" },
      { status: "ACTIVE", role: "ADMIN" },
    );
    expect(lines).toContainEqual({
      key: "role",
      kind: "added",
      text: "権限: ADMIN",
    });
  });

  it("before にしかないキーは削除として出す", () => {
    const lines = buildAuditDiffLines(
      { status: "ACTIVE", role: "ADMIN" },
      { status: "ACTIVE" },
    );
    expect(lines).toContainEqual({
      key: "role",
      kind: "removed",
      text: "権限: ADMIN",
    });
  });

  it("差分がなければ「変更なし」を返す", () => {
    expect(buildAuditDiffLines({ a: 1 }, { a: 1 })).toEqual([
      { key: "_none", kind: "info", text: "変更なし" },
    ]);
  });

  it("日付文字列は YYYY/MM/DD 表示にする", () => {
    const lines = buildAuditDiffLines(
      { expiryDate: "2026-09-30" },
      { expiryDate: "2027-03-31" },
    );
    expect(lines).toEqual([
      {
        key: "expiryDate",
        kind: "changed",
        text: "失効日: 2026/09/30 → 2027/03/31",
      },
    ]);
  });

  it("{ events: [...] } は打刻の追加/削除として差分表示する", () => {
    const before = {
      events: [{ type: "CLOCK_IN", at: "2026-09-07T00:00:00.000Z" }],
    };
    const after = {
      events: [
        { type: "CLOCK_IN", at: "2026-09-07T00:00:00.000Z" },
        { type: "CLOCK_OUT", at: "2026-09-07T10:15:00.000Z" },
      ],
    };
    const lines = buildAuditDiffLines(before, after);
    expect(lines).toEqual([
      {
        key: "add:CLOCK_OUT@2026-09-07T10:15:00.000Z",
        kind: "added",
        text: "追加: 退勤 19:15",
      },
    ]);
  });

  it("before が無い（作成系ログ）場合はフラットな一覧として表示する", () => {
    const lines = buildAuditDiffLines(null, {
      grantedDays: "2.0",
      expiryDate: "2026-09-30",
    });
    expect(lines).toEqual([
      { key: "grantedDays", kind: "info", text: "付与日数: 2.0" },
      { key: "expiryDate", kind: "info", text: "失効日: 2026/09/30" },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { formatDateSlash } from "@/lib/date-range";

describe("formatDateSlash", () => {
  it("'YYYY-MM-DD' を 'YYYY/MM/DD' に変換する", () => {
    expect(formatDateSlash("2026-09-11")).toBe("2026/09/11");
  });
});

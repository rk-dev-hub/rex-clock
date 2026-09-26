import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("結合する", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("falsy を除外する", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("競合する Tailwind クラスは後勝ち", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

import { describe, expect, test } from "bun:test";
import { cn } from "./utils";

describe("cn", () => {
  test("merges class names", () => {
    const result = cn("a", false && "b", "c");
    expect(result).toContain("a");
    expect(result).toContain("c");
    expect(result).not.toContain("b");
  });
});

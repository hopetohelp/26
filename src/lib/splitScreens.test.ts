import { describe, expect, it } from "vitest";
import { SPLIT_SCREENS, splitCls } from "./splitScreens";

describe("מתג פיצול המסכים", () => {
  it("קפוא: המחלקות של הפיצול אינן מוחלות", () => {
    expect(SPLIT_SCREENS).toBe(false);
    expect(splitCls("lg:columns-2")).toBe("");
  });
});

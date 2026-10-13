import { describe, expect, it } from "vitest";
import { cleanSlugInput, dataUrlBytes, finalSlug, fitSize, groupUrl, hasAlpha, SLUG_RE } from "./groupLink";

describe("group link name", () => {
  it("cleans while typing but keeps a trailing hyphen so 'the-gizra' can be typed", () => {
    expect(cleanSlugInput("The Gizra")).toBe("the-gizra");
    expect(cleanSlugInput("the-")).toBe("the-");
    expect(cleanSlugInput("הגזרה abc!?")).toBe("-abc");
    expect(cleanSlugInput("a__b  c")).toBe("a-b-c");
    expect(cleanSlugInput("x".repeat(50))).toHaveLength(32);
  });
  it("final form drops edge hyphens and rejects the too short or Hebrew-only", () => {
    expect(finalSlug("  The Gizra- ")).toBe("the-gizra");
    expect(finalSlug("ab")).toBeNull();
    expect(finalSlug("הגזרה")).toBeNull();
    expect(finalSlug("")).toBeNull();
    expect(finalSlug("a1-b2")).toBe("a1-b2");
  });
  it("matches the server rule", () => {
    for (const ok of ["abc", "a-b", "a1b", "x".repeat(32)]) expect(SLUG_RE.test(ok), ok).toBe(true);
    for (const bad of ["ab", "-ab", "ab-", "A-b", "x".repeat(33), "a b"]) expect(SLUG_RE.test(bad), bad).toBe(false);
  });
  it("builds the address shared with members", () => {
    expect(groupUrl("hagzara")).toBe("https://26.hopetohelp.net/#/g/hagzara");
  });
  it("fits an image to 800 without enlarging", () => {
    expect(fitSize(1600, 800, 800)).toEqual({ w: 800, h: 400 });
    expect(fitSize(300, 200, 800)).toEqual({ w: 300, h: 200 });
    expect(fitSize(1, 5000, 800)).toEqual({ w: 1, h: 800 });
  });
  it("מזהה שקיפות בתמונה: לוגו שקוף נשאר שקוף", () => {
    expect(hasAlpha([10, 20, 30, 255, 1, 2, 3, 255])).toBe(false);
    expect(hasAlpha([10, 20, 30, 255, 1, 2, 3, 0])).toBe(true);
    expect(hasAlpha([10, 20, 30, 249])).toBe(true);
    expect(hasAlpha([])).toBe(false);
  });
  it("גודל קובץ מתוך data URL", () => {
    expect(dataUrlBytes("data:image/png;base64," + btoa("x".repeat(300)))).toBe(300);
  });
});

import { describe, expect, it } from "vitest";
import { isEmail, maskIdentifier } from "./identifier";

describe("שם משתתף או מייל", () => {
  it("מייל מוסתר ברובו, שם רגיל נשאר", () => {
    expect(maskIdentifier("dani.cohen@gmail.com")).toBe("d***@gmail.com");
    expect(maskIdentifier("דני_7")).toBe("דני_7");
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("דני_7")).toBe(false);
    expect(isEmail(null)).toBe(false);
  });
});

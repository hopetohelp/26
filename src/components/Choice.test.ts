import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chips, Segmented, nextChoice } from "./Choice";

describe("nextChoice — חצים בעברית (RTL)", () => {
  it("חץ שמאלה הוא הבא, חץ ימינה הוא הקודם (הראשון מימין)", () => {
    expect(nextChoice(3, 0, "ArrowLeft", true)).toBe(1);
    expect(nextChoice(3, 1, "ArrowRight", true)).toBe(0);
  });
  it("בכיוון הפוך (LTR) חץ ימינה הוא הבא", () => {
    expect(nextChoice(3, 0, "ArrowRight", false)).toBe(1);
    expect(nextChoice(3, 1, "ArrowLeft", false)).toBe(0);
  });
  it("למעלה ולמטה, והמשך מהצד השני בקצה", () => {
    expect(nextChoice(3, 0, "ArrowDown", true)).toBe(1);
    expect(nextChoice(3, 0, "ArrowUp", true)).toBe(2);
    expect(nextChoice(3, 2, "ArrowLeft", true)).toBe(0);
  });
  it("Home, End, מקש אחר, ובלי אפשרויות", () => {
    expect(nextChoice(4, 2, "Home", true)).toBe(0);
    expect(nextChoice(4, 1, "End", true)).toBe(3);
    expect(nextChoice(4, 1, "a", true)).toBeNull();
    expect(nextChoice(0, -1, "ArrowLeft", true)).toBeNull();
  });
  it("כשאין בחירה: קדימה לראשונה, אחורה לאחרונה", () => {
    expect(nextChoice(3, -1, "ArrowDown", true)).toBe(0);
    expect(nextChoice(3, -1, "ArrowUp", true)).toBe(2);
  });
});

const opts = [{ id: "a", label: "אחד" }, { id: "b", label: "שניים" }, { id: "c", label: "שלושה", disabled: true }] as const;

describe("Segmented ו-Chips — סימון נגיש", () => {
  for (const [name, Comp] of [["Segmented", Segmented], ["Chips", Chips]] as const) {
    it(`${name}: radiogroup עם שם, נבחר אחד, ורק הנבחר בסדר הטאב`, () => {
      const html = renderToStaticMarkup(createElement(Comp as typeof Segmented, { label: "בחירה", value: "b", onChange: () => {}, options: opts }));
      expect(html).toContain('role="radiogroup"');
      expect(html).toContain('aria-label="בחירה"');
      expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
      expect(html.match(/tabindex="0"/g)).toHaveLength(1);
      expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
      expect(html.match(/disabled=""/g)).toHaveLength(1);
    });
    it(`${name}: כשהנבחר מושבת או חסר, האפשרות הפעילה הראשונה נכנסת לסדר הטאב`, () => {
      const html = renderToStaticMarkup(createElement(Comp as typeof Segmented, { label: "בחירה", value: "c", onChange: () => {}, options: opts }));
      expect(html.match(/tabindex="0"/g)).toHaveLength(1);
      expect(html).toMatch(/tabindex="0"[^>]*>אחד/);
    });
  }
});

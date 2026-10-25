import { describe, it, expect } from "vitest";
import { KNESSET_BLOCS } from "../lib/blocDefinitions.js";
import { KNESSET_GROUPS } from "../../../src/lib/simpleSources";

// חלוקת הכנסת (הכרעת בעלים 25.10.2026): אותה הגדרה באתר ובשרת, כדי שהטווח מהשרת יתאים לקבוצה שבאתר
describe("חלוקת הכנסת — אותה הגדרה באתר ובשרת", () => {
  it("חמש הקבוצות זהות ב-KNESSET_GROUPS וב-KNESSET_BLOCS", () => {
    const key = (l) => [...l].sort().join(",");
    expect(KNESSET_BLOCS.map((b) => key(b.lists))).toEqual(KNESSET_GROUPS.map((g) => key(g.lists)));
  });
});

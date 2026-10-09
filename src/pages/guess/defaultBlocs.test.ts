import { expect, it } from "vitest";
import { defaultBlocs, normalizeBlocs, GOV_IDS, IDS } from "./model";
it("משתתף חדש מתחיל בקואליציה (כולל הציבור החרדי), גוש האופוזיציה וערבים", () => {
  expect(defaultBlocs()).toEqual([
    { id: "gov", name: "גוש הקואליציה", lists: ["likud", "shas", "utj", "otzma", "rzp", "amcha", "haredi_public", "noam", "code_black"], target: null },
    { id: "rest", name: "גוש האופוזיציה", lists: ["yashar", "together", "democrats", "yb", "reservists", "bluewhite"], target: null },
    { id: "arab", name: "ערבים", lists: ["joint", "raam"], target: null },
  ]);
  const assigned = defaultBlocs().flatMap(b => b.lists);
  expect([...assigned].sort()).toEqual([...IDS].sort());
  expect(new Set(assigned).size).toBe(assigned.length);
});
it("חלוקה אישית שמורה אינה מוחלפת בברירת המחדל החדשה", () => {
  const saved = { mode: "custom" as const, blocs: [{ id: "mine", name: "שלי", lists: ["raam", "amcha"], target: 20 }] };
  expect(normalizeBlocs(saved)).toBe(saved);
});
it("משמרים את ההרכב המרומז והיעדים של גרסאות הממשלה הישנות", () => {
  const p = normalizeBlocs({ mode: "gov37", blocs: [{ id: "gov", name: "ממשלה", lists: [], target: 65 }, { id: "rest", name: "יתר", lists: [], target: 55 }] });
  expect(p.blocs[0].lists).toEqual(GOV_IDS); expect(p.blocs[0].target).toBe(65);
  expect(p.mode).toBe("custom");
});

it("גושי ברירת מחדל ישנים מתעדכנים: הציבור החרדי לקואליציה, כל השאר ⇐ גוש האופוזיציה, ובסדר החדש", () => {
  const old = { mode: "custom" as const, blocs: [
    { id: "gov", name: "גוש הקואליציה", lists: ["likud", "shas", "utj", "otzma", "rzp", "amcha", "noam", "code_black"], target: 60 },
    { id: "arab", name: "ערבים", lists: ["joint", "raam"], target: null },
    { id: "rest", name: "כל השאר", lists: ["yashar", "together", "democrats", "yb", "reservists", "bluewhite", "haredi_public"], target: null },
  ] };
  const p = normalizeBlocs(old);
  expect(p.blocs.map(b => b.id)).toEqual(["gov", "rest", "arab"]);
  expect(p.blocs[0].lists).toContain("haredi_public");
  expect(p.blocs[0].target).toBe(60);
  expect(p.blocs[1]).toMatchObject({ name: "גוש האופוזיציה" });
  expect(p.blocs[1].lists).not.toContain("haredi_public");
  expect(normalizeBlocs(p)).toEqual(p);
});

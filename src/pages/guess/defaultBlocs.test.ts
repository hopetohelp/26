import { expect, it } from "vitest";
import { defaultBlocs, normalizeBlocs, GOV_IDS, IDS } from "./model";
it("משתתף חדש מתחיל בקואליציה (כולל עמך ישראל, נעם לישראל וצבע שחור), אופוזיציה וערבים", () => {
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

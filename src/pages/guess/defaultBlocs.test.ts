import { expect, it } from "vitest";
import { defaultBlocs, normalizeBlocs, GOV_IDS, IDS } from "./model";
it("משתתף חדש מתחיל בקואליציה (כולל עמך ישראל, נעם לישראל וצבע שחור), אופוזיציה וערבים", () => {
  expect(defaultBlocs()).toEqual([
    { id: "government", name: "הממשלה היוצאת", lists: [...GOV_IDS], target: null },
    { id: "gov", name: "גוש הקואליציה", lists: ["likud", "shas", "utj", "otzma", "rzp", "amcha", "haredi_public", "noam", "code_black"], target: null },
    { id: "rest", name: "גוש האופוזיציה", lists: ["yashar", "together", "democrats", "yb", "reservists", "bluewhite"], target: null },
    { id: "unity", name: "אחדות", lists: ["likud", "yashar", "together", "yb", "bluewhite", "reservists"], target: null },
    { id: "arab", name: "ערבים", lists: ["joint", "raam"], target: null },
  ]);
  const assigned = defaultBlocs().flatMap(b => b.lists);
  expect([...new Set(assigned)].sort()).toEqual([...IDS].sort());
  expect(defaultBlocs().map(b=>b.name)).toEqual(["הממשלה היוצאת","גוש הקואליציה","גוש האופוזיציה","אחדות","ערבים"]);
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

it('הרכב ששונה ושמו שונה אינו משודרג שוב לברירת מחדל ישנה', () => {
  const p={mode:'custom' as const,schemaVersion:2 as const,blocs:[{id:'gov',name:'גוש א',lists:['amcha','likud','otzma','rzp','shas','utj'],target:null}]};
  expect(normalizeBlocs(p)).toBe(p);
});

import { expect, it } from "vitest";
import { defaultBlocs, normalizeBlocs, GOV_IDS, IDS } from "./model";
it("משתתף חדש מתחיל בקואליציה (כולל עמך ישראל, נעם לישראל וצבע שחור), אופוזיציה ומפלגות ערביות", () => {
  expect(defaultBlocs()).toEqual([
    { id: "government", name: "הממשלה היוצאת", lists: [...GOV_IDS], target: null },
    { id: "gov", name: "גוש נתניהו", lists: ["likud", "shas", "utj", "otzma", "rzp", "amcha", "haredi_public", "noam", "code_black"], target: null },
    { id: "rest", name: "גוש אייזנקוט", lists: ["yashar", "together", "democrats", "yb", "reservists", "bluewhite"], target: null },
    { id: "unity", name: "אחדות", lists: ["likud", "yashar", "together", "yb", "bluewhite", "reservists"], target: null },
    { id: "arab", name: "מפלגות ערביות", lists: ["joint", "raam"], target: null },
  ]);
  const assigned = defaultBlocs().flatMap(b => b.lists);
  expect([...new Set(assigned)].sort()).toEqual([...IDS].sort());
  expect(defaultBlocs().map(b=>b.name)).toEqual(["הממשלה היוצאת","גוש נתניהו","גוש אייזנקוט","אחדות","מפלגות ערביות"]);
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

it("גוש שמור בשמות הישנים (הקואליציה/האופוזיציה) והרכב ברירת המחדל מקבל את השמות החדשים; גוש ששונה נשאר", () => {
  const d = defaultBlocs();
  const gov = d.find(b => b.id === "gov")!, rest = d.find(b => b.id === "rest")!;
  const out = normalizeBlocs({ mode: "custom", schemaVersion: 2, blocs: [{ ...gov, name: "גוש הקואליציה" }, { ...rest, name: "גוש האופוזיציה" }] });
  expect(normalizeBlocs({ mode: "custom", schemaVersion: 2, blocs: [{ ...rest, name: "גוש איזנקוט" }] }).blocs[0].name).toBe("גוש אייזנקוט");
  expect(out.blocs.map(b => b.name)).toEqual(["גוש נתניהו", "גוש אייזנקוט"]);
  const changed = { mode: "custom" as const, schemaVersion: 2 as const, blocs: [{ ...gov, name: "גוש הקואליציה", lists: ["likud"] }] };
  expect(normalizeBlocs(changed)).toBe(changed);
});

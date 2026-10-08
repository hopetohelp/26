import { expect, it } from "vitest";
import { defaultBlocs, normalizeBlocs, GOV_IDS } from "./model";
it("משתתף חדש מתחיל בתרחיש ריק בלי שיוך פוליטי מוכתב", () => {
  expect(defaultBlocs()).toEqual([{ id: "scenario-1", name: "תרחיש 1", lists: [], target: null }]);
});
it("משמרים את ההרכב המרומז והיעדים של גרסאות הממשלה הישנות", () => {
  const p = normalizeBlocs({ mode: "gov37", blocs: [{ id: "gov", name: "ממשלה", lists: [], target: 65 }, { id: "rest", name: "יתר", lists: [], target: 55 }] });
  expect(p.blocs[0].lists).toEqual(GOV_IDS); expect(p.blocs[0].target).toBe(65);
  expect(p.mode).toBe("custom");
});

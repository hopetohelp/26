import { expect, it } from "vitest";
import results from "../data/results.json";

// מעבר המצביעים לכל זוג מערכות עוקבות (pipeline/voter_flows.py): אף קול לא יוצא מהחשבון
const files = import.meta.glob<{ default: { knesset: number; prev: number; old: string[]; new: string[]; national: { flows: number[][]; flowsTo: number[][] } } }>("../data/flows/k*.json", { eager: true });

it("בכל זוג מערכות: עמודות המעבר = התוצאה הרשמית החדשה, שורות = הקודמת", () => {
  expect(Object.keys(files).length).toBeGreaterThanOrEqual(7);
  for (const { default: f } of Object.values(files)) {
    // 2009 אינה בבורר: התוצאה שלה ב-previous של 2013
    type L = { lists: { letters: string; votes: number }[] };
    const cur = results.find((e) => e.knesset === f.knesset)!;
    const prev: L = results.find((e) => e.knesset === f.prev) ?? (results.find((e) => (e as { previous?: { knesset: number } }).previous?.knesset === f.prev) as unknown as { previous: L }).previous;
    f.new.slice(0, -2).forEach((l, j) => expect(f.national.flows.reduce((a, r) => a + r[j], 0), `${f.knesset} ${l}`).toBe(cur.lists.find((x) => x.letters === l)!.votes));
    f.old.slice(0, -3).forEach((l, i) => expect(f.national.flowsTo[i].reduce((a, v) => a + v, 0), `${f.prev} ${l}`).toBe(prev.lists.find((x) => x.letters === l)!.votes));
    expect(f.national.flows.flat().reduce((a, v) => a + v, 0) - f.national.flows.reduce((a, r) => a + r[f.new.length - 1], 0)).toBe(cur.valid);
  }
});

import { flowCtxFrom, flowsFor, type FlowFile } from "./voterFlow";
import { hasFlowFile } from "./flowFiles";

it("המסך: לכל מערכת עם קובץ — שמות בעברית, תוויות השנים, ואותו סכום קולות כמו בקובץ", () => {
  for (const { default: f } of Object.values(files)) {
    const c = flowCtxFrom(f as unknown as FlowFile);
    expect(hasFlowFile(c.id)).toBe(true);
    expect(c.prevLabel).not.toBe(c.curLabel);
    const { lists } = flowsFor(c);
    for (const r of [...lists.cameFrom, ...lists.wentTo]) expect(r.name, `${c.id} ${r.id}`).toMatch(/[א-ת]/);
    const total = f.national.flows.flat().reduce((a, v) => a + v, 0);
    expect(lists.cameFrom.reduce((a, r) => a + r.total, 0)).toBe(total);
  }
});

import { readFileSync } from "node:fs";
import { ballotView, leadParty, type BallotUnits } from "./ballotLookup";

it("חיפוש לפי עיר בכל מערכת קודמת: שתי השנים, שמות בעברית, והמפלגה המובילה עם מנדטיה הארציים", () => {
  for (const { default: f } of Object.values(files)) {
    const c = flowCtxFrom(f as unknown as FlowFile);
    const units = JSON.parse(readFileSync(`public/${c.unitsPath}`, "utf8")) as BallotUnits;
    const view = ballotView(units, { city: "חיפה", ballot: "", sub: "" }, c);
    expect(view.old.present && view.now.present, c.id).toBe(true);
    for (const r of view.rows) expect(r.name, `${c.id} ${r.id}`).toMatch(/[א-ת]/);
    const lead = leadParty(view, c)!;
    expect(lead.seats, `${c.id} ${lead.name}`).toBe(results.find((e) => e.id === c.id)!.lists.find((l) => l.letters === lead.id)!.seats);
  }
});

it("2009⇐2013: קובץ k19 קיים, המערכת הקודמת 2009", () => {
  const f = Object.values(files).find(({ default: x }) => x.knesset === 19)!.default;
  const c = flowCtxFrom(f as unknown as FlowFile);
  expect(f.prev).toBe(18);
  expect(c.prevLabel).toBe("2009");
  expect(c.oldName("כן")).toBe("קדימה");
});

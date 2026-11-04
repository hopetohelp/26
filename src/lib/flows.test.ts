import { expect, it } from "vitest";
import results from "../data/results.json";

// מעבר המצביעים לכל זוג מערכות עוקבות (pipeline/voter_flows.py): אף קול לא יוצא מהחשבון
const files = import.meta.glob<{ default: { knesset: number; prev: number; old: string[]; new: string[]; national: { flows: number[][]; flowsTo: number[][] } } }>("../data/flows/k*.json", { eager: true });

it("בכל זוג מערכות: עמודות המעבר = התוצאה הרשמית החדשה, שורות = הקודמת", () => {
  expect(Object.keys(files).length).toBeGreaterThanOrEqual(5);
  for (const { default: f } of Object.values(files)) {
    const cur = results.find((e) => e.knesset === f.knesset)!, prev = results.find((e) => e.knesset === f.prev)!;
    f.new.slice(0, -2).forEach((l, j) => expect(f.national.flows.reduce((a, r) => a + r[j], 0), `${f.knesset} ${l}`).toBe(cur.lists.find((x) => x.letters === l)!.votes));
    f.old.slice(0, -3).forEach((l, i) => expect(f.national.flowsTo[i].reduce((a, v) => a + v, 0), `${f.prev} ${l}`).toBe(prev.lists.find((x) => x.letters === l)!.votes));
    expect(f.national.flows.flat().reduce((a, v) => a + v, 0) - f.national.flows.reduce((a, r) => a + r[f.new.length - 1], 0)).toBe(cur.valid);
  }
});

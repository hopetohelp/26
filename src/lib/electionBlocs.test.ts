import { expect, it } from "vitest";
import blocsFile from "../../raw/blocs.json";
import { PREDECESSORS_2026, blocAssignment, predecessorBloc2026 } from "./electionBlocs";
import { K26_ID } from "./election";
import { electionData } from "./electionData";
import { groupSeatsIn, polls } from "./data";

// כלל ברזל 8, מפלגה־קודמת ב-2026: הגוש של הרשימות הממשיכות רק כשכולן באותו גוש; השדה bloc בקובץ = החישוב בקוד
const pre = (blocsFile as unknown as { elections: { "26": { predecessors: Record<string, { bloc: string | null }> } } }).elections["26"].predecessors;

it("2026: הגוש של כל מפלגה־קודמת = הרשום ב-raw/blocs.json", () => {
  for (const id of PREDECESSORS_2026) expect(predecessorBloc2026(id), id).toBe(pre[id].bloc);
  expect(predecessorBloc2026("yesh_atid")).toBe("eisenkot");
  expect(predecessorBloc2026("hadash_taal")).toBe("arab");
  expect(predecessorBloc2026("new_hope")).toBe("netanyahu");
  // המחנה הממלכתי ⇐ כחול לבן (פרשה) וישר! — לא משויך
  expect(predecessorBloc2026("national_unity")).toBeNull();
});

it("2026: כל מזהה מפלגה־קודמת מופיע בסקרים, ונכנס לגוש אחד לכל היותר", () => {
  const ids = new Set(polls.flatMap((p) => Object.keys(p.values)));
  for (const id of PREDECESSORS_2026) expect(ids.has(id), id).toBe(true);
  const b = blocAssignment(K26_ID)!;
  for (const id of PREDECESSORS_2026) expect(b.filter((x) => x.lists.includes(id)).length, id).toBe(pre[id].bloc ? 1 : 0);
  expect(electionData(K26_ID).blocs).toBe(b);
});

it("2026: סקר מלפני הגשת הרשימות — יש עתיד נספר בגוש אייזנקוט", () => {
  const p = polls.find((x) => x.values.yesh_atid && x.values.labor)!;
  const eis = blocAssignment(K26_ID)!.find((x) => x.id === "eisenkot")!;
  const sum = groupSeatsIn(p, [...eis.lists])!;
  expect(sum).toBeGreaterThanOrEqual((p.values.yesh_atid.s ?? 0) + (p.values.labor.s ?? 0));
});

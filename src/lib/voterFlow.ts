import flowFile from "../data/flow2026.json";
import { listName, results } from "./data";

/** מעבר מצביעים 2022 ⇐ 2026 לפי השוואת כל קלפי לאותה קלפי (pipeline/voter_flow.py). נקודת המקור היחידה למסך "מה השתנה". */
export const flow = flowFile as {
  asOf: string;
  old: string[]; new: string[]; flows: number[][];
  ballots: number; ballots2026: number; matchedValid: number; valid2026: number;
};

const K25 = results.find((e) => e.knesset === 25)!;
export const oldName = (letters: string) =>
  letters === "other" ? "רשימות אחרות" : letters === "abstain" ? "לא הצביעו" : K25.lists.find((l) => l.letters === letters)?.short ?? letters;
export const newName = (id: string) => (id === "other" ? "רשימות אחרות" : id === "abstain" ? "לא הצביעו" : listName(id));

export interface FlowPart { id: string; name: string; votes: number; share: number }
export interface FlowRow { id: string; name: string; total: number; parts: FlowPart[] }

const parts = (values: number[], ids: string[], name: (id: string) => string): FlowPart[] => {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  return ids.map((id, k) => ({ id, name: name(id), votes: values[k], share: (values[k] / total) * 100 })).filter((p) => p.votes > 0).sort((a, b) => b.votes - a.votes);
};

/** לכל רשימה של 2026: מאיזו רשימה של 2022 הגיעו המצביעים שלה (בקלפיות הזהות) */
export const cameFrom: FlowRow[] = flow.new.map((id, j) => {
  const col = flow.flows.map((row) => row[j]);
  return { id, name: newName(id), total: col.reduce((a, b) => a + b, 0), parts: parts(col, flow.old, oldName) };
});

/** לכל רשימה של 2022: לאן הלכו המצביעים שלה ב-2026 */
export const wentTo: FlowRow[] = flow.old.map((id, i) => ({
  id, name: oldName(id), total: flow.flows[i].reduce((a, b) => a + b, 0), parts: parts(flow.flows[i], flow.new, newName),
}));

/** חלק הקולות הכשרים שנספרו ב-2026 שנמצאים בקלפיות הזהות */
export const coverage = (flow.matchedValid / flow.valid2026) * 100;

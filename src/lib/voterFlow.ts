import flowFile from "../data/flow2026.json";
import { listName, results } from "./data";

/** מעבר מצביעים 2022 ⇐ 2026 לפי השוואת קלפיות (pipeline/voter_flow.py). נקודת המקור היחידה למסך "מה השתנה". */
export type Mode = "ballots" | "localities";
export type Tier = "sub" | "ballot" | "center" | "city";
interface ModeData { flows: number[][]; tiers: Record<Tier, { units: number; valid: number }> }
export const flow = flowFile as unknown as {
  asOf: string; old: string[]; new: string[]; letters26: Record<string, string>;
  blocs: string[]; blocOld: Record<string, string>; blocNew: Record<string, string>;
  ballots2026: number; valid2026: number; modes: Record<Mode, ModeData>;
};

const K25 = results.find((e) => e.knesset === 25)!;
const SPECIAL: Record<string, string> = { other: "רשימות אחרות", abstain: "לא הצביעו" };
export const oldName = (letters: string) => SPECIAL[letters] ?? K25.lists.find((l) => l.letters === letters)?.short ?? letters;
export const newName = (id: string) => SPECIAL[id] ?? listName(id);
/** ארבעת הגושים לפי החלוקה של הברומטר של JDN */
export const BLOC_NAMES: Record<string, string> = { right: "ימין", haredi: "חרדים", centerLeft: "מרכז-שמאל", arab: "ערבים", ...SPECIAL };

export interface FlowPart { id: string; name: string; votes: number; share: number }
export interface FlowRow { id: string; name: string; total: number; parts: FlowPart[] }

const parts = (values: number[], ids: string[], name: (id: string) => string): FlowPart[] => {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  return ids.map((id, k) => ({ id, name: name(id), votes: values[k], share: (values[k] / total) * 100 })).filter((p) => p.votes > 0).sort((a, b) => b.votes - a.votes);
};

/** מטריצה ⇐ "מאיפה הגיעו" (לכל עמודה) ו"לאן הלכו" (לכל שורה) */
function rows(m: number[][], oldIds: string[], newIds: string[], on: (id: string) => string, nn: (id: string) => string) {
  const cameFrom: FlowRow[] = newIds.map((id, j) => {
    const col = m.map((row) => row[j]);
    return { id, name: nn(id), total: col.reduce((a, b) => a + b, 0), parts: parts(col, oldIds, on) };
  });
  const wentTo: FlowRow[] = oldIds.map((id, i) => ({ id, name: on(id), total: m[i].reduce((a, b) => a + b, 0), parts: parts(m[i], newIds, nn) }));
  return { cameFrom, wentTo };
}

const blocOf = (map: Record<string, string>) => (id: string) => (id === "abstain" ? "abstain" : map[id] ?? "other");
const BLOC_IDS = [...flow.blocs, "other", "abstain"];

/** המעברים בין הרשימות ובין הגושים לפי המתג (קלפיות / יישובים) */
export function flowsFor(mode: Mode) {
  const m = flow.modes[mode].flows;
  const bo = blocOf(flow.blocOld), bn = blocOf(flow.blocNew);
  // גושים = סכום המעברים של הרשימות שבהם, מאותה מטריצה
  const blocs = BLOC_IDS.map((a) => BLOC_IDS.map((b) =>
    m.reduce((s, row, i) => (bo(flow.old[i]) === a ? s + row.reduce((t, v, j) => (bn(flow.new[j]) === b ? t + v : t), 0) : s), 0)));
  const bloc = (id: string) => BLOC_NAMES[id];
  return { lists: rows(m, flow.old, flow.new, oldName, newName), blocs: rows(blocs, BLOC_IDS, BLOC_IDS, bloc, bloc) };
}

/** חלק הקולות הכשרים שנספרו ב-2026 שנכנסו לחישוב, בכל דרגה ובסך הכול */
export function coverage(mode: Mode) {
  const t = flow.modes[mode].tiers;
  const pct = (v: number) => (v / flow.valid2026) * 100;
  return { total: pct(Object.values(t).reduce((a, x) => a + x.valid, 0)), sub: pct(t.sub.valid), ballot: pct(t.sub.valid + t.ballot.valid) };
}

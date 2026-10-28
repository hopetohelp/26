import flowFile from "../data/flow2026.json";
import { listName, results } from "./data";
import { BLOC_MEMBERS, SIMPLE_BLOCS } from "./simpleSources";

/** מעבר מצביעים 2022 ⇐ 2026 לפי השוואת קלפיות (pipeline/voter_flow.py). נקודת המקור היחידה למסך "מה השתנה". */
export type Mode = "ballots" | "localities";
export type Tier = "sub" | "ballot" | "center" | "city";
interface ModeData { flows: number[][]; tiers: Record<Tier, { units: number; valid: number }> }
export const flow = flowFile as unknown as {
  asOf: string; old: string[]; new: string[]; letters26: Record<string, string>;
  ballots2026: number; valid2026: number; modes: Record<Mode, ModeData>;
};

const K25 = results.find((e) => e.knesset === 25)!;
const SPECIAL: Record<string, string> = { other: "רשימות אחרות", abstain: "לא הצביעו" };
export const oldName = (letters: string) => SPECIAL[letters] ?? K25.lists.find((l) => l.letters === letters)?.short ?? letters;
export const newName = (id: string) => SPECIAL[id] ?? listName(id);
/** ארבעת הגושים כמו בכל האתר (SIMPLE_BLOCS: נתניהו, חרדים, ערבים, אייזנקוט; הכרעת בעלים 28.10.2026).
 * 2022: נתניהו = הליכוד, הציונות הדתית והבית היהודי (הכרעת בעלים 28.10.2026); חרדים = ש"ס ויהדות התורה; ערבים = רע"ם, חד"ש-תע"ל ובל"ד; השאר — אייזנקוט */
export const BLOC_IDS = ["netanyahu", "haredi", "arab", "eisenkot", "other", "abstain"];
export const BLOC_NAMES: Record<string, string> = { ...Object.fromEntries(SIMPLE_BLOCS.map((b) => [b.id, b.name])), ...SPECIAL };
const BLOC_2022: Record<string, string> = { "מחל": "netanyahu", "ט": "netanyahu", "ב": "netanyahu", "שס": "haredi", "ג": "haredi", "עם": "arab", "ום": "arab", "ד": "arab", "פה": "eisenkot", "כן": "eisenkot", "ל": "eisenkot", "אמת": "eisenkot", "מרצ": "eisenkot" };
export const bloc2026 = (id: string) => id === "abstain" || id === "other" ? id : (Object.keys(BLOC_MEMBERS) as (keyof typeof BLOC_MEMBERS)[]).find((k) => (BLOC_MEMBERS[k] as readonly string[]).includes(id)) ?? "eisenkot";
export const bloc2022 = (id: string) => BLOC_2022[id] ?? id;

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


/** המעברים בין הרשימות ובין הגושים לפי המתג (קלפיות / יישובים) */
export function flowsFor(mode: Mode) {
  const m = flow.modes[mode].flows;
  return { lists: rows(m, flow.old, flow.new, oldName, newName), blocs: blocsOf(m) };
}

/** המעבר בין הגושים מכל מטריצה (ארצית או של עיר) */
export function blocsOf(m: number[][]) {
  const bo = bloc2022, bn = bloc2026;
  // גושים = סכום המעברים של הרשימות שבהם, מאותה מטריצה
  const blocs = BLOC_IDS.map((a) => BLOC_IDS.map((b) =>
    m.reduce((s, row, i) => (bo(flow.old[i]) === a ? s + row.reduce((t, v, j) => (bn(flow.new[j]) === b ? t + v : t), 0) : s), 0)));
  const bloc = (id: string) => BLOC_NAMES[id];
  return rows(blocs, BLOC_IDS, BLOC_IDS, bloc, bloc);
}

/** חלק הקולות הכשרים שנספרו ב-2026 שנכנסו לחישוב, בכל דרגה ובסך הכול */
export function coverage(mode: Mode) {
  const t = flow.modes[mode].tiers;
  const pct = (v: number) => (v / flow.valid2026) * 100;
  return { total: pct(Object.values(t).reduce((a, x) => a + x.valid, 0)), sub: pct(t.sub.valid), ballot: pct(t.sub.valid + t.ballot.valid) };
}

/** שורה קצרה במסך ובתמונות השיתוף: "נתונים חלקיים X% מהמצביעים HH:MM" (הכרעת בעלים 28.10.2026) */
const countedOf = () => (flow as unknown as { counted?: { pct: number; time: string } }).counted;
/** אחוז המצביעים שנספרו (עגול) — לשורת "נתונים חלקיים" ולחלון הפודיום; null = לא ידוע */
export const countedPct = () => { const c = countedOf(); return c ? Math.round(c.pct) : null; };
export const partialLine = () => {
  const c = countedOf();
  return c ? `נתונים חלקיים ${Math.round(c.pct)}% מהמצביעים ${c.time}` : "";
};

/** "מאיפה הגיעו" בעיר — רק בעיר עם מספיק יחידות השוואה (pipeline: MIN_CITY_UNITS) */
export function cityFlows(code: string) {
  const c = (flow as unknown as { cities?: Record<string, { units: number; flows: number[][] }> }).cities?.[code];
  return c ? { units: c.units, lists: rows(c.flows, flow.old, flow.new, oldName, newName) } : null;
}

/** המטריצה של המתג, מסוכמת לפי קבוצת רשימות של 2026 (מפלגה אחת או "חרדים") ⇐ מאיפה הגיעו המצביעים שלה */
export function cameFromGroup(m: number[][], ids: string[]): FlowPart[] {
  const col = m.map((row) => row.reduce((s, v, j) => (ids.includes(flow.new[j]) ? s + v : s), 0));
  return parts(col, flow.old, oldName);
}

/** לאן הלכו ב-2026 מצביעי קבוצת רשימות של 2022 (אותיות) */
export function wentToGroup(m: number[][], letters: string[]): FlowPart[] {
  const row = flow.new.map((_, j) => m.reduce((s, r, i) => (letters.includes(flow.old[i]) ? s + r[j] : s), 0));
  return parts(row, flow.new, newName);
}

/** אחוז קטן (הכרעת בעלים 28.10.2026): מתחת ל-0.1% — לא מוצג; מתחת ל-2% — עשירית האחוז (בדיוק אחוז ⇐ "1"); אחרת — אחוז עגול */
export const smallPct = (v: number): string | null => {
  if (v < 0.1) return null;
  if (v >= 2) return String(Math.round(v));
  const r = (Math.round(v * 10) / 10).toFixed(1);
  return r.endsWith(".0") ? r.slice(0, -2) : r;
};

/** השינוי בכל הארץ לקבוצת רשימות של 2026 מול הרשימות שקדמו לה ב-2022 — באותן קלפיות שנספרו (המטריצה של המתג), כדי שהספירה החלקית לא תיראה כירידה */
export function groupChange(m: number[][], ids: string[], letters: string[]) {
  const ab = flow.new.indexOf("abstain"), abOld = flow.old.indexOf("abstain");
  const votes26 = m.reduce((s, row) => s + row.reduce((t, v, j) => (ids.includes(flow.new[j]) ? t + v : t), 0), 0);
  const valid26 = m.reduce((s, row) => s + row.reduce((t, v, j) => (j === ab ? t : t + v), 0), 0);
  const votes22 = m.reduce((s, row, i) => (letters.includes(flow.old[i]) ? s + row.reduce((t, v) => t + v, 0) : s), 0);
  const valid22 = m.reduce((s, row, i) => (i === abOld ? s : s + row.reduce((t, v) => t + v, 0)), 0);
  return { votes26, votes22: letters.length ? votes22 : null, share26: (votes26 / (valid26 || 1)) * 100, share22: letters.length ? (votes22 / (valid22 || 1)) * 100 : null };
}

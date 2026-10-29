import flowFile from "../data/flow2026.json";
import { listName, results } from "./data";
import { results2026 } from "./guessAccuracyData";
import { BLOC_MEMBERS, SIMPLE_BLOCS } from "./simpleSources";

/** מעבר מצביעים 2022 ⇐ 2026 לפי השוואת קלפיות (pipeline/voter_flow.py). נקודת המקור היחידה למסך "מה השתנה". */
export type Mode = "ballots" | "localities";
export type Tier = "sub" | "ballot" | "center" | "city";
/** flows — כל קול של 2026 לפי מקורו (סכום עמודה = הקולות שנספרו); flowsTo — כל קול של 2022 לפי יעדו (סכום שורה = התוצאה הרשמית) */
interface ModeData { flows: number[][]; flowsTo: number[][]; tiers: Record<Tier, { units: number; valid: number }> }
export const flow = flowFile as unknown as {
  asOf: string; old: string[]; new: string[]; letters26: Record<string, string>;
  ballots2026: number; valid2026: number; modes: Record<Mode, ModeData>;
};

const K25 = results.find((e) => e.knesset === 25)!;
/** "יישובים חדשים" — קולות 2026 ביישובים שלא היו בהם קלפיות ב-2022 (הכרעת בעלים 28.10.2026: אף קול לא יוצא מהמסך) */
const SPECIAL: Record<string, string> = { other: "רשימות אחרות", abstain: "לא הצביעו", new: "יישובים חדשים" };
export const oldName = (letters: string) => SPECIAL[letters] ?? K25.lists.find((l) => l.letters === letters)?.short ?? letters;
export const newName = (id: string) => SPECIAL[id] ?? listName(id);
/** ארבעת הגושים כמו בכל האתר (SIMPLE_BLOCS: נתניהו, חרדים, ערבים, אייזנקוט; הכרעת בעלים 28.10.2026).
 * 2022: נתניהו = הליכוד, הציונות הדתית והבית היהודי (הכרעת בעלים 28.10.2026); חרדים = ש"ס ויהדות התורה; ערבים = רע"ם, חד"ש-תע"ל ובל"ד; השאר — אייזנקוט */
export const BLOC_IDS = ["netanyahu", "haredi", "arab", "eisenkot", "other", "abstain", "new"];
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

/** "מאיפה הגיעו" — מעמודות `from` (קולות 2026); "לאן הלכו" — משורות `to` (קולות 2022). שורה בלי קולות לא מוצגת */
function rows(from: number[][], to: number[][], oldIds: string[], newIds: string[], on: (id: string) => string, nn: (id: string) => string) {
  const cameFrom: FlowRow[] = newIds.map((id, j) => {
    const col = from.map((row) => row[j]);
    return { id, name: nn(id), total: col.reduce((a, b) => a + b, 0), parts: parts(col, oldIds, on) };
  });
  const wentTo: FlowRow[] = oldIds.map((id, i) => ({ id, name: on(id), total: (to[i] ?? []).reduce((a, b) => a + b, 0), parts: parts(to[i] ?? [], newIds, nn) }));
  return { cameFrom: cameFrom.filter((r) => r.total > 0), wentTo: wentTo.filter((r) => r.total > 0) };
}


/** המעברים בין הרשימות ובין הגושים לפי המתג (קלפיות / יישובים) */
export function flowsFor(mode: Mode) {
  const { flows, flowsTo } = flow.modes[mode];
  return { lists: rows(flows, flowsTo, flow.old, flow.new, oldName, newName), blocs: blocsOf(flows, flowsTo) };
}

/** המעבר בין הגושים מכל מטריצה (ארצית או של עיר) */
export function blocsOf(from: number[][], to: number[][] = from) {
  const bo = bloc2022, bn = bloc2026;
  // גושים = סכום המעברים של הרשימות שבהם, מאותה מטריצה
  const sum = (m: number[][]) => BLOC_IDS.map((a) => BLOC_IDS.map((b) =>
    m.reduce((s, row, i) => (bo(flow.old[i]) === a ? s + row.reduce((t, v, j) => (bn(flow.new[j]) === b ? t + v : t), 0) : s), 0)));
  const bloc = (id: string) => BLOC_NAMES[id];
  return rows(sum(from), sum(to), BLOC_IDS, BLOC_IDS, bloc, bloc);
}

/** חלק הקולות הכשרים שנספרו ב-2026 שנכנסו לחישוב, בכל דרגה ובסך הכול */
export function coverage(mode: Mode) {
  const t = flow.modes[mode].tiers;
  const pct = (v: number) => (v / flow.valid2026) * 100;
  return { total: pct(Object.values(t).reduce((a, x) => a + x.valid, 0)), sub: pct(t.sub.valid), ballot: pct(t.sub.valid + t.ballot.valid) };
}

/** שורה קצרה במסך ובתמונות השיתוף: "נתונים חלקיים X% מהמצביעים HH:MM" (הכרעת בעלים 28.10.2026) */
const countedOf = () => (flow as unknown as { counted?: { pct: number; time: string; eligible?: number } }).counted;
/** בעלי זכות הבחירה בקלפיות שנספרו ב-2026 (המכנה של "מזכות בחירה"; pipeline/voter_flow.py, השדה counted.eligible); null = לא ידוע */
export const eligible2026 = (): number | null => countedOf()?.eligible || null;
/** אחוז המצביעים שנספרו (עגול) — לשורת "נתונים חלקיים" ולחלון הפודיום; null = לא ידוע */
export const countedPct = () => { const c = countedOf(); return c ? Math.round(c.pct) : null; };
export const partialLine = () => {
  const c = countedOf();
  return c ? `נתונים חלקיים ${Math.round(c.pct)}% מהמצביעים ${c.time}` : "";
};

/** "מאיפה הגיעו" בעיר — רק בעיר עם מספיק יחידות השוואה (pipeline: MIN_CITY_UNITS) */
export function cityFlows(code: string) {
  const c = (flow as unknown as { cities?: Record<string, { units: number; flows: number[][]; flowsTo?: number[][] }> }).cities?.[code];
  return c ? { units: c.units, lists: rows(c.flows, c.flowsTo ?? c.flows, flow.old, flow.new, oldName, newName) } : null;
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
export function groupChange(m: number[][], mTo: number[][], ids: string[], letters: string[]) {
  const ab = flow.new.indexOf("abstain"), abOld = flow.old.indexOf("abstain"), nw = flow.old.indexOf("new");
  const votes26 = m.reduce((s, row) => s + row.reduce((t, v, j) => (ids.includes(flow.new[j]) ? t + v : t), 0), 0);
  const valid26 = m.reduce((s, row) => s + row.reduce((t, v, j) => (j === ab ? t : t + v), 0), 0);
  const votes22 = mTo.reduce((s, row, i) => (letters.includes(flow.old[i]) ? s + row.reduce((t, v) => t + v, 0) : s), 0);
  const valid22 = mTo.reduce((s, row, i) => (i === abOld || i === nw ? s : s + row.reduce((t, v) => t + v, 0)), 0);
  return { votes26, votes22: letters.length ? votes22 : null, share26: (votes26 / (valid26 || 1)) * 100, share22: letters.length ? (votes22 / (valid22 || 1)) * 100 : null };
}

/** אותה מפלגה בשתי הבחירות (אותה רשימה ואותן אותיות): מזהה 2026 ⇐ אותיות 2022 */
export const SAME: Record<string, string> = { likud: "מחל", democrats: "אמת", utj: "ג", yb: "ל", shas: "שס", rzp: "ט", raam: "עם" };
/**
 * ארבעת הפרמטרים של מפלגה לכל שנה — מקור אחד לכרטיסי המסך ולתמונות השיתוף (הכרעת בעלים 29.10.2026):
 * מצביעים (קולות), מנדטים, "מזכות בחירה" (מבעלי זכות הבחירה) ו"מהכשרים" (מהקולות הכשרים — כך מודדת ועדת הבחירות).
 * 2022: בעלי הזכות והכשרים מהתוצאות הרשמיות; 2026: הכשרים = סכום קולות הרשימות שנספרו, בעלי הזכות בקלפיות שנספרו (pipeline/voter_flow.py).
 */
export interface YearNumbers { votes: number; seats: number; ofEligible: number | null; ofValid: number }
export function partyYears(id26: string | null, letters22: string | null): { y2022: YearNumbers | null; y2026: YearNumbers | null } {
  const { y2022, y2026 } = partyNumbers(id26, letters22);
  const valid22 = K25.lists.reduce((sum, l) => sum + l.votes, 0), valid26 = Object.values(results2026.votes ?? {}).reduce((sum, v) => sum + v, 0), el26 = eligible2026();
  return {
    y2022: y2022 ? { ...y2022, ofEligible: K25.eligible ? (y2022.votes / K25.eligible) * 100 : null, ofValid: (y2022.votes / valid22) * 100 } : null,
    y2026: y2026 && valid26 ? { ...y2026, ofEligible: el26 ? (y2026.votes / el26) * 100 : null, ofValid: (y2026.votes / valid26) * 100 } : null,
  };
}

/** ארבעת הפרמטרים של גוש לכל שנה (הכרעת בעלים 29.10.2026): סכום הרשימות שבגוש — 2026 לפי BLOC_MEMBERS, 2022 לפי שיוך הגושים של 2022 */
export function blocYears(bloc: string): { y2022: YearNumbers | null; y2026: YearNumbers | null } {
  const ids = Object.keys(results2026.votes ?? {}).filter((id) => bloc2026(id) === bloc);
  const lists22 = K25.lists.filter((l) => BLOC_2022[l.letters] === bloc);
  const valid22 = K25.lists.reduce((sum, l) => sum + l.votes, 0), valid26 = Object.values(results2026.votes ?? {}).reduce((sum, v) => sum + v, 0), el26 = eligible2026();
  const v22 = lists22.reduce((s, l) => s + l.votes, 0), s22 = lists22.reduce((s, l) => s + l.seats, 0);
  const v26 = ids.reduce((s, id) => s + (results2026.votes?.[id] ?? 0), 0), s26 = ids.reduce((s, id) => s + (results2026.seats?.[id] ?? 0), 0);
  return {
    y2022: lists22.length ? { votes: v22, seats: s22, ofEligible: K25.eligible ? (v22 / K25.eligible) * 100 : null, ofValid: (v22 / valid22) * 100 } : null,
    y2026: ids.length && valid26 ? { votes: v26, seats: s26, ofEligible: el26 ? (v26 / el26) * 100 : null, ofValid: (v26 / valid26) * 100 } : null,
  };
}

/** הקולות והמנדטים הרשמיים של מפלגה (הכרעת בעלים 28.10.2026): 2026 — raw/results-2026.json (קובץ ועדת הבחירות, המנדטים לפי מנוע החוק); 2022 — התוצאות הרשמיות (results.json). null — לא רצה באותן בחירות */
export function partyNumbers(id26: string | null, letters22: string | null) {
  const l22 = letters22 ? K25.lists.find((l) => l.letters === letters22) : undefined;
  const v26 = id26 ? results2026.votes?.[id26] : undefined;
  return {
    y2022: l22 ? { votes: l22.votes, seats: l22.seats } : null,
    y2026: id26 && v26 !== undefined ? { votes: v26, seats: results2026.seats?.[id26] ?? 0 } : null,
  };
}

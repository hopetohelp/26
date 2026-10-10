/**
 * שיוך רשימות 2026 לרשימות 2022 — מקור אחד ל"מה השתנה – מפלגות", לטור "בחירות 22" ולהתחלה "מבחירות 22"
 * (הכרעת בעלים 10.10.2026, docs/מנדטים-אחוזים-ומה-השתנה-תוכנית.md).
 *
 * לכל רשימה של היום — מאילו רשימות 2022 היא באה. רשימת 2022 שכמה רשימות של היום באות ממנה (פיצול) מתחלקת ביניהן
 * לפי משקל: ממוצע הסקרים (ברירת מחדל), ממוצע המשתתפים, או חלוקה ידנית. שלוש קטגוריות:
 * ודאי — רשימה זהה או איחוד; חלקי — לפחות רשימת 2022 אחת מתחלקת; אין שיוך — רשימה חדשה.
 */
import modelFile from "../data/model.json";
import { lists2026, results } from "./data";
import { POLL_AVERAGE } from "./sources";
import { largestRemainder, MIN_PASSING } from "./fillAll";

export type Split = "polls" | "crowd" | "manual";
export interface Lineage {
  /** רשימה של היום ⇐ אותיות רשימות 2022 שממנה באה ([] = אין שיוך) */
  map: Record<string, string[]>;
  split: Split;
  /** חלוקה ידנית: רשימת 2022 ⇐ אחוז לכל רשימה של היום שבאה ממנה (סכום 100) */
  manual: Record<string, Record<string, number>>;
}
export type Category = "certain" | "partial" | "none";
export interface LineageRow {
  id: string;
  category: Category;
  /** אותיות רשימות 2022 */
  from: string[];
  /** החלק (0–1) שהרשימה מקבלת מכל רשימת 2022 שממנה באה */
  part: Record<string, number>;
  votes2022: number;
  share2022: number;
  /** בשיוך חלקי — שבר עשרוני */
  seats2022: number;
  shareNow: number;
  seatsNow: number;
}

interface Model { central: { seats: Record<string, number>; shares: Record<string, number> }; changes: { alternatives: { id: string; families: { k25: string[]; k26: string[] }[] }[] } }
const m = modelFile as unknown as Model;
const k25 = results.find((r) => r.knesset === 25)!;
export const VALID_2022 = k25.valid;

export interface K25List { id: string; name: string; votes: number; seats: number; share: number }
/** רשימות 2022 שקיבלו לפחות 1% — אפשרויות השיוך. השאר נספרות יחד כ"רשימות קטנות". */
export const K25_LISTS: K25List[] = k25.lists
  .map((l) => ({ id: l.letters, name: l.short, votes: l.votes, seats: l.seats, share: (l.votes / k25.valid) * 100 }))
  .filter((l) => l.share >= 1);
const K25_BY_NAME = Object.fromEntries(K25_LISTS.map((l) => [l.name, l.id]));
const K25_BY_ID = Object.fromEntries(K25_LISTS.map((l) => [l.id, l]));
export const k25ListName = (id: string) => K25_BY_ID[id]?.name ?? id;

export const IDS_NOW = lists2026.map((l) => l.id);

/**
 * ברירת המחדל — מ-raw/lineage.json (חלופת "לפי המחנה": המחנה הממלכתי ⇐ כחול לבן וישר!),
 * ונעם עם הציונות הדתית ועוצמה יהודית — שלושתן התמודדו ב-2022 ברשימה אחת.
 */
function defaultMap(): Record<string, string[]> {
  const map: Record<string, string[]> = Object.fromEntries(IDS_NOW.map((id) => [id, []]));
  const camp = m.changes.alternatives.find((a) => a.id === "camp")!;
  for (const f of camp.families) for (const id of f.k26) if (id in map) map[id] = f.k25.map((n) => K25_BY_NAME[n]).filter(Boolean);
  if ("noam" in map && map.rzp?.length) map.noam = [...map.rzp];
  return map;
}
export const DEFAULT_LINEAGE: Lineage = { map: defaultMap(), split: "polls", manual: {} };

const round1 = (x: number) => Math.round(x * 10) / 10;

/** ניקוי שיוך שמור (בחשבון או בדפדפן): מזהים לא מוכרים נזרקים, רשימה חסרה מקבלת את ברירת המחדל. */
export function cleanLineage(saved: unknown): Lineage | null {
  if (!saved || typeof saved !== "object") return null;
  const s = saved as Partial<Lineage>;
  if (!s.map || typeof s.map !== "object") return null;
  const map = { ...DEFAULT_LINEAGE.map };
  for (const [id, v] of Object.entries(s.map)) if (id in map && Array.isArray(v)) map[id] = [...new Set(v.filter((x) => typeof x === "string" && x in K25_BY_ID))];
  const split: Split = s.split === "crowd" || s.split === "manual" ? s.split : "polls";
  const manual: Lineage["manual"] = {};
  for (const [l, parts] of Object.entries(s.manual ?? {})) {
    if (!(l in K25_BY_ID) || !parts || typeof parts !== "object") continue;
    manual[l] = Object.fromEntries(Object.entries(parts).filter(([id, x]) => id in map && Number.isFinite(x) && x >= 0 && x <= 100).map(([id, x]) => [id, round1(x)]));
  }
  return { map, split, manual };
}

/** רשימת 2022 ⇐ הרשימות של היום שבאות ממנה */
export function heirs(lin: Lineage): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of IDS_NOW) for (const l of lin.map[id] ?? []) (out[l] ??= []).push(id);
  return out;
}

/** רשימות 2022 שמתחלקות (פיצול) */
export const sharedLists = (lin: Lineage) => Object.entries(heirs(lin)).filter(([, ids]) => ids.length > 1).map(([l]) => l);

/** בעיה בחלוקה הידנית — הסבר קצר, או null */
export function lineageProblem(lin: Lineage): string | null {
  if (lin.split !== "manual") return null;
  for (const l of sharedLists(lin)) {
    const ids = heirs(lin)[l];
    const sum = ids.reduce((t, id) => t + (lin.manual[l]?.[id] ?? 0), 0);
    if (Math.abs(sum - 100) > 0.05) return `בחלוקה הידנית של ${k25ListName(l)} הסכום הוא ${round1(sum)}%, ולא 100%. תקנו את האחוזים כך שיסתכמו ב-100.`;
  }
  return null;
}

/** מעבר לחלוקה ידנית: נקודת המוצא היא החלוקה הנוכחית, מעוגלת לעשירית אחוז ומתוקנת כך שכל רשימת 2022 מסתכמת ב-100. */
export function manualFromCurrent(lin: Lineage, crowd: Record<string, number> | null = null): Lineage["manual"] {
  const p = parts(lin, crowd);
  const out: Lineage["manual"] = {};
  for (const l of sharedLists(lin)) {
    const ids = heirs(lin)[l];
    const vals = ids.map((id) => round1(p[id][l] * 100));
    vals[vals.length - 1] = round1(100 - vals.slice(0, -1).reduce((a, b) => a + b, 0));
    out[l] = Object.fromEntries(ids.map((id, i) => [id, vals[i]]));
  }
  return out;
}

/** החלק של כל רשימה של היום מכל רשימת 2022. משקל 0 לכולן ⇐ חלוקה שווה. */
function parts(lin: Lineage, crowd: Record<string, number> | null): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = Object.fromEntries(IDS_NOW.map((id) => [id, {}]));
  for (const [l, ids] of Object.entries(heirs(lin))) {
    const weight = (id: string) =>
      ids.length === 1 ? 1
      : lin.split === "manual" ? lin.manual[l]?.[id] ?? 0
      : lin.split === "crowd" && crowd ? crowd[id] ?? 0
      : POLL_AVERAGE.shares[id] ?? 0;
    const total = ids.reduce((t, id) => t + weight(id), 0);
    for (const id of ids) out[id][l] = total > 0 ? weight(id) / total : 1 / ids.length;
  }
  return out;
}

/**
 * שורה לכל רשימה של היום, ומה שלא שויך מ-2022.
 * crowd — ממוצע המנדטים של המשתתפים לכל רשימה (לחלוקה "לפי המשתתפים"); בלעדיו — לפי הסקרים.
 */
export function lineageRows(lin: Lineage, crowd: Record<string, number> | null = null) {
  const p = parts(lin, crowd);
  const shared = new Set(sharedLists(lin));
  const rows: LineageRow[] = IDS_NOW.map((id) => {
    const from = (lin.map[id] ?? []).filter((l) => l in K25_BY_ID);
    const votes = from.reduce((t, l) => t + K25_BY_ID[l].votes * p[id][l], 0);
    return {
      id,
      category: !from.length ? "none" : from.some((l) => shared.has(l)) ? "partial" : "certain",
      from,
      part: p[id],
      votes2022: votes,
      share2022: (votes / VALID_2022) * 100,
      seats2022: from.reduce((t, l) => t + K25_BY_ID[l].seats * p[id][l], 0),
      shareNow: POLL_AVERAGE.shares[id] ?? 0,
      seatsNow: POLL_AVERAGE.seats[id] ?? 0,
    };
  });
  const used = new Set(Object.keys(heirs(lin)));
  const lists = K25_LISTS.filter((l) => !used.has(l.id));
  const small = k25.lists.filter((l) => !(l.letters in K25_BY_ID));
  const unassigned2022 = {
    lists: lists.map((l) => l.id),
    others: small.length,
    share: ((lists.reduce((t, l) => t + l.votes, 0) + small.reduce((t, l) => t + l.votes, 0)) / VALID_2022) * 100,
  };
  return { rows, unassigned2022 };
}

/** מנדטי 2022 לפי השיוך — לטור "בחירות 22" ולגושים. רשימה בלי שיוך — חסרה (undefined). */
export function seats2022ByList(lin: Lineage, crowd: Record<string, number> | null = null): Record<string, number | undefined> {
  return Object.fromEntries(lineageRows(lin, crowd).rows.map((r) => [r.id, r.category === "none" ? undefined : r.seats2022]));
}
export function share2022ByList(lin: Lineage, crowd: Record<string, number> | null = null): Record<string, number | undefined> {
  return Object.fromEntries(lineageRows(lin, crowd).rows.map((r) => [r.id, r.category === "none" ? undefined : r.share2022]));
}

export const sameLineage = (a: Lineage, b: Lineage) => JSON.stringify(cleanLineage(a)) === JSON.stringify(cleanLineage(b));

/**
 * נקודת הפתיחה "מבחירות 22" בהשערה: מנדטי 2022 לפי השיוך, בשלמים (שארית גדולה).
 * סכום 120 מלכתחילה, בלי 1–3 מנדטים: רשימה שיוצאת מתחת לסף מקבלת 0, והחלוקה מחושבת מחדש בין השאר.
 * שיוך ודאי — נעול (זו התוצאה עצמה); שיוך חלקי — פתוח (הערכה); אין שיוך ⇐ 0.
 */
export function start2022(lin: Lineage, crowd: Record<string, number> | null = null): Record<string, { v: number; locked: boolean }> {
  const { rows } = lineageRows(lin, crowd);
  const total = Math.round(rows.reduce((t, r) => t + r.seats2022, 0));
  // מלכתחילה בלי יתרה: רשימה שיוצאת 1–3 מנדטים מקבלת 0, והחלוקה מחושבת מחדש בין השאר — עד שכולן 0 או לפחות 4
  // שיוך ודאי — בדיוק התוצאה (שלמים); רק רשימות מפיצול מתחלקות ביתרה
  const fixed = rows.filter((r) => r.category === "certain");
  const fixedSum = fixed.reduce((t, r) => t + Math.round(r.seats2022), 0);
  const weights = Object.fromEntries(rows.filter((r) => r.category === "partial").map((r) => [r.id, r.seats2022]));
  const split = () => ({ ...Object.fromEntries(fixed.map((r) => [r.id, Math.round(r.seats2022)])), ...largestRemainder(total - fixedSum, weights) });
  let seats: Record<string, number> = split();
  for (let guard = 0; guard < rows.length; guard++) {
    const small = Object.keys(weights).filter((id) => seats[id] > 0 && seats[id] < MIN_PASSING).sort((x, y) => weights[x] - weights[y])[0];
    if (!small) break;
    weights[small] = 0;
    seats = split();
  }
  return Object.fromEntries(rows.map((r) => [r.id, { v: seats[r.id] ?? 0, locked: r.category === "certain" && (seats[r.id] ?? 0) > 0 }]));
}

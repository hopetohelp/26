import results2026 from "../../../raw/results-2026.json";
import type { Cell, Dashboard } from "../../lib/crowdApi";
import { registry, results } from "../../lib/data";
import { previousTurnout } from "../../lib/guessAccuracyData";
import { IDS, VOTE_MAP, k25VoteName, nameOf, V2022_LABEL, V2026_LABEL } from "./model";
const percent = (cells: Record<string, Cell> | undefined, key: string): number | null => {
  if (!cells || !Object.values(cells).some(c => c.of > 0)) return null;
  const c = cells[key];
  return c?.hidden ? null : c ? c.n / c.of * 100 : 0;
};
/** כמה משתתפים ענו כך (מספר), באותם כללים של `percent` */
const count = (cells: Record<string, Cell> | undefined, key: string): number | null => {
  if (!cells || !Object.values(cells).some(c => c.of > 0)) return null;
  const c = cells[key];
  return c?.hidden ? null : c?.n ?? 0;
};
/** שורות למי שלא הצביע (הכרעת בעלים 9.10.2026): לא הצביעו בעבר / לא מתכננים להצביע, ומי שלא הייתה לו זכות הצבעה. נוסח בגוף שלישי, בניגוד לתשובות בשאלון. */
const NON_VOTER_NAME: Record<string, string> = { none: "לא הצביעו / לא מתכננים להצביע", ineligible: "לא הייתה זכות הצבעה" };
const answerCount = (d: Dashboard, key: string) => (d.vote2022?.all[key]?.n ?? 0) + (d.vote2026?.all[key]?.n ?? 0);
/**
 * blank = רשימת מפלגות להצגה כשאין נתוני קבוצה (קבוצה מתחת לסף, הכרעת בעלים 12.10.2026): שורה לכל אחת, ובטורי המשתתפים 0.
 * מפלגה שלא התמודדה ב-2022 נשארת "—" בטור הבחירות הקודמות.
 */
/** אחוז הקולות של כל רשימה בתוצאות האמת 2026 (raw/results-2026.json); null — עדיין אין תוצאות */
const ACTUAL_PCT = (results2026 as { pct?: Record<string, number> }).pct ?? {};
export const HAS_ACTUAL_PCT = Object.keys(ACTUAL_PCT).length > 0;

export function votingRows(d: Dashboard, blank?: string[]) {
  const previous = results.find(r => r.id === "k25")!;
  const matched = new Set(Object.values(VOTE_MAP));
  const rows = IDS.map(id => {
    const old = previous.lists.find(l => l.letters === VOTE_MAP[id]);
    return { key: id, name: nameOf(id), actual: (ACTUAL_PCT[id] ?? (HAS_ACTUAL_PCT ? 0 : null)) as number | null, official: old ? Math.round(old.votes / previous.valid * 10000) / 100 : null, previous: old ? percent(d.vote2022?.all, old.letters) : null, next: percent(d.vote2026?.all, id), previousN: old ? count(d.vote2022?.all, old.letters) : null, nextN: count(d.vote2026?.all, id) };
  });
  for (const l of previous.lists) if (!matched.has(l.letters)) rows.push({ key: `2022:${l.letters}`, name: `${k25VoteName(l.letters)} (2022)`, actual: null, official: Math.round(l.votes / previous.valid * 10000) / 100, previous: percent(d.vote2022?.all, l.letters), next: null, previousN: count(d.vote2022?.all, l.letters), nextN: null });
  const keys = new Set([...Object.keys(d.vote2022?.all ?? {}).filter(k => k in V2022_LABEL), ...Object.keys(d.vote2026?.all ?? {}).filter(k => k in V2026_LABEL)]);
  for (const key of Object.keys(NON_VOTER_NAME)) if (keys.has(key)) rows.push({ key: `answer:${key}`, name: NON_VOTER_NAME[key] ?? V2022_LABEL[key] ?? V2026_LABEL[key], actual: null, official: null, previous: key in V2022_LABEL ? percent(d.vote2022?.all,key) : null, next: key in V2026_LABEL ? percent(d.vote2026?.all,key) : null, previousN: key in V2022_LABEL ? count(d.vote2022?.all,key) : null, nextN: key in V2026_LABEL ? count(d.vote2026?.all,key) : null });
  if (blank) return rows.filter(r => blank.includes(r.key)).map(r => ({ ...r, previous: r.official === null ? null : 0, previousN: r.official === null ? null : 0, next: 0, nextN: 0 }));
  return rows.filter(row => {
    if (row.key.startsWith("answer:")) return row.key.slice(7) in NON_VOTER_NAME && answerCount(d, row.key.slice(7)) > 0;
    const old = row.key.startsWith("2022:") ? row.key.slice(5) : VOTE_MAP[row.key];
    return (old && (d.vote2022?.all[old]?.n ?? 0) > 0) || (d.vote2026?.all[row.key]?.n ?? 0) > 0;
  }).sort((a, b) => (b.nextN ?? -Infinity) - (a.nextN ?? -Infinity));
}

/**
 * ליד כל מפלגה בתוצאות סקרי ההצבעה: כמה מהמשתתפים היו מצביעים לה לפי התוצאה האמיתית (הכרעת בעלים 03.11.2026) —
 * אותו חישוב כמו טור "כלל המצביעים" בטבלת ההתפלגות: אחוז הקולות × מספר המשתתפים בסקר.
 */
export const REAL_SHARE_SURVEYS: Record<string, "2022" | "2026"> = { vote2022: "2022", plan2026: "2026", vote: "2026" };
/** בטור האחרון: אחוז הרשימה ואחוז מי שלא הצביע — שניהם מתוך בעלי זכות הבחירה (הכרעת בעלים 03.11.2026) */
export const NOT_VOTED = "none";
export function realPct(year: "2022" | "2026", option: string): number | null {
  if (option === NOT_VOTED) {
    if (year === "2022") { const t = previousTurnout(); return t === null ? null : Math.round((100 - t) * 10) / 10; }
    // ב-2026: הקולות שנספרו מתוך כלל בעלי זכות הבחירה (raw/results-2026.json, counted)
    const c = (results2026 as { counted?: number | null }).counted;
    return typeof c === "number" ? Math.round((100 - c) * 10) / 10 : null;
  }
  // שני הנתונים מתוך בעלי זכות הבחירה (הכרעת בעלים 03.11.2026)
  if (year === "2026") { const v = (results2026 as { votes?: Record<string, number> }).votes?.[option]; return typeof v === "number" ? v / registry.k26.eligible * 100 : null; }
  const previous = results.find(r => r.id === "k25")!;
  const l = previous.lists.find(x => x.letters === option);
  return l ? l.votes / previous.eligible * 100 : null;
}
export const realLabel = (year: "2022" | "2026", option: string) => {
  const p = realPct(year, option);
  return p === null ? "" : `${(Math.round(p * 10) / 10).toLocaleString("he-IL")}%`;
};

/** רשימות שקיבלו עד 5 קולות מהמשתתפים (בשני הטורים) ⇐ שורה אחת "רשימות אחרות" בסוף רשימות המפלגות (הכרעת בעלים 03.11.2026) */
export const SMALL_VOTES = 5;
type Row = ReturnType<typeof votingRows>[number];
export function groupSmallRows(rows: Row[]): Row[] {
  const small = rows.filter(r => !r.key.startsWith("answer:") && (r.previousN ?? 0) <= SMALL_VOTES && (r.nextN ?? 0) <= SMALL_VOTES);
  if (small.length < 2) return rows;
  const sum = (k: "actual" | "official" | "previous" | "next" | "previousN" | "nextN") => small.some(r => r[k] !== null) ? small.reduce((a, r) => a + (r[k] ?? 0), 0) : null;
  const round = (v: number | null) => v === null ? null : Math.round(v * 100) / 100;
  const other: Row = { key: "small", name: "רשימות אחרות", actual: round(sum("actual")), official: round(sum("official")), previous: sum("previous"), next: sum("next"), previousN: sum("previousN"), nextN: sum("nextN") };
  const rest = rows.filter(r => !small.includes(r)), at = rest.findIndex(r => r.key.startsWith("answer:"));
  return at < 0 ? [...rest, other] : [...rest.slice(0, at), other, ...rest.slice(at)];
}

/** אותו איחוד בטבלת המעבר (הכרעת בעלים 03.11.2026): שורות (2022) וטורים (2026) של רשימות עם עד 5 קולות ⇐ "רשימות אחרות"; תא מוסתר נשאר מוסתר אם כל מרכיביו מוסתרים */
export const SMALL_KEY = "small";
type M = NonNullable<Dashboard["matrix"]>;
const PARTY_2022 = (k: string) => !(k in V2022_LABEL), PARTY_2026 = (k: string) => !(k in V2026_LABEL);
/** "רשימות אחרות" אחרי המפלגות ולפני מי שלא הצביע */
export const smallLast = (a: string, b: string) => {
  const rank = (k: string) => k === SMALL_KEY ? 1 : (k in V2022_LABEL || k in V2026_LABEL) ? 2 : 0;
  return rank(a) - rank(b);
};
export function groupSmallMatrix(m: M, rowTotal: (k: string, n: number) => number, colTotal: (c: string) => number): M {
  const smallRows = Object.entries(m.rows).filter(([k, r]) => PARTY_2022(k) && rowTotal(k, r.n) <= SMALL_VOTES).map(([k]) => k);
  const allCols = [...new Set(Object.values(m.rows).flatMap(r => Object.keys(r.cells)))];
  const smallCols = new Set(allCols.filter(c => PARTY_2026(c) && colTotal(c) <= SMALL_VOTES));
  const useCols = smallCols.size >= 2, useRows = smallRows.length >= 2;
  const merge = (cells: Cell[]): Cell & { hidden?: boolean } => {
    const shown = cells.filter(c => !c.hidden);
    return { ...cells[0], n: shown.reduce((a, c) => a + c.n, 0), hidden: shown.length === 0 };
  };
  const foldCols = (cells: Record<string, Cell>) => {
    if (!useCols) return cells;
    const out: Record<string, Cell> = {}, small: Cell[] = [];
    for (const [c, cell] of Object.entries(cells)) (smallCols.has(c) ? small.push(cell) : (out[c] = cell));
    if (small.length) out[SMALL_KEY] = merge(small);
    return out;
  };
  const rows: M["rows"] = {};
  for (const [k, r] of Object.entries(m.rows)) if (!useRows || !smallRows.includes(k)) rows[k] = { ...r, cells: foldCols(r.cells) };
  if (useRows) {
    const parts = smallRows.map(k => m.rows[k]), n = parts.reduce((a, r) => a + r.n, 0);
    const cols = new Set(parts.flatMap(r => Object.keys(r.cells)));
    const cells: Record<string, Cell> = {};
    for (const c of cols) { const list = parts.map(r => r.cells[c]).filter(Boolean); if (list.length) cells[c] = { ...merge(list), of: n }; }
    rows[SMALL_KEY] = { n, hidden: parts.every(r => r.hidden), cells: foldCols(cells) };
  }
  return { ...m, rows };
}

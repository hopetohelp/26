/**
 * דיוק הניחושים והסקרים מול תוצאות האמת (docs/תוכנית-דיוק-הניחושים-27-10-2026.md) — פונקציות טהורות בלבד.
 * מקור אחד למסך "דיוק הניחושים", לשיתוף ולסרטון: המרחק, הדיוק מול הגולשים, מול הסקרים, השקלול והממוצע הקרוב ביותר.
 */
export type Seats = Record<string, number>;

/** רשימה שלא עברה את אחוז החסימה נמדדת מול 4 מנדטים (המינימום לרשימה שעוברת), כדי לא לחלק באפס */
export const MIN_BASE = 4;
export const TOTAL = 120;
/** רשימה נכללת בטבלה אם עברה בפועל, או שממוצע הסקרים נתן לה לפחות כך */
export const ROW_MIN_POLL_MEAN = 2;

const val = (s: Seats, id: string) => s[id] ?? 0;

/** המרחק במנדטים, ובאחוזים ממספר המנדטים בפועל */
export function distance(guess: number, actual: number): { seats: number; pct: number } {
  const seats = Math.abs(guess - actual);
  return { seats, pct: (seats / Math.max(actual, MIN_BASE)) * 100 };
}

/** חלק המנחשים שהיו רחוקים יותר מ-err (שוויון = חצי). errs: מרחקים של כל האחרים. בלי אחרים ⇐ null */
export function shareFarther(err: number, errs: number[]): number | null {
  if (!errs.length) return null;
  let farther = 0;
  for (const e of errs) farther += e > err ? 1 : e === err ? 0.5 : 0;
  return farther / errs.length;
}

/** אותו חישוב מהתפלגות: hist[k] = כמה ניחשו k מנדטים */
export function shareFartherHist(err: number, hist: number[], actual: number): number | null {
  let n = 0, farther = 0;
  hist.forEach((c, k) => {
    if (!c) return;
    const e = Math.abs(k - actual);
    n += c;
    farther += e > err ? c : e === err ? c / 2 : 0;
  });
  return n ? farther / n : null;
}

/** ממוצע של ערכים קיימים בלבד */
const avg = (xs: (number | null)[]) => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
};

export function meanSeats(list: Seats[], ids: string[]): Seats {
  return Object.fromEntries(ids.map(id => [id, list.length ? list.reduce((a, s) => a + val(s, id), 0) / list.length : 0]));
}

/** הרשימות בטבלה: עברו בפועל, או שממוצע הסקרים נתן להן לפחות ROW_MIN_POLL_MEAN; מסודרות לפי האמת */
export function accuracyRows(actual: Seats, pollMean: Seats): string[] {
  const ids = new Set([...Object.keys(actual), ...Object.keys(pollMean)]);
  return [...ids].filter(id => val(actual, id) > 0 || val(pollMean, id) >= ROW_MIN_POLL_MEAN)
    .sort((a, b) => val(actual, b) - val(actual, a) || val(pollMean, b) - val(pollMean, a));
}

export interface AccuracyRow {
  id: string;
  actual: number;
  guess: number;
  seats: number;
  pct: number;
  /** חלק הניחושים שהיו רחוקים יותר (0–1) */
  vsCrowd: number | null;
  /** חלק הסקרים שהיו מדויקים יותר (0–1) — כפי שמוצג בטור */
  pollsCloser: number | null;
  /** שקלול 0–1: ממוצע שווה של הדיוק מול הגולשים ומול הסקרים (הסקרים: החלק שהיו רחוקים יותר) */
  score: number | null;
}
export interface AccuracyTable { rows: AccuracyRow[]; total: { seats: number; vsCrowd: number | null; pollsCloser: number | null; score: number | null } }

/**
 * הטבלה לנושא אחד (ניחוש, ממוצע ניחושים, סקר או ממוצע סקרים).
 * hist: התפלגות הניחושים לכל רשימה; polls: הסקר האחרון של כל מכון. נושא שהוא עצמו אחד הסקרים — exclude מוציא אותו מההשוואה.
 */
export function accuracyTable({ subject, actual, ids, hist, polls, exclude }: {
  subject: Seats; actual: Seats; ids: string[]; hist: Record<string, number[]> | null; polls: Seats[]; exclude?: number;
}): AccuracyTable {
  const others = polls.filter((_, i) => i !== exclude);
  const rows = ids.map((id): AccuracyRow => {
    const a = val(actual, id), g = val(subject, id), d = distance(g, a);
    const vsCrowd = hist?.[id] ? shareFartherHist(d.seats, hist[id], a) : null;
    const pollFarther = shareFarther(d.seats, others.map(p => Math.abs(val(p, id) - a)));
    const pollsCloser = pollFarther === null ? null : others.filter(p => Math.abs(val(p, id) - a) < d.seats).length / others.length;
    return { id, actual: a, guess: g, ...d, vsCrowd, pollsCloser, score: avg([vsCrowd, pollFarther]) };
  });
  return {
    rows,
    total: {
      seats: rows.reduce((s, r) => s + r.seats, 0),
      vsCrowd: avg(rows.map(r => r.vsCrowd)),
      pollsCloser: avg(rows.map(r => r.pollsCloser)),
      score: avg(rows.map(r => r.score)),
    },
  };
}

/** אחוז דיוק לשיתוף: 100 × (1 − מנדטים שהונחו במקום הלא נכון / 120); במקום הלא נכון = חצי מסכום המרחקים על כל הרשימות */
export function accuracyPct(values: Seats, actual: Seats): number {
  const ids = new Set([...Object.keys(values), ...Object.keys(actual)]);
  let sum = 0;
  for (const id of ids) sum += Math.abs(val(values, id) - val(actual, id));
  return Math.max(0, 100 * (1 - sum / 2 / TOTAL));
}

/** טעות יחסית ממוצעת (כל רשימה במשקל שווה) — הקריטריון לממוצע הקרוב ביותר */
export function relativeError(values: Seats, actual: Seats, ids: string[]): number {
  return ids.reduce((s, id) => s + distance(val(values, id), val(actual, id)).pct, 0) / (ids.length || 1);
}

/**
 * איזה צירוף מכונים (הסקר האחרון של כל אחד, משקל שווה) נותן ממוצע הכי קרוב לאמת.
 * בודק את כל הצירופים הלא ריקים; מעל 16 מכונים — רק עד 16 הראשונים (2^16 צירופים).
 */
export function bestCombination(polls: { key: string; values: Seats }[], actual: Seats, ids: string[]) {
  const ps = polls.slice(0, 16);
  let best: { keys: string[]; mean: Seats; error: number } | null = null;
  for (let mask = 1; mask < 1 << ps.length; mask++) {
    const pick = ps.filter((_, i) => mask & (1 << i));
    const mean = meanSeats(pick.map(p => p.values), ids);
    const error = relativeError(mean, actual, ids);
    if (!best || error < best.error - 1e-9 || (Math.abs(error - best.error) < 1e-9 && pick.length > best.keys.length)) best = { keys: pick.map(p => p.key), mean, error };
  }
  return best;
}

/** הרשימה שבה הפער בין ערכים לאמת הכי גדול (בערך מוחלט, במנדטים) */
export function biggestGap(values: Seats, actual: Seats, ids: string[]) {
  let out: { id: string; gap: number } | null = null;
  for (const id of ids) {
    const gap = val(values, id) - val(actual, id);
    if (!out || Math.abs(gap) > Math.abs(out.gap)) out = { id, gap };
  }
  return out;
}

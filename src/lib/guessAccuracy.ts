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

export function meanSeats(list: Seats[], ids: string[]): Seats {
  return Object.fromEntries(ids.map(id => [id, list.length ? list.reduce((a, s) => a + val(s, id), 0) / list.length : 0]));
}

/** חציון לכל רשימה; ערך שחסר ברשומה (סקר שלא פרסם נתון) — אינו נכלל בה */
export function medianSeats(list: Seats[], ids: string[]): Seats {
  return Object.fromEntries(ids.map(id => {
    const xs = list.filter(s => id in s).map(s => s[id]).sort((a, b) => a - b), n = xs.length;
    return [id, !n ? 0 : n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2];
  }));
}

/** הרשימות בטבלה: עברו בפועל, או שממוצע הסקרים נתן להן לפחות ROW_MIN_POLL_MEAN; מסודרות לפי האמת */
export function accuracyRows(actual: Seats, pollMean: Seats): string[] {
  const ids = new Set([...Object.keys(actual), ...Object.keys(pollMean)]);
  return [...ids].filter(id => val(actual, id) > 0 || val(pollMean, id) >= ROW_MIN_POLL_MEAN)
    .sort((a, b) => val(actual, b) - val(actual, a) || val(pollMean, b) - val(pollMean, a));
}

/** חלק המנחשים שהיו קרובים לאמת יותר ממרחק err (ממש קרובים יותר; שוויון אינו נספר) */
export function closerShareHist(err: number, hist: number[], actual: number): number | null {
  let n = 0, closer = 0;
  hist.forEach((c, k) => { if (!c) return; n += c; if (Math.abs(k - actual) < err) closer += c; });
  return n ? closer / n : null;
}

/** כל הניחושים לרשימה אחת: חלק שפגעו בדיוק, המרחק הממוצע, והחציון */
export function histStats(hist: number[], actual: number): { exact: number; mean: number; median: number } | null {
  const n = hist.reduce((a, b) => a + b, 0);
  if (!n) return null;
  let sum = 0, seen = 0, median = 0;
  hist.forEach((c, k) => { sum += c * Math.abs(k - actual); });
  // חציון: הערך שבו מצטברת מחצית הניחושים (במספר זוגי — ממוצע שני האמצעיים)
  const at = (q: number) => { let acc = 0; for (let k = 0; k < hist.length; k++) { acc += hist[k]; if (acc > q) return k; } return hist.length - 1; };
  median = n % 2 ? at((n - 1) / 2) : (at(n / 2 - 1) + at(n / 2)) / 2;
  seen = hist[actual] ?? 0;
  return { exact: seen / n, mean: sum / n, median };
}

/** הסקרים לרשימה אחת: חלק שפגעו בדיוק והמרחק הממוצע. סקר שלא פרסם נתון לרשימה — אינו נכלל בה */
export function pollStats(polls: Seats[], id: string, actual: number): { exact: number; mean: number; n: number } | null {
  const xs = polls.filter(p => id in p).map(p => Math.abs(p[id] - actual));
  if (!xs.length) return null;
  return { exact: xs.filter(x => x === 0).length / xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length };
}

/** אחוז דיוק לשיתוף: 100 × (1 − מנדטים שהונחו במקום הלא נכון / 120); במקום הלא נכון = חצי מסכום המרחקים על כל הרשימות */
export function accuracyPct(values: Seats, actual: Seats): number {
  const ids = new Set([...Object.keys(values), ...Object.keys(actual)]);
  let sum = 0;
  for (const id of ids) sum += Math.abs(val(values, id) - val(actual, id));
  return Math.max(0, 100 * (1 - sum / 2 / TOTAL));
}

/** מנדטים מדויקים (הכרעת בעלים 28.10.2026 — מחליף את אחוז הדיוק בתצוגה): 120 פחות המנדטים במקום הלא נכון, מעוגל */
export const correctSeats = (accPct: number) => Math.round(accPct * TOTAL / 100);
/** מפלגות מדויקות: רשימות שעברו בפועל וקיבלו בדיוק את מספר המנדטים שלהן */
export function exactLists(values: Seats, actual: Seats): number {
  return Object.keys(actual).filter(id => val(actual, id) > 0 && Math.round(val(values, id)) === val(actual, id)).length;
}
/** השורה האחידה: "111 מנדטים · 5 מפלגות" */
export const exactLine = (seats: number, lists: number | string) => `${seats} מנדטים · ${lists} מפלגות`;

/** אחוז דיוק של סקר: כמו accuracyPct, אבל רשימה שהסקר לא פרסם עליה נתון אינה נכללת (לא נחשבת טעות) */
export function pollAccuracyPct(poll: Seats, actual: Seats): number {
  let sum = 0;
  for (const id of Object.keys(poll)) sum += Math.abs(poll[id] - val(actual, id));
  return Math.max(0, 100 * (1 - sum / 2 / TOTAL));
}

/** הסקר הקרוב ביותר: הסקר האחרון של כל מכון, לפי אחוז הדיוק */
export function closestPoll<P extends { values: Seats }>(polls: P[], actual: Seats): (P & { acc: number }) | null {
  let best: (P & { acc: number }) | null = null;
  for (const p of polls) { const acc = pollAccuracyPct(p.values, actual); if (!best || acc > best.acc) best = { ...p, acc }; }
  return best;
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

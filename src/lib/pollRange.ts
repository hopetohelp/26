import { mean, seatsIn, type Poll } from "./data";

/**
 * המנדטים של מפלגה או של גוש בכל סקר (סכום המנדטים של הרשימות בסקר), סקר אחד לכל ערך.
 * אותו כלל כמו במגמת הממשלה היוצאת: רשימה שבממוצע מתחת לסף ולא נשאלה בסקר — 0; רשימה גדולה שחסרה — הסקר לא נספר.
 * `polls` = הסקר האחרון של כל מכון, `average` = ממוצע המנדטים של כל רשימה (`POLL_AVERAGE.seats`).
 */
export function pollSeatValues(polls: Poll[], ids: string[], average: Record<string, number>): number[] {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const sums: number[] = [];
  for (const p of polls) {
    const parts = unique.map((id) => seatsIn(p, id) ?? (average[id] ? undefined : 0));
    if (parts.every((x): x is number => typeof x === "number")) sums.push(parts.reduce((a, b) => a + b, 0));
  }
  return sums;
}

/** טווח הסקרים (הנמוך והגבוה בין המכונים) למפלגה או לגוש, לפי `pollSeatValues` */
export function pollSeatRange(polls: Poll[], ids: string[], average: Record<string, number>): [number, number] | null {
  const sums = pollSeatValues(polls, ids, average);
  return sums.length ? [Math.min(...sums), Math.max(...sums)] : null;
}

/**
 * ממוצע חשבוני וטווח מלא מתוך הסקרים בלבד. 🔴 נתון שחסר לא מסתיר את הנתון הכולל (הכרעת בעלים 12.10.2026):
 * רשימות הגוש ש"נשאלות" בסקרים (מופיעות בחצי מהסקרים לפחות) נסכמות, והסכום הוא "לפחות" כשיש רשימה שהסקרים לא שואלים עליה
 * (למשל נעם או צבע שחור). `listed`/`total` = כמה מרשימות הגוש נכללו בסכום מתוך כמה יש בו. אין השלמה מהמודל ואין השלמה באפס.
 * סקר נספר רק אם יש בו נתון לכל הרשימות הנשאלות.
 */
export function pollSeatSummary(polls: Poll[], ids: string[]): { mean: number; range: [number, number]; listed: number; total: number } | null {
  const unique = [...new Set(ids)];
  if (!unique.length || !polls.length) return null;
  const asked = unique.filter(id => polls.filter(p => seatsIn(p, id) !== undefined).length * 2 >= polls.length);
  if (!asked.length) return null;
  const values = polls.flatMap(p => {
    const parts = asked.map(id => seatsIn(p, id));
    return parts.every((x): x is number => typeof x === "number") ? [parts.reduce((a, b) => a + b, 0)] : [];
  });
  return values.length ? { mean: mean(values), range: [Math.min(...values), Math.max(...values)], listed: asked.length, total: unique.length } : null;
}

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

/** ממוצע חשבוני וטווח מלא מתוך הסקרים בלבד; גוש נספר רק בסקרים עם נתון לכל רשימה בהרכב. */
export function pollSeatSummary(polls: Poll[], ids: string[]): { mean: number; range: [number, number] } | null {
  const unique = [...new Set(ids)];
  if (!unique.length) return null;
  const values = polls.flatMap(p => {
    const parts = unique.map(id => seatsIn(p, id));
    return parts.every((x): x is number => typeof x === "number") ? [parts.reduce((a, b) => a + b, 0)] : [];
  });
  return values.length ? { mean: mean(values), range: [Math.min(...values), Math.max(...values)] } : null;
}

import { groupSeatsIn, mean } from "./pollMath";
import type { Poll } from "./data";

/**
 * המנדטים של מפלגה או של גוש בכל סקר (סכום המנדטים של הרשימות בסקר), סקר אחד לכל ערך.
 * 🔴 הכלל האחד (הכרעת בעלים 12.10.2026, `groupSeatsIn`): נכנס כל סקר שסקר לפחות מפלגה אחת מהקבוצה; מפלגה שלא נסקרה נספרת 0, בלי סימון.
 * `polls` = הסקר האחרון של כל מכון.
 */
export function pollSeatValues(polls: Poll[], ids: string[]): number[] {
  return polls.flatMap((p) => { const v = groupSeatsIn(p, ids); return v === null ? [] : [v]; });
}

/** טווח הסקרים (הנמוך והגבוה בין המכונים) למפלגה או לגוש, לפי `pollSeatValues` */
export function pollSeatRange(polls: Poll[], ids: string[]): [number, number] | null {
  const sums = pollSeatValues(polls, ids);
  return sums.length ? [Math.min(...sums), Math.max(...sums)] : null;
}

/** ממוצע חשבוני וטווח מלא מתוך הסקרים בלבד, לפי `pollSeatValues` (אותו כלל, בלי סימון חסר) */
export function pollSeatSummary(polls: Poll[], ids: string[]): { mean: number; range: [number, number] } | null {
  const values = pollSeatValues(polls, ids);
  return values.length ? { mean: mean(values), range: [Math.min(...values), Math.max(...values)] } : null;
}

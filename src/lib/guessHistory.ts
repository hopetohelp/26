/**
 * היסטוריית הניחושים באזור האישי — פונקציות טהורות בלבד.
 * המספור (ניחוש 3/5), הדיוק מול תוצאות האמת והשורות בפוסט; החישוב עצמו מ-`guessAccuracy.ts` (מקור אחד).
 */
import type { SeatsPayload, Version } from "./crowdApi";
import { accuracyPct, correctSeats, exactLists, type Seats } from "./guessAccuracy";

export interface NumberedGuess {
  version: Version<SeatsPayload>;
  /** מספר הניחוש לפי סדר השמירה: הראשון שנשמר הוא 1 */
  n: number;
  total: number;
  values: Seats;
}

export const guessValues = (p: SeatsPayload): Seats => Object.fromEntries(Object.entries(p.seats).map(([id, c]) => [id, c.v]));

/** הניחושים מהחדש לישן; המספר נקבע לפי מספר הגרסה (לא לפי סדר ההגעה מהשרת) */
export function numberGuesses(versions: Version[]): NumberedGuess[] {
  const asc = [...versions].sort((a, b) => a.id - b.id);
  return asc.map((v, i) => ({ version: v as Version<SeatsPayload>, n: i + 1, total: asc.length, values: guessValues(v.payload as SeatsPayload) })).reverse();
}

export const guessLabel = (n: number, total: number) => `ניחוש ${n}/${total}`;

export interface GuessScore {
  /** מנדטים שהונחו ברשימה הנכונה, מתוך 120 (מנדטים בכנסת) */
  seats: number;
  /** רשימות שעברו בפועל וקיבלו בדיוק את מספר המנדטים שלהן */
  lists: number;
  /** כמה רשימות עברו בפועל */
  passed: number;
}

export function guessScore(values: Seats, actual: Seats): GuessScore {
  return {
    seats: correctSeats(accuracyPct(values, actual)),
    lists: exactLists(values, actual),
    passed: Object.values(actual).filter((v) => v > 0).length,
  };
}

export interface GuessRow {
  id: string;
  guess: number;
  actual: number;
  exact: boolean;
}

/** הרשימות בפוסט ובטבלה: עברו בפועל או קיבלו מנדטים בניחוש; לפי תוצאת האמת, ובשוויון לפי הניחוש */
export function guessRows(values: Seats, actual: Seats | null): GuessRow[] {
  const ids = new Set([...Object.keys(values).filter((id) => (values[id] ?? 0) > 0), ...Object.keys(actual ?? {}).filter((id) => (actual?.[id] ?? 0) > 0)]);
  return [...ids]
    .map((id) => ({ id, guess: values[id] ?? 0, actual: actual?.[id] ?? 0, exact: !!actual && (actual[id] ?? 0) > 0 && Math.round(values[id] ?? 0) === actual[id] }))
    .sort((a, b) => b.actual - a.actual || b.guess - a.guess);
}

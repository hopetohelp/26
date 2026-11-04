import { exitPolls, exitSeats, firstExitPolls, toTime, type ExitPoll } from "./data";
import { hasResults, results2026, ELECTION_DAY } from "./guessAccuracyData";

const DAY = 86_400_000;
/** יום הבחירות: נקודת המדגמים (ממוצע המדגמים של 22:00), ויומיים אחריה — נקודת תוצאות האמת (הכרעת בעלים 03.11.2026) */
export const EXIT_T = toTime(ELECTION_DAY);
export const RESULTS_T = EXIT_T + 2 * DAY;

/** מה שנקודות יום הבחירות צריכות ממערכת — כל מערכת (electionData), בלי לטעון כאן את נתוני המערכות הקודמות */
export interface MarkerSource { day: string; exitPolls: ExitPoll[]; result: { seats: Record<string, number> } | null }

/** שתי הנקודות בגרף מגמה של מערכת, לרשימה או לקבוצת רשימות (סכום); `id` = מזהה הסדרה בגרף של כמה סדרות */
export function electionMarkersOf(src: MarkerSource, ids: string[], id?: string) {
  const exitT = toTime(src.day);
  const first = firstExitPolls(src.exitPolls);  // רק 22:00 — בלי עדכוני הלילה
  const exit = first.length ? first.reduce((t, p) => t + exitSeats(p, ids), 0) / first.length : null;
  return [
    ...(exit == null ? [] : [{ t: exitT, v: Math.round(exit * 10) / 10, id, label: "ממוצע המדגמים", asMean: true }]),
    ...(src.result ? [{ t: exitT + 2 * DAY, v: ids.reduce((t, x) => t + (src.result!.seats[x] ?? 0), 0), id, label: "תוצאות אמת" }] : []),
  ];
}

/** 2026 */
export const electionMarkers = (ids: string[], id?: string) =>
  electionMarkersOf({ day: ELECTION_DAY, exitPolls, result: hasResults() ? { seats: results2026.seats } : null }, ids, id);

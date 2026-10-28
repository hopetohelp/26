import { exitMean, toTime } from "./data";
import { hasResults, results2026 } from "./guessAccuracyData";

/** יום הבחירות: נקודת המדגמים (ממוצע המדגמים של 22:00) ולמחרת — נקודת תוצאות האמת (הכרעת בעלים 28.10.2026) */
export const EXIT_T = toTime("2026-10-27");
export const RESULTS_T = toTime("2026-10-28");
/** שתי הנקודות בגרף מגמה, לרשימה או לקבוצת רשימות (סכום); `id` = מזהה הסדרה בגרף של כמה סדרות */
export function electionMarkers(ids: string[], id?: string) {
  const exit = exitMean(ids);
  return [
    ...(exit == null ? [] : [{ t: EXIT_T, v: Math.round(exit * 10) / 10, id, label: "ממוצע המדגמים", asMean: true }]),
    ...(hasResults() ? [{ t: RESULTS_T, v: ids.reduce((t, x) => t + (results2026.seats[x] ?? 0), 0), id, label: "תוצאות אמת" }] : []),
  ];
}

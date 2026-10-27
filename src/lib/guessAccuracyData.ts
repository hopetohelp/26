/** נתוני מסך "דיוק הניחושים": תוצאות האמת, הסקר האחרון של כל סדרה וממוצע הסקרים — מהמקורות הקיימים באתר */
import resultsFile from "../../raw/results-2026.json";
import { latestPerPollster, pollsterKey, pollsterLabel, seatsIn, lists2026 } from "./data";
import { SIMPLE_ALL, SIMPLE_DAYS, simpleValue } from "./simpleSources";
import type { Seats } from "./guessAccuracy";

export type ResultsStatus = "none" | "partial" | "final";
export const results2026 = resultsFile as { status: ResultsStatus; asOf: string | null; source: string; seats: Seats };
export const hasResults = () => results2026.status !== "none" && Object.keys(results2026.seats).length > 0;

/** יום הבחירות — חלון הסקרים נסגר בו */
export const ELECTION_DAY = "2026-10-27";
const IDS = lists2026.map(l => l.id);

/** הסקר האחרון של כל סדרת מכון–מזמין בחלון של 14 הימים עד יום הבחירות; רשימה שהסקר לא פרסם עליה נתון — חסרה (אינה 0) */
export const finalPolls = latestPerPollster(ELECTION_DAY, SIMPLE_DAYS).map(p => ({
  key: pollsterKey(p),
  label: pollsterLabel(p),
  firm: p.firmHe,
  end: p.end,
  values: Object.fromEntries(IDS.flatMap(id => { const v = seatsIn(p, id); return v === undefined ? [] : [[id, v]]; })) as Seats,
}));

/** ממוצע הסקרים — אותו ממוצע של שאר האתר (polls.mean) */
export const pollMean: Seats = Object.fromEntries(IDS.map(id => [id, simpleValue(SIMPLE_ALL, [id]) ?? 0]));

/** התפלגות {מנדטים: כמה} ⇐ מערך לפי מנדטים */
export function histArrays(hist: Record<string, Record<string, number>> | undefined): Record<string, number[]> | null {
  if (!hist) return null;
  return Object.fromEntries(Object.entries(hist).map(([id, h]) => {
    const a = Array(121).fill(0);
    for (const [k, c] of Object.entries(h)) a[Number(k)] = c;
    return [id, a];
  }));
}

/** אחוז הצבעה בספרה אחת אחרי הנקודה: מצביעים מתוך בעלי זכות הבחירה הרשמיים; נתון חסר או לא תקין ⇐ null */
export function turnoutPct(voters: number, eligible: number): number | null {
  if (!Number.isFinite(voters) || !Number.isFinite(eligible) || voters < 0 || eligible <= 0) return null;
  return Math.round((voters / eligible) * 1000) / 10;
}

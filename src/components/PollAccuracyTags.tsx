import { seatTags, type SeatTags, type Seats } from "../lib/guessAccuracy";
import { hasResults, results2026 } from "../lib/guessAccuracyData";
import { SIMPLE_BLOCS } from "../lib/simpleSources";

/**
 * תגיות הדיוק על סקר או מדגם (הכרעת בעלים 02.11.2026): מנדטים מדויקים · מפלגות מדויקות · גושים.
 * בלי `tags` — מחושב מול תוצאות 2026 בארבעת הגושים (seatTags, מקור אחד). לפני הספירה הראשונה — לא מוצג.
 */
export default function PollAccuracyTags({ values, tags, className = "" }: { values?: Seats; tags?: SeatTags; className?: string }) {
  const t = tags ?? (values && hasResults() ? seatTags(values, results2026.seats, SIMPLE_BLOCS) : null);
  if (!t) return null;
  const pill = "inline-flex items-baseline gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-ink whitespace-nowrap";
  return <span className={`inline-flex flex-wrap gap-1 ${className}`} aria-label={`דיוק מול התוצאה: ${t.seats} מנדטים מדויקים, ${t.exact} מפלגות מדויקות, ${t.blocs} מנדטים מדויקים בגושים`}>
    <span className={pill} aria-hidden="true">מנדטים <b className="font-num">{t.seats}</b></span>
    <span className={pill} aria-hidden="true">מפלגות <b className="font-num">{t.exact}</b></span>
    <span className={pill} aria-hidden="true">גושים <b className="font-num">{t.blocs}</b></span>
  </span>;
}

/** המנדטים של סקר או מדגם לכל רשימה (שדה s); רשימה בלי מנדטים בסקר — לא נכללת, ונספרת 0 בחישוב */
export const seatsOfValues = (values: Record<string, { s?: number }>): Seats =>
  Object.fromEntries(Object.entries(values).flatMap(([id, v]) => v.s === undefined ? [] : [[id, v.s]]));

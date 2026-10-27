import { useEffect, useState } from "react";

/** מסך "הניחוש שלי" נסגר ומוסתר דקותיים לפני סגירת הקלפיות (הכרעת בעלים 27.10.2026) */
export const GUESS_CLOSE_AT = Date.parse("2026-10-27T21:58:00+02:00");
export const guessClosed = (now = Date.now()) => now >= GUESS_CLOSE_AT;

/** מתעדכן בדיוק ברגע הסגירה, גם כשהמסך פתוח */
export function useGuessClosed(): boolean {
  const [closed, setClosed] = useState(guessClosed);
  useEffect(() => {
    if (closed) return;
    const t = window.setTimeout(() => setClosed(true), Math.min(GUESS_CLOSE_AT - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [closed]);
  return closed;
}

/** מ-22:00 "הניחוש שלי" חוזר לסרגל: דיוק הניחושים, או הודעה עד פרסום התוצאות (הכרעת בעלים 27.10.2026) */
export const RESULTS_SCREEN_AT = Date.parse("2026-10-27T22:00:00+02:00");
export const resultsScreenOpen = (now = Date.now()) => now >= RESULTS_SCREEN_AT;
/** מתעדכן ברגע הפתיחה, גם כשהמסך פתוח */
export function useResultsScreenOpen(): boolean {
  const [open, setOpen] = useState(resultsScreenOpen);
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => setOpen(true), Math.min(RESULTS_SCREEN_AT - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [open]);
  return open;
}

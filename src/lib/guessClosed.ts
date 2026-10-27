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

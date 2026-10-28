/**
 * תוצאות האמת 2026 (raw/results-2026.json ⇐ poll-ranges.json באתר ⇐ setActualResults): לספירת המנחשים שצדקו בכל הרשימות יחד
 * (שורת "כל המפלגות" בטור "ניחושים מדויקים"; הכרעת בעלים 28.10.2026). רק תוצאות שלמות (סך 120); אחרת — אין נתון.
 */
let ACTUAL = null;
export function setActualResults(seats) {
  const ok = seats && typeof seats === "object" && Object.values(seats).every((v) => Number.isInteger(v) && v >= 0 && v <= 120)
    && Object.values(seats).reduce((a, b) => a + b, 0) === 120;
  ACTUAL = ok ? { ...seats } : null;
}
export const actualResults = () => ACTUAL;
/** כמה גרסאות נתנו לכל רשימה בתוצאות בדיוק את מספר המנדטים שלה (רשימה שאינה בניחוש = 0); בלי תוצאות ⇐ undefined */
export function exactAllCount(payloads, value) {
  if (!ACTUAL) return undefined;
  const ids = Object.keys(ACTUAL);
  return payloads.filter((p) => ids.every((id) => Math.round(value(p, id)) === ACTUAL[id])).length;
}

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
/** פודיום (הכרעת בעלים 28.10.2026): שלושת הניחושים המדויקים — אחוז הדיוק (המנדטים במקום הנכון מתוך 120, כמו accuracyPct באתר),
 * אחר כך מספר הרשימות שקיבלו בדיוק את מספר המנדטים שלהן, ובשוויון — מי ששמר קודם. p (המשתתף) נשאר בשרת בלבד — computeDashboard מסיר אותו; בלי תוצאות ⇐ undefined */
export function podium(versions, value) {
  if (!ACTUAL) return undefined;
  const ids = Object.keys(ACTUAL);
  return versions.map((v) => {
    const err = ids.reduce((a, id) => a + Math.abs(Math.round(value(v.payload, id)) - ACTUAL[id]), 0);
    return { acc: Math.round(1000 * (1 - err / 240)) / 10, exact: ids.filter((id) => ACTUAL[id] > 0 && Math.round(value(v.payload, id)) === ACTUAL[id]).length, savedAt: v.created_at, p: v.participant };
  }).sort((a, b) => b.acc - a.acc || b.exact - a.exact || (a.savedAt < b.savedAt ? -1 : 1)).slice(0, 3);
}

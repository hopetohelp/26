/**
 * זיהוי חריגות — כללים קבועים, פונקציות טהורות (docs/השתתפות-גולשים.md, "זיהוי חריגות").
 *
 * שעה חשודה =
 *   (א) משתתפים חדשים ≥ 30 וגם ≥ פי 5 מהחציון השעתי של 7 הימים האחרונים (שעות מאושרות בלבד), כשהבסיס לפחות 5; או
 *   (ב) ≥ 40% מהחדשים, ולפחות 15, עם אותה חלוקת 120 מלאה.
 * המשתתפים החדשים של שעה חשודה מסומנים "בבדיקה" — ההחלטה רשומה ביומן הציבורי.
 */
export const SURGE_MIN = 30;
export const SURGE_FACTOR = 5;
export const BASELINE_MIN = 5;
export const SAME_SHARE = 0.4;
export const SAME_MIN = 15;
export const BASELINE_HOURS = 168;

export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** טביעת חלוקה מלאה: רשימה=ערך ממוינות (רק ערכים חיוביים) */
export function seatsKey(payload) {
  if (!payload?.seats) return null;
  return Object.entries(payload.seats)
    .filter(([, c]) => c.v > 0)
    .map(([id, c]) => `${id}=${c.v}`)
    .sort()
    .join(",");
}

/**
 * newcomers: [{id, seats: SeatsPayload|null}] — המשתתפים שנוצרו בשעה הנבדקת
 * history: מספרי המשתתפים החדשים בשעות המאושרות (עד 168 האחרונות; שעה בלי איש = 0)
 * מחזיר {flagged, rule, reason, baseline}
 */
export function detectHour(newcomers, history) {
  const n = newcomers.length;
  const baseline = Math.max(BASELINE_MIN, median(history.slice(-BASELINE_HOURS)));
  if (n >= SURGE_MIN && n >= SURGE_FACTOR * baseline)
    return { flagged: true, rule: "surge", reason: `${n} משתתפים חדשים בשעה, פי ${Math.round((n / baseline) * 10) / 10} מהחציון (${baseline})`, baseline };
  const groups = {};
  for (const p of newcomers) {
    const k = seatsKey(p.seats);
    if (k) groups[k] = (groups[k] || 0) + 1;
  }
  const top = Math.max(0, ...Object.values(groups));
  if (top >= SAME_MIN && top >= SAME_SHARE * n)
    return { flagged: true, rule: "identical", reason: `${top} מתוך ${n} משתתפים חדשים שמרו אותה חלוקת 120 בדיוק`, baseline };
  return { flagged: false, rule: null, reason: null, baseline };
}

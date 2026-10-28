/**
 * דשבורד הסטטיסטיקה (הכרעת בעלים 28.10.2026): מקור אחד לנקודות הזמן ולחישוב המצטבר — לשרת ההשתתפות ולשרת ההערות.
 * כל נתון = רשימת אירועים [זמן במילישניות, משקל]; כל נקודה = סך האירועים עד סוף השעה. "היום" = ההפרש מחצות בשעון ישראל.
 */
export const HOUR_MS = 3600_000;
/** תחילת הגרפים: 24/10/2026 23:00 שעון ישראל */
export const STATS_FROM = Date.parse("2026-10-24T20:00:00Z");
/** סוף ספירת השמירות: 27/10/2026 22:00 שעון ישראל (הכרעת בעלים 28.10.2026). שמירות מאוחרות נשמרות במאגר ואינן נספרות */
export const SAVES_UNTIL = Date.parse("2026-10-27T20:00:00Z");
export const SAVES_UNTIL_ISO = new Date(SAVES_UNTIL).toISOString();

/** שעה לפי UTC כמפתח מונה: "2026-10-28T19" */
export const hourKey = (ms) => new Date(ms).toISOString().slice(0, 13);
export const hourKeyMs = (k) => Date.parse(k + ":00:00Z");

/** נקודה לכל שעה מתחילת הגרפים ועד עכשיו */
export function statsBuckets(now) {
  const out = [];
  for (let h = STATS_FROM; h <= now; h += HOUR_MS) out.push(h);
  if (!out.length) out.push(Math.floor(now / HOUR_MS) * HOUR_MS);
  return out;
}

/** אירועים ⇐ סך מצטבר בסוף כל שעה. אירוע בלי זמן תקין אינו נספר */
export function cumulative(events, buckets, now) {
  const ev = events.filter(([t]) => Number.isFinite(t)).sort((a, b) => a[0] - b[0]);
  let i = 0, sum = 0;
  return buckets.map((b) => {
    const end = Math.min(b + HOUR_MS, now + 1);
    while (i < ev.length && ev[i][0] < end) sum += ev[i++][1];
    return sum;
  });
}

/** חצות של היום הנוכחי בשעון ישראל */
export function israelMidnight(now) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now));
  for (const off of [3, 2]) {
    const t = Date.parse(`${day}T00:00:00+0${off}:00`);
    if (new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(t)) === day && t <= now) return t;
  }
  return Date.parse(day + "T00:00:00Z");
}

/** סדרה מוכנה: סך הכול, היום (שעון ישראל) ונקודות */
export function series(key, events, buckets, now) {
  const points = cumulative(events, buckets, now);
  const total = events.reduce((a, [t, w]) => a + (Number.isFinite(t) ? w : 0), 0);
  const mid = israelMidnight(now);
  const today = events.reduce((a, [t, w]) => a + (t >= mid && t <= now ? w : 0), 0);
  return { key, total, today, points };
}

/**
 * מונה יומי ישן (לפי יום UTC) ומונה שעתי חדש: השעתי נספר בשעתו, ומה שנשאר מהיומי — בתחילת אותו יום.
 * daily: [[day, count]], hourly: [[hourKey, count]]
 */
export function mergeDailyHourly(daily, hourly) {
  const byDay = new Map();
  const ev = hourly.map(([k, c]) => { byDay.set(k.slice(0, 10), (byDay.get(k.slice(0, 10)) ?? 0) + c); return [hourKeyMs(k), c]; });
  for (const [day, c] of daily) {
    const rest = c - (byDay.get(day) ?? 0);
    if (rest > 0) ev.push([Date.parse(day + "T00:00:00Z"), rest]);
  }
  return ev;
}

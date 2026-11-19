/**
 * לוח הריצות המתוזמנות (הכרעת בעלים 19.11.2026): הרענון והבדיקות רצים אחת ליומיים —
 * ב-02:03 שעון ישראל בימים זוגיים (מספר היום מ-1970) — ומושבתים משישי 16:00 עד מוצאי שבת 20:00.
 * מקור אמת אחד: הלוח הזה, ותנאי ה-gate ב-`.github/workflows/pages.yml` (חייבים להתאים), והתזמון של הסשן (CRON_TZ Asia/Jerusalem).
 */
export const RUN_HOURS = [2];
export const RUN_MINUTE = 3;

const parts = (t: number) => {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (type: string) => f.find((p) => p.type === type)?.value ?? "";
  // מספר היום (שעון ישראל) מ-1970 — כמו ב-gate של ה-workflow: `date -u -d <תאריך> +%s` חלקי 86400
  const dayNumber = Math.round(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))) / 86_400_000);
  return { weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")), dayNumber };
};

/** שבת מושבתת: מיום שישי 16:00 עד שבת 20:00 (שעון ישראל) */
export function isShabbatWindow(t: number): boolean {
  const { weekday, hour } = parts(t);
  return (weekday === "Fri" && hour >= 16) || (weekday === "Sat" && hour < 20);
}

/** האם הרגע t הוא רגע ריצה מתוזמן (לא בשבת) */
export function isRunSlot(t: number): boolean {
  const { hour, minute, dayNumber } = parts(t);
  return minute === RUN_MINUTE && RUN_HOURS.includes(hour) && dayNumber % 2 === 0 && !isShabbatWindow(t);
}

/** הריצה המתוזמנת הבאה אחרי הרגע now (באלפיות שנייה), או null אם לא נמצאה בשבועיים */
export function nextRun(now: number): number | null {
  const hour = 3_600_000;
  // רגע ה-:03 הקרוב לפי UTC; ההפרש לשעון ישראל הוא תמיד שעות שלמות
  let t = Math.floor(now / hour) * hour + RUN_MINUTE * 60_000;
  if (t <= now) t += hour;
  for (let i = 0; i < 24 * 14; i++, t += hour) if (isRunSlot(t)) return t;
  return null;
}

/**
 * לוח הריצות המתוזמנות (הכרעת בעלים 12.10.2026): הסשן המרוכז והרענון של GitHub רצים באותה שעה —
 * בשעות 02, 06, 10, 14, 18 ו-22 שעון ישראל, בדקה 3 — ומושבתים משישי 16:00 עד מוצאי שבת 20:00.
 * מקור אמת אחד: הלוח הזה, ותנאי ה-gate ב-`.github/workflows/pages.yml` (חייבים להתאים), והתזמון של הסשן (CRON_TZ Asia/Jerusalem).
 */
export const RUN_HOURS = [2, 6, 10, 14, 18, 22];
export const RUN_MINUTE = 3;

const parts = (t: number) => {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (type: string) => f.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")) };
};

/** שבת מושבתת: מיום שישי 16:00 עד שבת 20:00 (שעון ישראל) */
export function isShabbatWindow(t: number): boolean {
  const { weekday, hour } = parts(t);
  return (weekday === "Fri" && hour >= 16) || (weekday === "Sat" && hour < 20);
}

/** האם הרגע t הוא רגע ריצה מתוזמן (לא בשבת) */
export function isRunSlot(t: number): boolean {
  const { hour, minute } = parts(t);
  return minute === RUN_MINUTE && RUN_HOURS.includes(hour) && !isShabbatWindow(t);
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

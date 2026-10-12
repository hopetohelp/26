/** "16 ימים ו-21 שעות" — הזמן שנשאר, מעוגל כלפי מטה לשעה. ריק כשהזמן עבר. */
export function timeLeftText(ms: number): string {
  if (ms <= 0) return "";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const days = d === 1 ? "יום אחד" : `${d} ימים`;
  const hours = h === 1 ? "שעה אחת" : `${h} שעות`;
  if (d === 0 && h === 0) return "פחות משעה";
  if (d === 0) return hours;
  if (h === 0) return days;
  return `${days} ו-${hours}`;
}

const il = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
/** הפרש שעון ישראל מ-UTC באלפיות שנייה ברגע נתון (שעון קיץ +3, חורף +2). */
function israelOffset(t: number): number {
  const v: Record<string, number> = {};
  for (const x of il.formatToParts(new Date(t))) if (x.type !== "literal") v[x.type] = Number(x.value);
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - Math.floor(t / 1000) * 1000;
}
/**
 * הזמן שנשאר עד היעד לפי שעון הקיר בישראל (הכרעת בעלים 12.10.2026): ההפרש בין השעה שמראה השעון עכשיו לשעה שיראה ביעד.
 * מעבר לשעון חורף (25.10) לא מוסיף שעה לספירה — 27.10 22:00 הוא עדיין 22:00 בשעון הקיר.
 */
export function wallClockLeft(target: number, now: number): number {
  return target - now + israelOffset(target) - israelOffset(now);
}

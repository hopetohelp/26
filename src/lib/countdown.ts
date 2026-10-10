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

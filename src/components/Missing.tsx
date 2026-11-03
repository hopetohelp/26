/** "נתון חסר · נשלים בהמשך" (הכרעת בעלים 02.11.2026): החלק נשאר במקומו, כדי שהמבנה יהיה זהה בכל מערכת */
export default function Missing({ what }: { what?: string }) {
  return <p className="text-sm text-ink-soft">נתון חסר{what ? `: ${what}` : ""} · נשלים בהמשך</p>;
}

/** חמש המגירות של מסך "סקרים" — אותם שמות ואותו סדר בכל מערכת (הכרעת בעלים 02.11.2026) */
export const POLL_DRAWERS = {
  vs: "הסקרים מול התוצאה",
  firms: "הסקר האחרון של כל מכון",
  trend: "מגמות",
  archive: "ארכיון",
} as const;

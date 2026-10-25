import type { SeatsPayload } from "../../lib/crowdApi";
import { validatePct, validateSeats } from "../../lib/crowdValidate";

/** שלב הצפייה נפתח רק עבור חלוקת מנדטים מלאה ותקינה, גם כשנכנסים מקישור ישן. */
export function canViewCommunity(payload: SeatsPayload | null | undefined, ids: string[]): boolean {
  if (!payload?.seats || validateSeats(payload, ids) !== null) return false;
  return payload.mode !== "pct" || (!!payload.pct && validatePct(payload.pct, ids) === null);
}

/**
 * שער השמירה האחיד (תוכנית מאוחדת, פרק ב): ההשוואה לממוצע הניחושים נפתחת רק לניחוש שלם שהשרת אישר את שמירתו —
 * בכל נתיב (ממוקדת, מתקדמת, קבוצה, קישור ישיר). טיוטה מלאה שלא נשמרה, או שמירה שממתינה בתור, אינן הצלחה.
 */
export function comparisonUnlocked(unit: { draft: SeatsPayload | null; status: "draft" | "saved" | "dirty"; queued: boolean }, ids: string[]): boolean {
  return unit.status === "saved" && !unit.queued && canViewCommunity(unit.draft, ids);
}

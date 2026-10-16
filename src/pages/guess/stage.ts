import type { SeatsPayload } from "../../lib/crowdApi";
import { validatePct, validateSeats } from "../../lib/crowdValidate";

/** שלב הצפייה נפתח רק עבור חלוקת מנדטים מלאה ותקינה, גם כשנכנסים מקישור ישן. */
export function canViewCommunity(payload: SeatsPayload | null | undefined, ids: string[]): boolean {
  if (!payload?.seats || validateSeats(payload, ids) !== null) return false;
  return payload.mode !== "pct" || (!!payload.pct && validatePct(payload.pct, ids) === null);
}

import type { Payload, SeatsPayload, Unit } from "./crowdApi";
import { activeLists2026 } from "./data";
import { validatePct, validateSeats } from "./crowdValidate";
const ids = activeLists2026.map(l => l.id);
/** אותו שער לפני שמירה מפורשת, כניסה, יציאה ושליחה חוזרת. השרת מאמת בנפרד. */
export function seatSaveError(unit: Unit, payload: Payload): string | null {
  if (unit !== "seats") return null;
  const p = payload as SeatsPayload;
  if (!p?.seats || typeof p.seats !== "object" || Object.values(p.seats).some(c => !c || typeof c !== "object")) return "הניחוש אינו תקין.";
  return validateSeats(p, ids) ?? (p.mode === "pct" ? p.pct ? validatePct(p.pct, ids) : "חסרים אחוזי ההצבעה." : null);
}

import { LISTS_2026 } from "../lib/lists.js";
export const IDS = LISTS_2026.map((l) => l.id);
/** חלוקת 120: רשימה ראשונה מקבלת a, השנייה 120-a */
export function seats(a = 60, src = "manual", extra = {}) {
  return {
    seats: { [IDS[0]]: { v: a, src, locked: src === "manual" }, [IDS[1]]: { v: 120 - a, src, locked: false } },
    start: "zero",
    pollsAsOf: null,
    ...extra,
  };
}
let vid = 1;
export const ver = (participant, unit, payload, created_at = "2026-10-05T10:00:00Z", id = vid++) => ({ id, participant, unit, created_at, payload });
export const people = (n, prefix = "p", review = 0) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, review }));

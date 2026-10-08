import type { SeatCell } from "../../lib/crowdApi";
import { TOTAL } from "../../lib/fillAll";

/** עריכה ידנית נועלת את הרשימה; חריגה מותרת רק אם תישאר רשימה אחרת פתוחה. */
export function canSetSeats(seats: Record<string, SeatCell>, ids: string[], id: string, value: number): boolean {
  const current = seats[id]?.v ?? 0;
  if (value <= current) return true;
  const sum = ids.reduce((n, key) => n + (seats[key]?.v ?? 0), 0);
  return sum - current + value <= TOTAL || ids.some(key => key !== id && !seats[key]?.locked);
}

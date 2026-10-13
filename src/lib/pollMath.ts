/** פעולות סקרים טהורות, משותפות לאתר ולעוזרים, ללא טעינת נתוני בנייה. */
import type { Poll } from "./data";
import { POLL_WINDOW_DAYS } from "./dataCatalog";
const DAY = 86_400_000;
export const pollsterKey = (p: Poll) => `${p.firm}|${p.publisher ?? ""}`;
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
export const toTime = (d: string) => Date.parse(d + "T12:00:00Z");
export function seatsIn(p: Poll, id: string): number | undefined {
  const v = p.values[id];
  if (!v) return undefined;
  if (Number.isFinite(v.s) && v.s! >= 0 && v.s! <= 120) return v.s;
  if (Number.isFinite(v.p) && v.p! >= 0 && v.p! < 3.25) return 0;
  return undefined;
}
export function sumPresent(values: (number | undefined)[]): number | null {
  const present = values.filter((x): x is number => typeof x === "number");
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}
export function groupSeatsIn(p: Poll, ids: string[]): number | null {
  return sumPresent([...new Set(ids)].map((id) => seatsIn(p, id)));
}
export function bucketLatest<T>(source: T[], endOf: (p: T) => string, keyOf: (p: T) => string, t: number, days = POLL_WINDOW_DAYS): T[] {
  const map = new Map<string, T>();
  for (const p of source) {
    const e = toTime(endOf(p));
    if (e > t || e <= t - days * DAY) continue;
    const k = keyOf(p);
    const cur = map.get(k);
    if (!cur || endOf(p) > endOf(cur)) map.set(k, p);
  }
  return [...map.values()];
}
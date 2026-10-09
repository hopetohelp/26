import { largestRemainder, TOTAL } from "./fillAll";

/**
 * 120 מושבים בחצי עיגול: מיקום קבוע לכל מושב, מימין לשמאל ומהשורה הפנימית החוצה (שש שורות).
 * משותף ללוח ההשערה, לתמונת השיתוף ולבית. cx,cy = מרכז חצי העיגול ב-viewBox.
 */
export const HEMI_ROWS = 6;

export interface Seat {
  x: number;
  y: number;
  /** זווית: 0 = הקצה הימני, π = הקצה השמאלי */
  a: number;
  r: number;
}

export function hemicycleSeats(cx = 1.1, cy = 1.07): Seat[] {
  const radii = Array.from({ length: HEMI_ROWS }, (_, i) => 0.44 + (i * 0.56) / (HEMI_ROWS - 1));
  const per = largestRemainder(TOTAL, Object.fromEntries(radii.map((r, i) => [String(i), r])));
  const out: Seat[] = [];
  radii.forEach((r, i) => {
    const n = per[String(i)];
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? Math.PI / 2 : (k / (n - 1)) * Math.PI;
      out.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), a, r });
    }
  });
  return out.sort((p, q) => p.a - q.a || q.r - p.r);
}

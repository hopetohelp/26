/**
 * 120 המושבים בצורת פרסה, כמו אולם המליאה (הכרעת בעלים 11.10.2026, מחליפה את חצי העיגול): קשת עליונה של ארבע שורות
 * (13, 11, 9 ו-7 מושבים) ושני אגפים של 40 מושבים כל אחד (שורות של 1, 2, 3, 4 ×7, 3, 2, 1). משותף ללוח ההשערה, לתמונת השיתוף ולבית.
 * הקואורדינטות ב-`HALL`: רוחב וגובה ה-viewBox, ורדיוס מושב. הסדר: מהקצה הימני התחתון, למעלה לאורך האגף הימני, מעל הקשת, ולמטה באגף השמאלי.
 */
export const HEMI_SEATS = 120;

export interface Seat {
  x: number;
  y: number;
  /** סדר לאורך הפרסה: 0 = המושב הימני התחתון, π = השמאלי התחתון */
  a: number;
  /** מרחק ממרכז החלל הפנימי */
  r: number;
}

// הצורה נבנית ברשת (מרחק בין מושבים = 1) ואז מוקטנת כך שרדיוס מושב = 0.038, כמו בכל לוחות המושבים באתר
const STEP = 1;
const RAISE = 9.7 / 77.7; // כמה הקשת והאגפים "מתעגלים" לכל מושב
const SEAT_R = 0.038;
const PAD = 0.02;

function grid(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  // הקשת העליונה: שורות מהחיצונית (13) פנימה (7), כל שורה גבוהה יותר במרכזה
  for (let j = 0; j < 4; j++) {
    const n = 13 - 2 * j;
    for (let i = 0; i < n; i++) {
      const o = i - (n - 1) / 2;
      pts.push({ x: o * STEP, y: j * STEP + Math.abs(o) * RAISE });
    }
  }
  // שני האגפים: שורות אופקיות, רחבות באמצע וצרות בקצוות; האגף השמאלי והימני תמונת מראה
  const wing = [1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 3, 2, 1];
  wing.forEach((c, m) => {
    const y = 2.008 + m * STEP;
    const x0 = -7.9 + Math.abs(m - 6) * RAISE; // המושב השמאלי ביותר בשורה, יחסית לאמצע
    for (let i = 0; i < c; i++) {
      const x = x0 + i * STEP;
      pts.push({ x, y }, { x: -x, y });
    }
  });
  return pts;
}

function build() {
  const g = grid();
  const k = SEAT_R / 0.418; // 0.418 = רדיוס מושב ביחידות הרשת
  const minX = Math.min(...g.map((p) => p.x)), maxX = Math.max(...g.map((p) => p.x));
  const minY = Math.min(...g.map((p) => p.y)), maxY = Math.max(...g.map((p) => p.y));
  const w = (maxX - minX) * k + 2 * (SEAT_R + PAD);
  const h = (maxY - minY) * k + 2 * (SEAT_R + PAD);
  const pts = g.map((p) => ({ x: (p.x - minX) * k + SEAT_R + PAD, y: (p.y - minY) * k + SEAT_R + PAD }));
  const cx = w / 2;
  const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  // זווית מהכיוון הימני נגד כיוון השעון; מה שמתחת לקו האופקי משמאל ממשיך אחרי הקשת (אין מושבים ישר מתחת למרכז)
  const polar = pts.map((p) => {
    const t = Math.atan2(cy - p.y, p.x - cx);
    return { ...p, t: t < -Math.PI / 2 ? t + 2 * Math.PI : t, r: Math.hypot(p.x - cx, p.y - cy) };
  });
  // סדר: לפי הזווית סביב מרכז החלל הפנימי, מהחיצוני לפנימי בתוך אותה זווית
  const tMin = Math.min(...polar.map((p) => p.t)), tMax = Math.max(...polar.map((p) => p.t));
  const seats: Seat[] = polar
    .map((p) => ({ x: p.x, y: p.y, a: tMax === tMin ? 0 : ((p.t - tMin) / (tMax - tMin)) * Math.PI, r: p.r }))
    .sort((p, q) => p.a - q.a || q.r - p.r);
  return { seats, hall: { w, h, cx, cy, r: SEAT_R } };
}

const built = build();
/** מידות הלוח: רוחב וגובה ה-viewBox, מרכז החלל הפנימי (cx, cy) ורדיוס מושב */
export const HALL = built.hall;
export const hemicycleSeats = (): Seat[] => built.seats;

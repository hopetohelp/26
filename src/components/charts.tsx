/** סוגי הנתונים של גרף המגמה האחיד (`CandleTrend`). */
export interface TrendPoint {
  t: number;
  /** ממוצע החלון */
  v: number;
  estimated?: boolean;
  breakBefore?: boolean;
  /** הנמוך והגבוה בין הסקרים בחלון (טווח מלא), `n` = כמה סקרים בחלון, ו-`xs` = הערך בכל סקר: מזה נבנה הנר ועוביו בכל קטע */
  lo?: number;
  hi?: number;
  n?: number;
  xs?: number[];
  /** ממוצע הסקרים הגולמי, כשהוא שונה מהממוצע שבנקודה (`v`, ממוצע המודל): מוצג בחלון הנקודה, כי הסכומים בסקרים אינם מותאמים ל-120 */
  raw?: number;
}

export interface Series {
  id: string;
  name: string;
  points: TrendPoint[];
  dashed?: boolean;
  /** מזהה הצבע (ברירת מחדל: id) — לקו "מרכיבים" באותו צבע של הרשימה */
  colorId?: string;
  /** צבע מפורש (גובר על colorId): כך הצבע במקרא ובבחירה זהה לצבע בגרף */
  color?: string;
  /** תווית הקצה (ברירת מחדל: השם והערך האחרון) */
  endLabel?: string;
}

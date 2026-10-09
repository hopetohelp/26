/**
 * "הסקרים מול התוצאות" (הכרעת בעלים 9.10.2026, החלטה 8): לכל רשימה, התוצאה הרשמית ביחס לממוצע הסקרים ערב הבחירות,
 * והטווח = הנמוך והגבוה בין הסקרים (לא טווח טעות סטטיסטי). אין כאן חישוב חדש: הכול מ-`compareLists` ב-`history.ts`
 * (ממוצע, נמוך, גבוה, תוצאה), ורק מוחסר הממוצע כדי שההפרשים יראו את הסטייה.
 */
export interface DevInput {
  id: string;
  name: string;
  /** ממוצע הסקרים; NaN אם אף מכון לא שאל עליה */
  estimate: number;
  min: number;
  max: number;
  actual: number;
  /** כמה מכונים שאלו על הרשימה */
  n: number;
}

export interface DevRow extends DevInput {
  /** התוצאה פחות ממוצע הסקרים: חיובי = יצאה יותר מהסקרים */
  dev: number;
  /** הטווח ביחס לממוצע */
  lo: number;
  hi: number;
  /** התוצאה מחוץ לטווח הסקרים */
  outside: boolean;
}

export function deviation(rows: DevInput[]) {
  const asked: DevRow[] = rows
    .filter((r) => r.n > 0)
    .map((r) => ({ ...r, dev: r.actual - r.estimate, lo: r.min - r.estimate, hi: r.max - r.estimate, outside: r.actual < r.min || r.actual > r.max }));
  const outside = asked.filter((r) => r.outside).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev) || b.actual - a.actual);
  const inside = asked.filter((r) => !r.outside).sort((a, b) => b.actual - a.actual);
  const notAsked = rows.filter((r) => r.n === 0);
  /** חצי ציר הסטייה: 3 לפחות, ומעל הסטייה והטווח הגדולים ביותר */
  const bound = Math.max(3, Math.ceil(Math.max(...asked.flatMap((r) => [Math.abs(r.dev), Math.abs(r.lo), Math.abs(r.hi)]), 0) + 0.5));
  return { outside, inside, notAsked, askedCount: asked.length, bound };
}

/** הכותרת היא הממצא */
export function finding(outside: number, asked: number): string {
  if (asked === 0) return "אין סקרים להשוואה במערכת הזו.";
  if (outside === 0) return `בכל ${asked} הרשימות התוצאה הייתה בתוך טווח הסקרים.`;
  return `ב-${outside} מתוך ${asked} רשימות התוצאה יצאה מחוץ לטווח הסקרים.`;
}

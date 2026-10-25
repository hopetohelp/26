/** כל העמודים באתר — מקור לניווט הראשי (Layout). */
export interface PageInfo {
  to: string;
  label: string;
  /** תווית קצרה לסרגל במחשב (הכרעת בעלים 9.10.2026, החלטה 5); ברשימה המלאה נשארת התווית המלאה */
  short?: string;
}

/** הסדר כאן הוא סדר הסרגל במחשב (הכרעת בעלים 8.10.2026) */
export const PAGES: PageInfo[] = [
  { to: "/guess", label: "הניחוש שלי" },
  { to: "/polls", label: "סקרים" },
  { to: "/past", label: "בחירות קודמות" },
  { to: "/method", label: "מידע" },
];

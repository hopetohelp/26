/** כל העמודים באתר — מקור אחד לניווט במחשב ול"עוד" בטלפון (Layout). */
export interface PageInfo {
  to: string;
  label: string;
  /** תווית קצרה לסרגל במחשב (הכרעת בעלים 9.10.2026, החלטה 5); בחלון "עוד" בטלפון נשארת התווית המלאה */
  short?: string;
}

/** הסדר כאן הוא סדר הסרגל במחשב והרשימה ב"עוד" (הכרעת בעלים 8.10.2026) */
export const PAGES: PageInfo[] = [
  { to: "/guess", label: "הכנסת שלי" },
  { to: "/community", label: "סקר האתר" },
  { to: "/today", label: "המצב והתרחישים", short: "המצב היום" },
  { to: "/polls", label: "סקרים ומגמות", short: "סקרים" },
  { to: "/past", label: "בחירות קודמות" },
  { to: "/changes", label: "מה השתנה מהבחירות האחרונות", short: "מה השתנה" },
  { to: "/method", label: "שיטה, מקורות ואודות", short: "שיטה ואודות" },
];

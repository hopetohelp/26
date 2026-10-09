/** כל העמודים באתר — מקור אחד לניווט במחשב ול"עוד" בטלפון (Layout). */
export interface PageInfo {
  to: string;
  label: string;
}

/** הסדר כאן הוא סדר הסרגל במחשב והרשימה ב"עוד" (הכרעת בעלים 8.10.2026) */
export const PAGES: PageInfo[] = [
  { to: "/guess", label: "הכנסת שלי" },
  { to: "/community", label: "סקר האתר" },
  { to: "/today", label: "המצב והתרחישים" },
  { to: "/polls", label: "סקרים ומגמות" },
  { to: "/past", label: "בחירות קודמות" },
  { to: "/changes", label: "מה השתנה מהבחירות האחרונות" },
  { to: "/method", label: "שיטה, מקורות ואודות" },
];

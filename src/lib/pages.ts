import { guessClosed } from "./guessClosed";
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
  { to: "/polls", label: "הסקרים" },
  { to: "/past", label: "מה השתנה" },
  { to: "/method", label: "מידע" },
];

/**
 * קטלוג הניווט האחד (תוכנית מאוחדת, פרק ב): מסך, כתובת קנונית, לשוניות ודרישת מתקדם.
 * הניווט, המתג וההפניות מכתובות ישנות קוראים מכאן — לא מרשימות נפרדות בכל רכיב.
 * `nav`: "core" — שלושת מסכי הליבה בסרגל; "more" — תחת "עוד" (במתקדם בלבד); "foot" — קישור קבוע בתחתית המסך.
 */
export interface ScreenTab { id: string; label: string; advanced?: boolean }
export interface Screen {
  id: string;
  to: string;
  label: string;
  /** תווית קצרה לסרגל בטלפון */
  short?: string;
  icon: string;
  nav: "core" | "more" | "foot";
  /** המסך כולו רק במתקדם */
  advanced?: boolean;
  /** המסך רק בתצוגה הממוקדת (במתקדם הוא לשונית במסך אחר) */
  simple?: boolean;
  /** הלשונית הראשונה היא ברירת המחדל (בלי ?tab=) */
  tabs?: ScreenTab[];
}
export const SCREENS: Screen[] = [
  // הלשונית הימנית, "תוצאות אמת" (הכרעת בעלים 28.10.2026)
  { id: "results2026", to: "/results-2026", label: "תוצאות אמת", icon: "board", nav: "core" },
  { id: "guess", to: "/guess", label: "הניחוש שלי", icon: "guess", nav: "core" },
  // בתצוגה הממוקדת: לשונית גלויה עם מסך "מה השתנה" בלבד (הכרעת בעלים 28.10.2026)
  { id: "changes", to: "/changes", label: "מה השתנה", icon: "board", nav: "core", simple: true },
  // בסרגל רק בניתוח מורחב; המסך נשאר זמין בכתובת שלו (הכרעת בעלים 28.10.2026)
  { id: "community", to: "/community", label: "הניחושים", icon: "bars", nav: "core", advanced: true },
  // "האחרונים" (לשעבר מסך הבית "תמונת מצב") — הלשונית הראשונה של "סקרים" (הכרעת בעלים 28.10.2026)
  { id: "polls", to: "/polls", label: "הסקרים", icon: "bars", nav: "more", advanced: true, tabs: [{ id: "latest", label: "אחרונים" }, { id: "trends", label: "מגמות" }, { id: "archive", label: "ארכיון" }] },
  { id: "past", to: "/past", label: "מה השתנה", icon: "board", nav: "more", advanced: true, tabs: [{ id: "results", label: "תוצאות אמת" }, { id: "accuracy", label: "דיוק הסקרים" }, { id: "changes", label: "מה השתנה" }] },
  { id: "method", to: "/method", label: "מידע ומקורות", icon: "info", nav: "foot" },
];
export const screen = (id: string): Screen => SCREENS.find(s => s.id === id)!;
/** המסכים בסרגל: הליבה תמיד; הנוספים ("עוד" בטלפון, בשורה במחשב) — רק במתקדם */
export function navScreens(advanced: boolean, now = Date.now(), guessShown = false): Screen[] {
  // ב-21:58 "הניחוש שלי" יורד מהסרגל; "תוצאות" מוצג תמיד (הכרעות בעלים 27.10.2026)
  return SCREENS.filter(s => (advanced ? !s.simple : !s.advanced) && (s.nav === "core" || (advanced && s.nav === "more")) && !(s.id === "guess" && guessClosed(now) && !guessShown));
}
/** לשוניות מסך לפי המצב: במתקדם כולן, בממוקדת רק אלה שאינן מתקדמות */
export function screenTabs(s: Screen, advanced: boolean): ScreenTab[] {
  return (s.tabs ?? []).filter(t => advanced || !t.advanced);
}

import { guessClosed, resultsScreenOpen } from "./guessClosed";
import results2026 from "../../raw/results-2026.json";
/** תוצאות אמת הוזנו (raw/results-2026.json) ⇐ "הניחוש שלי" מציג את דיוק הניחושים */
export const RESULTS_READY = results2026.status !== "none" && Object.keys(results2026.seats).length > 0;
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
  /** הלשונית הראשונה היא ברירת המחדל (בלי ?tab=) */
  tabs?: ScreenTab[];
}
export const SCREENS: Screen[] = [
  // בטלפון "בית" (הכרעת בעלים 25.10.2026)
  { id: "home", to: "/", label: "תמונת מצב", short: "בית", icon: "home", nav: "core" },
  { id: "guess", to: "/guess", label: "הניחוש שלי", icon: "guess", nav: "core" },
  { id: "community", to: "/community", label: "ממוצע הניחושים", icon: "bars", nav: "core" },
  // זמני עד שלב 3, שבו הסקרים עוברים ללשוניות תמונת מצב (השוואת מכונים · מגמות · ארכיון)
  { id: "polls", to: "/polls", label: "סקרים", icon: "bars", nav: "more", advanced: true, tabs: [{ id: "today", label: "היום" }, { id: "trends", label: "מגמות" }, { id: "archive", label: "ארכיון" }] },
  { id: "past", to: "/past", label: "בחירות קודמות", icon: "board", nav: "more", advanced: true, tabs: [{ id: "results", label: "תוצאות אמת" }, { id: "accuracy", label: "דיוק הסקרים" }, { id: "changes", label: "מה השתנה" }] },
  { id: "method", to: "/method", label: "מידע ומקורות", icon: "info", nav: "foot" },
];
export const screen = (id: string): Screen => SCREENS.find(s => s.id === id)!;
/** המסכים בסרגל: הליבה תמיד; הנוספים ("עוד" בטלפון, בשורה במחשב) — רק במתקדם */
export function navScreens(advanced: boolean, now = Date.now(), withResults = RESULTS_READY): Screen[] {
  // 21:58–22:00 "הניחוש שלי" מוסתר; מ-22:00 חוזר — דיוק הניחושים, או הודעה עד פרסום התוצאות (הכרעות בעלים 27.10.2026)
  return SCREENS.filter(s => (s.nav === "core" || (advanced && s.nav === "more")) && !(s.id === "guess" && guessClosed(now) && !resultsScreenOpen(now) && !withResults));
}
/** לשוניות מסך לפי המצב: במתקדם כולן, בממוקדת רק אלה שאינן מתקדמות */
export function screenTabs(s: Screen, advanced: boolean): ScreenTab[] {
  return (s.tabs ?? []).filter(t => advanced || !t.advanced);
}

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
  // שלושת מסכי הבחירות (בורר המערכת בפס העליון) ואזור הניחושים — הכרעות בעלים 02.11.2026
  { to: "/results", label: "תוצאות" },
  { to: "/changes", label: "מה השתנה" },
  { to: "/polls", label: "סקרים" },
  { to: "/guess", label: "הניחוש שלי" },
  { to: "/surveys/guesses", label: "מה יהיו תוצאות הבחירות?" },
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
  // שלושה מסכים אחידים לכל מערכת, לפי בורר המערכת שבפס העליון (הכרעות בעלים 02.11.2026, docs/תוכנית-לשוניות-ניתוח-אחיד-02-11-2026.md).
  // הניחושים עברו לאזור הניחושים (guessAreaTabs; "מה יהיו תוצאות הבחירות?" — #/surveys/guesses).
  { id: "results", to: "/results", label: "תוצאות", icon: "board", nav: "core" },
  { id: "changes", to: "/changes", label: "מה השתנה", icon: "board", nav: "core" },
  { id: "polls", to: "/polls", label: "סקרים", icon: "bars", nav: "core" },
  { id: "method", to: "/method", label: "מידע ומקורות", icon: "info", nav: "foot" },
];
export const screen = (id: string): Screen => SCREENS.find(s => s.id === id)!;
/**
 * לשוניות אזור הניחושים והסקרים (הכרעות בעלים 02.11.2026): כל מה שקשור לניחושים יצא מאזור הבחירות לכאן.
 * אין לשונית נפרדת לסקר או לניחוש — לכולם מגיעים דרך "כל הסקרים" (שם גם "מה יהיו תוצאות הבחירות?", אותו מסך כמו /community).
 * "הניחוש שלי" — רק כשהוא פתוח (נסגר ב-21:58 ביום הבחירות, הכרעת בעלים 27.10.2026), או כשהמתג במסך הניהול מציג אותו.
 */
export const GUESS_AREA_TABS = [
  { to: "/surveys", label: "כל הסקרים" },
  { to: "/guess", label: "הניחוש שלי" },
];
export function guessAreaTabs(now = Date.now(), guessShown = false) {
  return GUESS_AREA_TABS.filter(t => t.to !== "/guess" || !guessClosed(now) || guessShown);
}
/** המסכים בסרגל: הליבה תמיד; הנוספים ("עוד" בטלפון, בשורה במחשב) — רק במתקדם */
export function navScreens(advanced: boolean, now = Date.now(), guessShown = false): Screen[] {
  // ב-21:58 "הניחוש שלי" יורד מהסרגל; "תוצאות" מוצג תמיד (הכרעות בעלים 27.10.2026)
  return SCREENS.filter(s => (advanced ? !s.simple : !s.advanced) && (s.nav === "core" || (advanced && s.nav === "more")) && !(s.id === "guess" && guessClosed(now) && !guessShown));
}
/** לשוניות מסך לפי המצב: במתקדם כולן, בממוקדת רק אלה שאינן מתקדמות */
export function screenTabs(s: Screen, advanced: boolean): ScreenTab[] {
  return (s.tabs ?? []).filter(t => advanced || !t.advanced);
}

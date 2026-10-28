/**
 * דשבורד הסטטיסטיקה (הכרעת בעלים 28.10.2026): השמות, הנושאים וההגדרות של כל נתון — מקור אחד למסך הניהול.
 * הנתונים עצמם מחושבים בשרת (worker/shared/stats.js); "היום" = מחצות בשעון ישראל. השמירות נספרות עד 27/10 22:00.
 */
export type StatKey =
  | "pageHits" | "pageHitsUser" | "browsers" | "visitsUser"
  | "users" | "savers" | "guess" | "vote22" | "vote26" | "saveOps"
  | "videoGuess" | "videoResults" | "imgGuess" | "imgResults" | "imgChanges"
  | "failures" | "blocked" | "relaySaved" | "blindSaved";

/** key: נתון מהרשימה, או "screen:<כתובת>" — כניסות למסך אחד */
export interface StatSeries { key: StatKey | `screen:${string}`; total: number; today: number; points: number[] }
export interface StatsData { buckets: string[]; series: StatSeries[]; crowd?: boolean }

export type StatTopic = "entries" | "saves" | "share" | "faults";
export const STAT_TOPICS: { id: StatTopic; label: string; note: string }[] = [
  { id: "entries", label: "כניסות", note: "דפדפן = מכשיר; מי שנכנס מטלפון וממחשב נספר פעמיים" },
  { id: "saves", label: "משתמשים ושמירות", note: "שמירות — עד 27/10 22:00" },
  { id: "share", label: "שיתוף", note: "מחוברים ולא מחוברים יחד" },
  { id: "faults", label: "תקלות", note: "נפילות — מאז האיפוס" },
];

export const STAT_METRICS: { key: StatKey; label: string; topic: StatTopic; help: string }[] = [
  { key: "pageHits", label: "כניסות עמוד", topic: "entries", help: "כל פתיחה של מסך באתר, כולל מעבר בין מסכים." },
  { key: "browsers", label: "כניסות דפדפן", topic: "entries", help: "דפדפנים שונים שנכנסו לאתר. כל דפדפן נספר פעם אחת, ברגע הכניסה הראשונה." },
  { key: "visitsUser", label: "כניסות משתמש", topic: "entries", help: "כניסות של חשבונות, עם הפרש של חצי שעה לפחות בין כניסות של אותו חשבון. מ-25/10." },
  { key: "pageHitsUser", label: "כניסות עמוד עם חשבון", topic: "entries", help: "כניסות עמוד מדפדפן שיש בו חשבון באתר. נספר מ-28/10; ההפרש מ\"כניסות עמוד\" = אורחים." },
  { key: "users", label: "משתמשים", topic: "saves", help: "חשבונות רשומים באתר (כולל אורחים שנוצר להם חשבון)." },
  { key: "savers", label: "שמרו", topic: "saves", help: "חשבונות ששמרו משהו לפחות פעם אחת: ניחוש, גושים או הצבעה." },
  { key: "guess", label: "ניחוש", topic: "saves", help: "ניחושים שנספרים בממוצע הניחושים (לא ממתינים ולא נדחו)." },
  { key: "vote22", label: "הצבעה 22", topic: "saves", help: "חשבונות שמילאו למי הצביעו בבחירות 2022." },
  { key: "vote26", label: "הצבעה 26", topic: "saves", help: "חשבונות שמילאו למי הצביעו בבחירות 2026." },
  { key: "saveOps", label: "פעולות שמירה", topic: "saves", help: "כל לחיצה על שמירה; כל שינוי נספר שוב." },
  { key: "videoGuess", label: "סרטון ניחוש", topic: "share", help: "סרטוני הנתונים והניחוש שנוצרו." },
  { key: "videoResults", label: "סרטון תוצאות", topic: "share", help: "סרטוני דיוק הניחושים שנוצרו במסך התוצאות." },
  { key: "imgGuess", label: "תמונת ניחוש", topic: "share", help: "תמונות ניחוש שהורדו או שותפו. נספר מ-28/10." },
  { key: "imgResults", label: "תמונת תוצאות", topic: "share", help: "תמונות דיוק הניחושים שנשמרו או שותפו. נספר מ-28/10." },
  { key: "imgChanges", label: "תמונת מה השתנה", topic: "share", help: "תמונות מסך \"מה השתנה\" שנשמרו או שותפו. נספר מ-28/10 בערב." },
  { key: "failures", label: "נפילות", topic: "faults", help: "דיווחי כשל חיבור אוטומטיים." },
  { key: "blocked", label: "חסימה מלאה", topic: "faults", help: "בדיקות חיבור שבהן כל המסלולים נחסמו." },
  { key: "relaySaved", label: "נשמר בעקיפה", topic: "faults", help: "שמירות שעברו במסלול עוקף." },
  { key: "blindSaved", label: "נשמר בלי תשובה", topic: "faults", help: "שמירות שנשלחו בלי לקבל תשובה מהשרת." },
];
export const statLabel = (k: StatKey) => STAT_METRICS.find((m) => m.key === k)?.label ?? k;

/** שמות המסכים לכניסות לפי מסך (כתובת ⇐ שם בסרגל); כתובת שאינה ברשימה מוצגת כמו שהיא */
const SCREEN_NAMES: Record<string, string> = {
  "/": "כניסה בלי מסך", "/results-2026": "תוצאות אמת", "/guess": "הניחוש שלי", "/changes": "מה השתנה", "/community": "הניחושים",
  "/polls": "הסקרים", "/past": "בחירות קודמות", "/method": "מידע ומקורות", "/ai": "עוזר AI", "/account": "אישי",
  "/today": "היום (כתובת ישנה)", "/calculator": "מחשבון (כתובת ישנה)", "/trends": "מגמות (כתובת ישנה)", "/thread": "שיחה", "/support": "תמיכה (כתובת ישנה)", "/feedback": "הערות (כתובת ישנה)",
};
export const screenName = (key: string) => { const p = key.replace(/^screen:/, ""); return SCREEN_NAMES[p] ?? p; };

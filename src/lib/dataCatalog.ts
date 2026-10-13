/** חוזה הנתונים המשותף למסכים, למילון ולנתונים הפתוחים. אינו תלוי ב-React. */
export const METHOD_VERSION = "averages-1";
export const POLL_WINDOW_DAYS = 14;
export const SUPPORT_RECONSTRUCTION = { method: "inverse-law-or-ratio-1", othersDefaultPct: 1.5, validVotes: 10_000_000, missing: "available-mean-or-zero", tie: "lottery-required" } as const;
export const DATA_PRODUCTS = {
  "polls.mean": { name: "ממוצע סקרים", explain: "מה הסקרים אומרים", method: "current", unit: "מנדטים", input: "הסקר האחרון של כל סדרת מכון ומזמין ב-14 הימים האחרונים", missing: "הממוצע מחושב מתצפיות זמינות; בגוש נספר סקר ששאל לפחות רשימה אחת, והיתר כאפס. ללא תצפית לרשימה בחלון — 0 כהנחת תצוגה", calculation: "pollSeatSummary", assumption: "משקל שווה לכל סדרה; ממוצע חשבוני, ללא התאמה ל-120", source: "הסקרים שפורסמו, עם קישור לפרסום המקורי" },
  "polls.adjusted": { name: "ממוצע מותאם", explain: "איך הממוצע מתחלק ל־120 מושבים", method: "adjusted", unit: "מנדטים", input: "ממוצע תמיכה בקולות הכשרים מקבוצת סקרים משותפת", missing: "חסר מושלם מתמיכה בסקרים הזמינים; ללא תצפית — 0 כהנחת השלמה. הנתון מוצג כרגיל, ההסבר באייקון מידע", calculation: "adjustedAverage", assumption: "תמיכה מדווחת, משוחזרת או מושלמת מסקרים זמינים; חלוקה לפי הסף, הסכמי העודפים ובאדר־עופר; תיקו אינו מוכרע בסתר", source: "הסקרים שפורסמו ומנוע חלוקת המנדטים" },
  "model.mean": { name: "ממוצע המודל", explain: "מה המודל מעריך", method: "model", unit: "מנדטים", input: "התצפיות והפרמטרים שפורסמו ב-model.json", missing: "לפי מנגנון התצפיות של המודל הקיים", calculation: "model.central", assumption: "החלקה לאורך זמן ותיקון השפעת סדרת מכון ומזמין; אינו המשך מגמה ליום הבחירות", source: "מודל האתר על בסיס הסקרים שפורסמו" },
  "poll.single": { name: "סקר ממקור מסוים", explain: "הסקר האחרון של המקור שבחרתם", method: "current", unit: "מנדטים", input: "הסדרה שנבחרה בחלון הסקרים", missing: "ללא החלפה בסקר ישן או במקור אחר", calculation: "latestPerPollster", assumption: "בחירה במכון עם מספר מזמינים מאגדת את הסקר האחרון מכל סדרה במשקל שווה", source: "הסקרים שפורסמו, עם קישור לפרסום המקורי" },
} as const;
export type ProductId = keyof typeof DATA_PRODUCTS;
export type AverageId = Exclude<ProductId, "poll.single">;
export const SCREEN_POLICY = {
  home: ["polls.mean", "polls.adjusted", "model.mean"],
  today: ["polls.mean", "poll.single"],
  scenarios: [],
  polls: ["poll.single"],
  trends: ["polls.mean", "poll.single"],
  changes: ["polls.mean", "polls.adjusted", "model.mean", "poll.single"],
  guess: ["polls.mean", "polls.adjusted", "model.mean", "poll.single"],
  community: ["polls.mean", "poll.single"],
  groups: ["polls.mean", "poll.single"],
  past: [],
  method: ["polls.mean", "polls.adjusted", "model.mean", "poll.single"],
} as const satisfies Record<string, readonly ProductId[]>;
export type DataScreen = keyof typeof SCREEN_POLICY;
export function sourceAllowed(screen: DataScreen, product: ProductId): boolean {
  return (SCREEN_POLICY[screen] as readonly ProductId[] | undefined)?.includes(product) ?? false;
}
/** סדר שדות אינו משנה את זהות הקלט או הבקשה. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function identity(value: unknown): string {
  let h = 2166136261;
  for (const c of canonical(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}
export const MAJORITY_SEATS = 61;
export const NUMBER_KINDS = ["נתון רשמי", "חישוב לפי החוק", "סיכום סקרים", "תרחיש", "השוואה", "מודל המגמות", "השערות משתתפים, אינן סקר", "תשובות משתתפים במדגם עצמי, לא מייצג, ללא דגימה וללא שקלול"] as const;

export const PUBLIC_METRICS = {
  "official.results.seats": { path: "data/results.json", name: "תוצאות רשמיות", method: "results", unit: "מנדטים", kind: "נתון רשמי", screens: ["past", "changes", "guess", "community", "method"] },
  "official.results.support": { path: "data/results.json", name: "תוצאות רשמיות", method: "results", unit: "אחוזים", kind: "נתון רשמי", screens: ["past", "changes", "guess", "community", "method"] },
  "scenario.model.seatsMean": { path: "data/scenarios.json", name: "ממוצע תרחישי המודל", method: "model", unit: "מנדטים", kind: "תרחיש", screens: ["scenarios", "home", "method"] },
  "scenario.model.pass": { path: "data/scenarios.json", name: "שיעור תרחישים", method: "model", unit: "אחוזים", kind: "תרחיש", screens: ["scenarios", "home", "method"] },
  "crowd.guesses.seats": { path: "dashboard.json", name: "השערות משתתפים", method: "crowd", unit: "מנדטים", kind: "השערות משתתפים, אינן סקר", screens: ["home", "guess", "community", "groups", "method"] },
} as const;

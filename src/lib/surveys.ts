/**
 * סקרי האתר (הכרעת בעלים 01.11.2026: האתר עורך סקרים; docs/תוכנית-אתר-סקרי-הגזרה-01-11-2026.md).
 * הטיפוסים והקריאות לשרת המשתתפים (worker/crowd/lib/surveys.js), וחישוב סכום הקואליציה — מקור אחד לכל המסכים.
 */
import { call } from "./crowdApi";
import { results2026, hasResults } from "./guessAccuracyData";
import promisesFile from "../../raw/election-promises.json";

export interface SurveyOption { id: string; label: string; sub?: string; seats?: number }
export type SurveyQuestion =
  | { id: string; kind: "single"; title: string; options: SurveyOption[] }
  /** בחירה מטווח מספרים (הכרעת בעלים 01.11.2026) */
  | { id: string; kind: "range"; title: string; min: number; max: number; step: number; minLabel?: string; maxLabel?: string }
  | { id: string; kind: "assign"; title: string; items: SurveyOption[]; columns: SurveyOption[] };
/** סקר, או ניחוש שאליו המנהל מוסיף תוצאות אמת (הכרעת בעלים 01.11.2026) */
export type SurveyKind = "survey" | "guess";
/** מתי רואים תוצאות: כולם עכשיו / כולם אחרי הסגירה / רק מי שענה */
export type SurveyVisibility = "now" | "after_close" | "answered";
export const KIND_LABELS: [SurveyKind, string][] = [["survey", "סקר"], ["guess", "ניחוש"]];
export const kindLabel = (k: SurveyKind) => KIND_LABELS.find(([x]) => x === k)![1];
export const VISIBILITY_LABELS: [SurveyVisibility, string][] = [["now", "כולם, עכשיו"], ["after_close", "כולם, אחרי הסגירה"], ["answered", "רק מי שענה"]];
export const STATUS_LABELS: [Survey["status"], string][] = [["draft", "טיוטה"], ["open", "פתוח"], ["closed", "נסגר"]];
/** מי מחוץ לקבוצה רשאי: כלום / צפייה בסקר ובתוצאות / השתתפות (הכרעת בעלים 01.11.2026; קובע מנהל הקבוצה) */
export type SurveyOutside = "none" | "view" | "answer";
export const OUTSIDE_LABELS: [SurveyOutside, string][] = [["none", "כלום"], ["view", "צפייה"], ["answer", "השתתפות"]];
export interface Survey {
  id: string; group: string; status: "draft" | "open" | "closed"; position: number; updatedAt: string; title: string; questions: SurveyQuestion[];
  kind: SurveyKind; closesAt: string | null; visibility: SurveyVisibility; minResults: number; truth?: Record<string, string | number> | null;
  answered?: boolean; manage?: boolean; canAnswer?: boolean; outside?: SurveyOutside;
}
/** תשובה לפריט בשאלת שיוך: עמודה אחת לכל הסיעה, או פיצול {עמודה: מנדטים} (הכרעת בעלים 01.11.2026) */
export type AssignValue = string | Record<string, number>;
export type SurveyAnswers = Record<string, string | number | Record<string, AssignValue>>;
export type QuestionResult = { n: number; counts: Record<string, number>; mean?: number | null } | { n: number; items: Record<string, Record<string, number>> };
export type SurveyResults = { n: number; min: number; hidden: true } | { n: number; questions: Record<string, QuestionResult> };
/** results = null עד שעונים (הכרעת בעלים 01.11.2026) */
export interface SurveyDetail { survey: Survey; participants?: { all: number; group: number; outside: boolean }; results: { all: SurveyResults; group: SurveyResults } | null; mine: { answers: SurveyAnswers; at: string } | null; access: { member: boolean; canAnswer: boolean; manage: boolean; outside?: SurveyOutside } }
export interface SurveyHistory { surveys: Survey[]; answers: { survey: string; at: string; answers: SurveyAnswers }[] }

/**
 * הצגה מיידית (הכרעת בעלים 02.11.2026): כל תשובה מהשרת נשמרת במכשיר, לפי המשתמש; המסך מציג אותה מיד (cached)
 * ומבקש מהשרת גרסה עדכנית ברקע. שמירה וניהול — תמיד ישירות לשרת.
 */
const CACHE = "elections26.surveys.cache:";
const userKey = (token: string | null) => (token ? token.slice(-12) : "anon");
export function cached<T>(path: string, token: string | null): T | null {
  try { const x = localStorage.getItem(CACHE + userKey(token) + path); return x ? (JSON.parse(x) as T) : null; } catch { return null; }
}
async function fresh<T>(path: string, token: string | null): Promise<T> {
  const r = await call<T>(path, { token });
  try { localStorage.setItem(CACHE + userKey(token) + path, JSON.stringify(r)); } catch { /* אין אחסון */ }
  return r;
}
export const surveysPath = "/surveys";
export const surveyPath = (id: string) => `/survey?id=${encodeURIComponent(id)}`;
export const listSurveys = (token: string | null) => fresh<{ surveys: Survey[] }>(surveysPath, token);
export const getSurvey = (id: string, token: string | null) => fresh<SurveyDetail>(surveyPath(id), token);
export const surveyHistory = (token: string) => call<SurveyHistory>("/survey/history", { token });
/** מזהה פעולה לכל שמירה — שליחה חוזרת של אותה שמירה אינה יוצרת כפילות בשרת */
export const newOp = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const answerSurvey = (token: string, survey: string, answers: SurveyAnswers, op = newOp()) =>
  call<{ ok: true; at: string }>("/survey/answer", { token, body: { survey, op, answers } });

/** מנהל קבוצה: מי מחוץ לקבוצה רשאי לראות / להשתתף בסקר */
export const setSurveyOutside = (token: string, group: string, survey: string, outside: SurveyOutside) =>
  call<{ survey: Survey }>("/survey/manage", { token, body: { group, id: survey, outside } });
/** מנהל קבוצה: יצירה, עריכה והגדרות (סוג, מצב, מועד סגירה, מתי רואים תוצאות, סף, גישה, תוצאות אמת) */
export const manageSurvey = (token: string, body: Record<string, unknown>) => call<{ survey: Survey }>("/survey/manage", { token, body });
/** כניסה לסקר — לסטטיסטיקה של המנהלים */
export const viewSurvey = (token: string | null, survey: string, embed: boolean) => call<{ ok: true }>("/survey/view", { token, body: { survey, embed } });
export interface SurveyStats { views: number; viewers: number; embedViews: number; viewsSince: string | null; saves: number; savers: number; saversSinceViews: number; changed: number; members: number; outsiders: number; days: { day: string; views: number; saves: number }[]; hours: { hour: string; views: number; saves: number }[]; groupHours?: { hour: string; views: number; saves: number }[] }
export const surveyStats = (token: string, survey: string) => call<SurveyStats>(`/survey/stats?id=${encodeURIComponent(survey)}`, { token });

/** מועד סגירה לתצוגה ("3.11 22:00"), או null */
export const closesLabel = (s: Pick<Survey, "closesAt">) => (s.closesAt ? answerTime(s.closesAt) : null);

/**
 * מנדטים של פריט בשאלת שיוך: אם יש תוצאות אמת באתר — מהן (מקור האמת היחיד למנדטים, results2026), ואחרת מההגדרה ששמורה בסקר.
 * כך הסכום מתעדכן עם הספירה בלי לערוך את הסקר.
 */
export function itemSeats(item: SurveyOption): number {
  if (hasResults() && item.id in results2026.seats) return results2026.seats[item.id];
  return item.seats ?? 0;
}

/** סכום המנדטים בכל עמודה של שאלת שיוך; סיעה מפוצלת — לפי החלוקה שנבחרה */
export function columnSeats(q: Extract<SurveyQuestion, { kind: "assign" }>, answer: Record<string, AssignValue> | undefined): Record<string, number> {
  const out = Object.fromEntries(q.columns.map((c) => [c.id, 0]));
  for (const item of q.items) {
    const v = answer?.[item.id];
    if (typeof v === "string") { if (v in out) out[v] += itemSeats(item); }
    else if (v) for (const [c, n] of Object.entries(v)) if (c in out) out[c] += n;
  }
  return out;
}

/** האם הסיעה (או חלק ממנה) בעמודה */
export const inColumn = (v: AssignValue | undefined, col: string) => typeof v === "string" ? v === col : !!v && (v[col] ?? 0) > 0;

/**
 * הבטחות בחירות (הכרעת בעלים 01.11.2026): צירוף שסותר הבטחה מפורשת מציג את האומר, הציטוט והמקור, וכפתור "להפר הבטחת בחירות".
 * רק ציטוט מילולי עם מקור מתועד, באישור הבעלים (raw/election-promises.json). שלושה סוגים:
 * never — לא לשבת עם רשימות מסוימות; with — לשבת רק יחד עם רשימה מסוימת; topic — עמדה בנושא (למשל גיוס), שנשברת כשבקואליציה יושבת רשימה שהתחייבה לעמדה הנגדית.
 */
export interface ElectionPromise { id: string; party: string; speaker: string; role?: string; quote: string; date: string; source: string; sourceName: string; never?: string[]; with?: string[]; topic?: string; side?: string }
export const PROMISES = (promisesFile as { promises: ElectionPromise[] }).promises;
/** ההבטחות שהשיוך מפר — רק של רשימות שבעמודת הקואליציה */
export function brokenPromises(answer: Record<string, AssignValue> | undefined, coalition = "coalition", list: ElectionPromise[] = PROMISES): ElectionPromise[] {
  const inC = (id: string) => inColumn(answer?.[id], coalition);
  return list.filter((p) => {
    if (!inC(p.party)) return false;
    if (p.never?.some(inC)) return true;
    if (p.with?.some((x) => !inC(x))) return true;
    if (p.topic) return list.some((q) => q.topic === p.topic && q.side !== p.side && q.party !== p.party && inC(q.party));
    return false;
  });
}

/** מועד תשובה בשעון ישראל: "1.11 14:05" */
const AT = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
export const formatAt = (iso: string) => AT.formatToParts(new Date(iso)).reduce((o, p) => ({ ...o, [p.type]: p.value }), {} as Record<string, string>) as Record<string, string>;
export const answerTime = (iso: string) => { const p = formatAt(iso); return `${p.day}.${p.month} ${p.hour}:${p.minute}`; };
/** "עודכן 2/11", ובאותו יום — "עודכן 12:34" (הכרעת בעלים 02.11.2026) */
export function updatedLabel(iso: string, now = Date.now()): string {
  const p = formatAt(iso), n = formatAt(new Date(now).toISOString());
  return p.day === n.day && p.month === n.month ? `עודכן ${p.hour}:${p.minute}` : `עודכן ${p.day}/${p.month}`;
}

/** רוב בכנסת */
export const MAJORITY = 61;
/** משפט הסכום: מחובר לנתון ("חסרים 8 לרוב"), לא עובדה כללית */
export function majorityLine(seats: number): string {
  if (seats <= 0) return "סמנו רשימות כדי לראות את סכום הקואליציה";
  if (seats >= MAJORITY) return `רוב של ${seats} מנדטים`;
  return `חסרים ${MAJORITY - seats} מנדטים לרוב`;
}

/** מספר סידורי לכל סקר וניחוש (הכרעת בעלים 02.11.2026) = position; מספר 2 — "מה יהיו תוצאות הבחירות?", הניחוש שנסגר ב-27.10 */
export const ELECTION_RESULTS_NUMBER = 2;
export const ELECTION_RESULTS_TITLE = "3. ניחוש: מה יהיו תוצאות הבחירות?";
/** "ניחוש" או "סקר" אחרי המספר (הכרעת בעלים 03.11.2026) */
export const kindPrefix = (kind: string) => (kind === "guess" ? "ניחוש: " : "סקר: ");
export const numbered = (s: Pick<Survey, "position" | "title" | "kind">) => (s.position > 0 ? `${s.position}. ` : "") + kindPrefix(s.kind) + s.title;

/** "12 משתתפים", ובסקר שפתוח גם מחוץ לגזרה — "12 משתתפים - 8 מהגזרה" (הכרעת בעלים 03.11.2026) */
export function participantsLabel(p: { all: number; group: number; outside: boolean }) {
  const n = (k: number) => (k === 1 ? "משתתף אחד" : `${k.toLocaleString("he-IL")} משתתפים`);
  return p.outside ? `${n(p.all)} - ${p.group.toLocaleString("he-IL")} מהגזרה` : n(p.all);
}

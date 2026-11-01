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
  | { id: string; kind: "assign"; title: string; items: SurveyOption[]; columns: SurveyOption[] };
/** מי מחוץ לקבוצה רשאי: כלום / צפייה בסקר ובתוצאות / השתתפות (הכרעת בעלים 01.11.2026; קובע מנהל הקבוצה) */
export type SurveyOutside = "none" | "view" | "answer";
export const OUTSIDE_LABELS: [SurveyOutside, string][] = [["none", "כלום"], ["view", "צפייה"], ["answer", "השתתפות"]];
export interface Survey { id: string; group: string; status: "draft" | "open" | "closed"; position: number; updatedAt: string; title: string; questions: SurveyQuestion[]; answered?: boolean; manage?: boolean; canAnswer?: boolean; outside?: SurveyOutside }
/** תשובה לפריט בשאלת שיוך: עמודה אחת לכל הסיעה, או פיצול {עמודה: מנדטים} (הכרעת בעלים 01.11.2026) */
export type AssignValue = string | Record<string, number>;
export type SurveyAnswers = Record<string, string | Record<string, AssignValue>>;
export type QuestionResult = { n: number; counts: Record<string, number> } | { n: number; items: Record<string, Record<string, number>> };
export type SurveyResults = { n: number; min: number; hidden: true } | { n: number; questions: Record<string, QuestionResult> };
/** results = null עד שעונים (הכרעת בעלים 01.11.2026) */
export interface SurveyDetail { survey: Survey; results: { all: SurveyResults; group: SurveyResults } | null; mine: { answers: SurveyAnswers; at: string } | null; access: { member: boolean; canAnswer: boolean; manage: boolean; outside?: SurveyOutside } }
export interface SurveyHistory { surveys: Survey[]; answers: { survey: string; at: string; answers: SurveyAnswers }[] }

export const listSurveys = (token: string | null) => call<{ surveys: Survey[] }>("/surveys", { token });
export const getSurvey = (id: string, token: string | null) => call<SurveyDetail>(`/survey?id=${encodeURIComponent(id)}`, { token });
export const surveyHistory = (token: string) => call<SurveyHistory>("/survey/history", { token });
/** מזהה פעולה לכל שמירה — שליחה חוזרת של אותה שמירה אינה יוצרת כפילות בשרת */
export const newOp = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const answerSurvey = (token: string, survey: string, answers: SurveyAnswers, op = newOp()) =>
  call<{ ok: true; at: string }>("/survey/answer", { token, body: { survey, op, answers } });

/** מנהל קבוצה: מי מחוץ לקבוצה רשאי לראות / להשתתף בסקר */
export const setSurveyOutside = (token: string, group: string, survey: string, outside: SurveyOutside) =>
  call<{ survey: Survey }>("/survey/manage", { token, body: { group, id: survey, outside } });

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

/** רוב בכנסת */
export const MAJORITY = 61;
/** משפט הסכום: מחובר לנתון ("חסרים 8 לרוב"), לא עובדה כללית */
export function majorityLine(seats: number): string {
  if (seats <= 0) return "סמנו רשימות כדי לראות את סכום הקואליציה";
  if (seats >= MAJORITY) return `רוב של ${seats} מנדטים`;
  return `חסרים ${MAJORITY - seats} מנדטים לרוב`;
}

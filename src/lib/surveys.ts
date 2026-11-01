/**
 * סקרי האתר (הכרעת בעלים 01.11.2026: האתר עורך סקרים; docs/תוכנית-אתר-סקרי-הגזרה-01-11-2026.md).
 * הטיפוסים והקריאות לשרת המשתתפים (worker/crowd/lib/surveys.js), וחישוב סכום הקואליציה — מקור אחד לכל המסכים.
 */
import { call } from "./crowdApi";
import { results2026, hasResults } from "./guessAccuracyData";

export interface SurveyOption { id: string; label: string; sub?: string; seats?: number }
export type SurveyQuestion =
  | { id: string; kind: "single"; title: string; options: SurveyOption[] }
  | { id: string; kind: "assign"; title: string; items: SurveyOption[]; columns: SurveyOption[] };
export interface Survey { id: string; group: string; status: "draft" | "open" | "closed"; position: number; updatedAt: string; title: string; questions: SurveyQuestion[]; answered?: boolean; manage?: boolean }
export type SurveyAnswers = Record<string, string | Record<string, string>>;
export type QuestionResult = { n: number; counts: Record<string, number> } | { n: number; items: Record<string, Record<string, number>> };
export type SurveyResults = { n: number; min: number; hidden: true } | { n: number; questions: Record<string, QuestionResult> };
export interface SurveyDetail { survey: Survey; results: { all: SurveyResults; group: SurveyResults }; mine: { answers: SurveyAnswers; at: string } | null }
export interface SurveyHistory { surveys: Survey[]; answers: { survey: string; at: string; answers: SurveyAnswers }[] }

export const listSurveys = (token: string | null) => call<{ surveys: Survey[] }>("/surveys", { token });
export const getSurvey = (id: string, token: string | null) => call<SurveyDetail>(`/survey?id=${encodeURIComponent(id)}`, { token });
export const surveyHistory = (token: string) => call<SurveyHistory>("/survey/history", { token });
/** מזהה פעולה לכל שמירה — שליחה חוזרת של אותה שמירה אינה יוצרת כפילות בשרת */
export const newOp = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const answerSurvey = (token: string, survey: string, answers: SurveyAnswers, op = newOp()) =>
  call<{ ok: true; at: string }>("/survey/answer", { token, body: { survey, op, answers } });

/**
 * מנדטים של פריט בשאלת שיוך: אם יש תוצאות אמת באתר — מהן (מקור האמת היחיד למנדטים, results2026), ואחרת מההגדרה ששמורה בסקר.
 * כך הסכום מתעדכן עם הספירה בלי לערוך את הסקר.
 */
export function itemSeats(item: SurveyOption): number {
  if (hasResults() && item.id in results2026.seats) return results2026.seats[item.id];
  return item.seats ?? 0;
}

/** סכום המנדטים בכל עמודה של שאלת שיוך */
export function columnSeats(q: Extract<SurveyQuestion, { kind: "assign" }>, answer: Record<string, string> | undefined): Record<string, number> {
  const out = Object.fromEntries(q.columns.map((c) => [c.id, 0]));
  for (const item of q.items) {
    const col = answer?.[item.id];
    if (col && col in out) out[col] += itemSeats(item);
  }
  return out;
}

/** רוב בכנסת */
export const MAJORITY = 61;
/** משפט הסכום: מחובר לנתון ("חסרים 8 לרוב"), לא עובדה כללית */
export function majorityLine(seats: number): string {
  if (seats <= 0) return "סמנו רשימות כדי לראות את סכום הקואליציה";
  if (seats >= MAJORITY) return `רוב של ${seats} מנדטים`;
  return `חסרים ${MAJORITY - seats} מנדטים לרוב`;
}

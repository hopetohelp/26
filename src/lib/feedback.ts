/**
 * כפתור ההערות: הפנייה לשרת (worker/feedback) והקישורים האישיים שנשמרים בדפדפן.
 * הבעלים היחיד של המפתח "elections26.feedback" ב-localStorage.
 */
export const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL as string | undefined;

export interface ThreadMessage {
  author: "team" | "visitor";
  text: string;
  created_at: string;
}
export interface Thread {
  topic: string;
  text: string;
  created_at: string;
  status: "new" | "answered" | "closed";
  messages: ThreadMessage[];
}
export interface SavedThread {
  token: string;
  created: string;
  preview: string;
}

const KEY = "elections26.feedback";

export function savedThreads(): SavedThread[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.token === "string") : [];
  } catch {
    return [];
  }
}

export function saveThread(t: SavedThread) {
  try {
    const all = savedThreads().filter((x) => x.token !== t.token);
    localStorage.setItem(KEY, JSON.stringify([t, ...all].slice(0, 20)));
  } catch {
    /* דפדפן חסום לאחסון — הקישור עדיין מוצג לגולש להעתקה */
  }
}

/**
 * שיחה אחת לכל משתמש: הערה חדשה מצטרפת לשיחה האחרונה השמורה בדפדפן (primaryThread), ולא פותחת שיחה נוספת.
 * הקישור האישי להשערות נושא איתו גם את השיחה (&f=), כך שכניסה בקישור אחד מחזירה את שניהם — גם במכשיר אחר.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const primaryThread = (): SavedThread | null => savedThreads()[0] ?? null;
export const isFeedbackToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);

/** מוסיף לקישור האישי להשערות את השיחה (אם יש) */
export function linkWithFeedback(link: string, token: string | null | undefined): string {
  return isFeedbackToken(token) ? `${link}&f=${encodeURIComponent(token)}` : link;
}

/** נכנסים בקישור אישי שנושא שיחה: שומרים אותה בדפדפן הזה כשיחה הראשית */
export function absorbFeedbackToken(token: string | null) {
  if (!isFeedbackToken(token) || savedThreads().some((x) => x.token === token)) return;
  saveThread({ token, created: new Date().toISOString(), preview: "" });
}

/** הקישור האישי לשיחה, כפי שהגולש מעתיק אותו */
export const threadLink = (token: string) => `${location.origin}${location.pathname}#/feedback/${token}`;

async function post(path: string, body: object): Promise<{ ok: boolean; token?: string; error?: string }> {
  const res = await fetch(`${FEEDBACK_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, token: data.token, error: data.error };
}

export const sendFeedback = (body: { topic: string; text: string; page: string; theme: string; website: string; diagnostic?: string }) => post("/", body);
export const replyToThread = (token: string, text: string, website: string, diagnostic?: string) => post("/thread", { t: token, text, website, diagnostic });

export async function getThread(token: string): Promise<Thread | null> {
  const res = await fetch(`${FEEDBACK_URL}/thread?t=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.ok ? (data as Thread) : null;
}

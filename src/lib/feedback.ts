/**
 * כפתור ההערות: הפנייה לשרת (worker/feedback) והקישורים האישיים שנשמרים בדפדפן.
 * הבעלים היחיד של המפתחות "elections26.feedback" ו-"elections26.feedback.outbox" ב-localStorage.
 */
import { topicMessage } from "./feedbackTopics";

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

let merging: Promise<SavedThread | null> | null = null;
/** איחוד השיחות שהדפדפן מחזיק בקישורים שלהן. אין מחיקת קישור לפני הצלחה בשרת. */
export function mergeSavedThreads(): Promise<SavedThread | null> {
  if (merging) return merging;
  merging = (async () => {
    const items = savedThreads();
    if (items.length < 2 || !FEEDBACK_URL) return items[0] ?? null;
    const res = await post("/merge", { tokens: items.map((t) => t.token) });
    if (!res.ok) throw new Error(res.error || "merge failed");
    const primary = items[0];
    // קישורים שנוספו בזמן הבקשה אינם מוסרים.
    const mergedTokens = new Set(items.map((t) => t.token));
    const added = savedThreads().filter((t) => !mergedTokens.has(t.token));
    try { localStorage.setItem(KEY, JSON.stringify([primary, ...added])); } catch { /* כל הקישורים עדיין תקפים */ }
    return primary;
  })().finally(() => { merging = null; });
  return merging;
}

export async function getThread(token: string): Promise<Thread | null> {
  const res = await fetch(`${FEEDBACK_URL}/thread?t=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.ok ? (data as Thread) : null;
}

/** שיחות חשבון נשמרות באותו שרת הערות. האסימון מועבר בגוף כמו בטופס הרגיל, בלי כותרת זהות בדפדפן. */
export interface AccountSupportThread {
  status: "new" | "answered" | "closed";
  created_at: string;
  updated_at: string;
  messages: ThreadMessage[];
}
export async function accountSupport(token: string, message?: { text: string; op_id: string; website: string }): Promise<AccountSupportThread | null> {
  if (!FEEDBACK_URL) throw new Error("שרת ההערות אינו זמין.");
  const response = await fetch(`${FEEDBACK_URL}/`, {
    method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "account-support", token, ...message }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(response.status === 401 ? "יש להתחבר שוב לחשבון כדי לפתוח את השיחה." : "לא הצלחנו להתחבר לתמיכה. נסו שוב.");
  return data.thread ?? null;
}

export interface FeedbackItem { topic: string; text: string; page: string; theme: string; website: string; diagnostic?: string }

/**
 * שליחת הערה: שיחה אחת לכל משתמש — אם כבר יש שיחה בדפדפן הזה, ההערה מצטרפת אליה (עם הנושא בראשה).
 * מחזיר את אסימון השיחה. כשל רשת נזרק כ-TypeError (fetch) — הקורא מכניס לתור.
 */
export async function deliverFeedback(item: FeedbackItem, max: number): Promise<{ ok: boolean; token?: string }> {
  const prim = await mergeSavedThreads();
  if (prim) {
    const res = await replyToThread(prim.token, topicMessage(item.topic, item.text).slice(0, max), item.website, item.diagnostic);
    if (res.ok) return { ok: true, token: prim.token };
    if (res.error !== "not found") return { ok: false };
  }
  const res = await sendFeedback(item);
  if (res.ok && res.token) saveThread({ token: res.token, created: new Date().toISOString(), preview: item.text.slice(0, 80) });
  return { ok: res.ok, token: res.token };
}

/** תור ההערות: הערה שנכתבה בלי חיבור נשמרת כאן ונשלחת אוטומטית כשהחיבור חוזר (src/lib/outbox.ts). */
const OUTBOX = "elections26.feedback.outbox";
type Queued = { item: FeedbackItem; max: number };
function readOutbox(): Queued[] {
  try {
    const v = JSON.parse(localStorage.getItem(OUTBOX) || "[]");
    return Array.isArray(v) ? v.filter((x) => x?.item && typeof x.item.text === "string") : [];
  } catch {
    return [];
  }
}
function writeOutbox(items: Queued[]): boolean {
  try {
    if (items.length) localStorage.setItem(OUTBOX, JSON.stringify(items.slice(-20)));
    else localStorage.removeItem(OUTBOX);
    return true;
  } catch {
    return false;
  }
}
/** false = הדפדפן חוסם אחסון, ואי אפשר לשמור את ההערה לשליחה מאוחרת */
export const queueFeedback = (item: FeedbackItem, max: number) => writeOutbox([...readOutbox(), { item, max }]);
export const queuedFeedbackCount = () => readOutbox().length;

let flushing: Promise<void> | null = null;
export function flushFeedbackOutbox(): Promise<void> {
  flushing ??= (async () => {
    if (!FEEDBACK_URL) return;
    for (const q of readOutbox()) {
      try {
        // נשלחה, או שהשרת דחה אותה (לא תתקבל גם בניסיון חוזר) ⇐ יוצאת מהתור
        await deliverFeedback(q.item, q.max);
      } catch {
        return; // עדיין אין חיבור ⇐ הסבב הבא
      }
      writeOutbox(readOutbox().filter((x) => JSON.stringify(x) !== JSON.stringify(q)));
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

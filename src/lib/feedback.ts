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

export const sendFeedback = (body: { topic: string; text: string; page: string; theme: string; website: string }) => post("/", body);
export const replyToThread = (token: string, text: string, website: string) => post("/thread", { t: token, text, website });

export async function getThread(token: string): Promise<Thread | null> {
  const res = await fetch(`${FEEDBACK_URL}/thread?t=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.ok ? (data as Thread) : null;
}

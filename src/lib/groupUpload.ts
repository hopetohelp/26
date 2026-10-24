import { CrowdError, GROUP_CHUNK, type GroupImportResult } from "./crowdApi";

/** מיילים מקובץ: מייל בכל שורה (או מופרדים בפסיק, נקודה-פסיק או רווח); שורות ריקות וכפולות נשמטות. הבדיקה המלאה בשרת. */
export function emailsFromText(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const e = raw.trim().replace(/^["']|["']$/g, "");
    if (e.includes("@")) seen.add(e);
  }
  return [...seen];
}

/** מנות לשליחה: הראשונה במצב שנבחר, השאר מוסיפות (כדי ש"החלפה" תמחק רק פעם אחת) */
export function uploadChunks(emails: string[], mode: "add" | "replace"): { emails: string[]; mode: "add" | "replace" }[] {
  const out: { emails: string[]; mode: "add" | "replace" }[] = [];
  for (let i = 0; i < emails.length; i += GROUP_CHUNK) out.push({ emails: emails.slice(i, i + GROUP_CHUNK), mode: i === 0 ? mode : "add" });
  if (!out.length && mode === "replace") out.push({ emails: [], mode });
  return out;
}

type Chunk = { emails: string[]; mode: "add" | "replace" };
type Sent = { added: number; invalid: number; members: number | null; failed: number };
const permanent = (e: unknown) => e instanceof CrowdError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;

/**
 * שליחת מנה עם חלוקה כשהיא נכשלת: מנה שנכשלה (רשת או שרת) מתחלקת לשתיים ונשלחת שוב, עד מייל אחד בכל פעם —
 * כך כל מייל תקין נשמר גם כשמנה גדולה נופלת. הרשימה נשארת בדפדפן בלבד; לשרת מגיע רק מה שנשלח, ונשמר בו רק הגיבוב.
 * כשל של הרשאה או קלט (4xx) עוצר את ההעלאה כולה.
 */
export async function sendWithSplit(send: (c: Chunk) => Promise<GroupImportResult>, chunk: Chunk, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<Sent> {
  try {
    const r = await send(chunk);
    return { added: r.added, invalid: r.invalid, members: r.members, failed: 0 };
  } catch (e) {
    if (permanent(e)) throw e;
    if (chunk.emails.length <= 1) {
      // ניסיון אחרון למייל בודד, אחרי הפסקה קצרה
      await wait(1000);
      try { const r = await send(chunk); return { added: r.added, invalid: r.invalid, members: r.members, failed: 0 }; } catch (e2) { if (permanent(e2)) throw e2; return { added: 0, invalid: 0, members: null, failed: chunk.emails.length }; }
    }
    const half = Math.ceil(chunk.emails.length / 2);
    const a = await sendWithSplit(send, { emails: chunk.emails.slice(0, half), mode: chunk.mode }, wait);
    const b = await sendWithSplit(send, { emails: chunk.emails.slice(half), mode: "add" }, wait);
    return { added: a.added + b.added, invalid: a.invalid + b.invalid, members: b.members ?? a.members, failed: a.failed + b.failed };
  }
}

/** מצב העלאה בשלבים (POST /group/upload, /group/upload/continue) */
export interface UploadState { upload: number; total: number; done: number; invalid: number; added: number; members: number; finished: boolean }
export interface StagedApi { start: (c: Chunk) => Promise<UploadState>; next: (upload: number) => Promise<UploadState> }
/** עד 2,000 מיילים ועד ~150KB בבקשת שמירה אחת (התקרה בשרת: UPLOAD_MAX ו-UPLOAD_BODY) */
export function stagedChunks(emails: string[], mode: "add" | "replace", max = 2000, bytes = 150_000): Chunk[] {
  const out: Chunk[] = [];
  let cur: string[] = [], size = 0;
  for (const e of emails) {
    if (cur.length && (cur.length >= max || size + e.length + 3 > bytes)) { out.push({ emails: cur, mode: out.length ? "add" : mode }); cur = []; size = 0; }
    cur.push(e); size += e.length + 3;
  }
  if (cur.length || (!out.length && mode === "replace")) out.push({ emails: cur, mode: out.length ? "add" : mode });
  return out;
}
const retry = async <T>(f: () => Promise<T>, wait: (ms: number) => Promise<unknown>, tries = 5): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await f(); } catch (e) { if (permanent(e) || i >= tries - 1) throw e; await wait(1000 * 2 ** i); }
  }
};
/**
 * העלאה בשלבים (הכרעת בעלים 24.10.2026): כל הקובץ נשמר בשרת מיד (מוצפן), ואז השרת מעבד חלק אחרי חלק.
 * תקלה רגעית ⇐ ניסיון חוזר; דף שנסגר באמצע ⇐ השרת משלים לבד בבדיקה השעתית.
 */
export async function uploadStaged(api: StagedApi, emails: string[], mode: "add" | "replace", progress: (done: number, total: number) => void, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  const total = emails.length;
  let before = 0, added = 0, invalid = 0, members: number | null = null;
  for (const chunk of stagedChunks(emails, mode)) {
    let s = await retry(() => api.start(chunk), wait);
    progress(before + s.done, total);
    while (!s.finished) { const id = s.upload; s = await retry(() => api.next(id), wait); progress(before + s.done, total); }
    before += s.total; added += s.added; invalid += s.invalid; members = s.members;
  }
  return { added, invalid, members };
}

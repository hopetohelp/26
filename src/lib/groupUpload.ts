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

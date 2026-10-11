import { GROUP_CHUNK } from "./crowdApi";

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

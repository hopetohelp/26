/**
 * קישורים בהודעות (הכרעת בעלים 12.10.2026): כתובת שנשלחה בהודעה נלחצת, ולא רק מוצגת כטקסט.
 * רק http ו-https (בלי javascript: ודומיו); פיסוק בסוף המשפט אינו חלק מהכתובת.
 */
export type TextPart = { text: string; href?: string };

const URL_AT = /https?:\/\/[^\s<>"]+/giu;
const TRAILING = /[.,;:!?)\]}'"»”’״׳]+$/u;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_AT)) {
    const raw = m[0].replace(TRAILING, "");
    let ok = false;
    try { const u = new URL(raw); ok = (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname.includes("."); } catch { /* לא כתובת — נשאר טקסט */ }
    if (!ok) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: raw, href: raw });
    last = at + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

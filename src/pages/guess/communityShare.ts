/**
 * שיתוף מסך "סקר האתר": תמונת המסך כולו, תמונת חלוקת המנדטים (ממוצע המשתתפים), תמונת ההצבעה (בחירות קודמות ← הבאות) וקישור.
 * באותו סגנון של תמונת "הכנסת שלי" (shareImage.ts). השאלות שבכל אחת נשענות על הנתונים שבמסך — בלי מספר חדש.
 */
import type { Dashboard } from "../../lib/crowdApi";
import { SITE_URL } from "../../lib/shareGuess";
import { seatsFmt } from "../../lib/format";
import { IDS } from "./model";
import { renderShareImage, sharePalette, IMG_W } from "./shareImage";
import { votingRows } from "./votingRows";

export const COMMUNITY_URL = `${SITE_URL}#/community`;
export const COMMUNITY_TEXT = "סקר האתר לבחירות לכנסת ה-26: מה חושבים המשתתפים ולמי הם מתכננים להצביע. ככל שיותר משתתפים — התמונה מדויקת יותר. הצטרפו:";
const SITE_LABEL = SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, "");

/** עיגול ממוצעים לחלוקה שלמה של 120 (שארית גדולה) — רק לציור לוח המושבים, המספרים בתמונה הם הממוצעים עצמם */
export function roundTo120(means: Record<string, number>): Record<string, number> {
  const ids = Object.keys(means).filter((id) => means[id] > 0);
  const sum = ids.reduce((a, id) => a + means[id], 0);
  if (!sum) return {};
  const scaled = ids.map((id) => ({ id, v: (means[id] / sum) * 120 }));
  const out: Record<string, number> = Object.fromEntries(scaled.map((x) => [x.id, Math.floor(x.v)]));
  let left = 120 - Object.values(out).reduce((a, b) => a + b, 0);
  for (const x of [...scaled].sort((a, b) => (b.v % 1) - (a.v % 1))) if (left-- > 0) out[x.id]++;
  return out;
}

export async function seatsImage(d: Dashboard): Promise<Blob> {
  const means = Object.fromEntries((d.seats?.full ?? []).filter((r) => IDS.includes(r.list)).map((r) => [r.list, r.mean]));
  const board = roundTo120(means);
  return renderShareImage({
    values: board,
    kind: "parties",
    labels: {
      title: "סקר האתר: הכנסת",
      subtitle: `ממוצע השערות ${d.seats?.n ?? d.participants} משתתפים · השערות, לא סקר מייצג`,
      cta: "רוצים שזה יהיה מדויק יותר? הצטרפו",
      value: (id) => seatsFmt(means[id] ?? 0),
    },
  });
}

export async function voteImage(d: Dashboard): Promise<Blob> {
  const { c, display, body, num } = await sharePalette();
  const rows = votingRows(d).filter((r) => (r.previous ?? 0) > 0 || (r.next ?? 0) > 0)
    .sort((a, b) => (b.next ?? 0) - (a.next ?? 0) || (b.previous ?? 0) - (a.previous ?? 0)).slice(0, 14);
  const count = d.sectionParticipants?.vote2026 ?? d.sectionParticipants?.vote2022 ?? d.participants;
  const R = IMG_W - 72, L = 72, rowH = 74, y0 = 330;
  const H = Math.max(1350, y0 + rows.length * rowH + 300);
  const cv = document.createElement("canvas");
  cv.width = IMG_W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.direction = "rtl";
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, IMG_W, H);
  ctx.fillStyle = c.signal; ctx.fillRect(0, 0, IMG_W, 14);
  ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `700 84px ${display}`;
  ctx.fillText("לאן הצביעו ולאן יצביעו", R, 140, R - L);
  ctx.fillStyle = c.soft; ctx.font = `400 32px ${body}`;
  ctx.fillText(`סקר האתר · ${count} משתתפים · מי שמשתתף בוחר בעצמו, אין דגימה`, R, 196, R - L);
  const colPrev = L + 400, colNext = L + 120;
  ctx.textAlign = "center"; ctx.fillStyle = c.ink; ctx.font = `700 30px ${body}`;
  ctx.fillText("הצביעו ב-2022", colPrev, 272); ctx.fillText("מתכננים ב-2026", colNext, 272);
  rows.forEach((r, i) => {
    const y = y0 + i * rowH;
    ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `700 34px ${body}`;
    let name = r.name;
    while (ctx.measureText(name).width > R - colPrev - 110 && name.length > 3) name = name.slice(0, -2) + "…";
    ctx.fillText(name, R, y);
    ctx.textAlign = "center"; ctx.font = `700 40px ${num}`;
    ctx.fillStyle = c.soft; ctx.fillText(r.previous === null ? "—" : `${r.previous}%`, colPrev, y);
    ctx.fillStyle = c.ink; ctx.fillText(r.next === null ? "—" : `${r.next}%`, colNext, y);
    ctx.strokeStyle = c.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L, y + 24); ctx.lineTo(R, y + 24); ctx.stroke();
  });
  ctx.textAlign = "right"; ctx.fillStyle = c.soft; ctx.font = `400 26px ${body}`;
  ctx.fillText("אחוז מתוך המשתתפים שענו. השערות גולשים, לא סקר מייצג.", R, H - 208, R - L);
  ctx.fillStyle = c.card === c.bg ? c.line : c.card; ctx.fillRect(0, H - 176, IMG_W, 176);
  ctx.fillStyle = c.ink; ctx.font = `700 54px ${display}`;
  ctx.fillText("רוצים שזה יהיה מדויק יותר? הצטרפו", R, H - 100, R - L);
  ctx.fillStyle = c.soft; ctx.font = `700 34px ${body}`; ctx.direction = "ltr";
  ctx.fillText(SITE_LABEL, R, H - 48);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}

/** צילום המסך כולו (התוכן הראשי), ברקע העיצוב הפעיל */
export async function screenImage(): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const node = (document.querySelector("main") ?? document.body) as HTMLElement;
  const bg = `rgb(${getComputedStyle(document.documentElement).getPropertyValue("--paper").trim()})`;
  const blob = await toBlob(node, { backgroundColor: bg, pixelRatio: Math.min(2, window.devicePixelRatio || 1), filter: (n) => !(n instanceof HTMLElement && n.dataset.noCapture !== undefined) });
  if (!blob) throw new Error("capture");
  return blob;
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PARTY_IMAGES } from "../../lib/partyImages";
import { SITE_URL } from "../../lib/shareGuess";
import { groupUrl } from "../../lib/groupLink";
import { nameOf } from "../guess/model";
import { sharePalette, IMG_W, ltrText } from "../guess/shareImage";
import { loadLogo } from "../guess/communityShare";
import { isEmail } from "../../lib/identifier";
import { blocSlices } from "./shared";

/** מה משתפים: ההשערה של המשתתף, או ממוצע המשתתפים (בגזרה: ממוצע הגזרה). */
export type ShareKind = "mine" | "average";
export interface ShareInput { kind: ShareKind; values: Record<string, number>; name?: string | null; group?: { slug: string; logoUrl: string | null } | null }

const SHORT = ["גוש נתניהו", "חרדים", "ערבים", "גוש אייזנקוט"];
const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
export function inviteText({ kind, group }: ShareInput): string {
  const link = group ? groupUrl(group.slug) : SITE_URL;
  if (kind === "average") return group ? `זו תחזית כל המשתתפים. מה אתם צופים? מצטרפים לקבוצה ומשערים בדקה: ${link}` : `זו תחזית המשתתפים. חושבים שאתם מדייקים יותר? תוך דקה בונים כנסת משלכם: ${link}`;
  return group ? `הגזרה בונה את הכנסת שלה. זו התחזית שלי, ואני סקרן לראות את שלכם. מצטרפים לקבוצה ומשערים בדקה: ${link}` : `זה הניחוש שלי. חושבים שאתם מדייקים יותר? תוך דקה בונים כנסת משלכם ורואים איך כולם חושבים: ${link}`;
}
export function shareTitle({ kind, name }: ShareInput): string {
  if (kind === "average") return "ממוצע הניחושים של המשתתפים";
  return name ? `הכנסת של ${name}` : "הניחוש שלי";
}
const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/** תמונה אחת: כותרת בשורה אחת, כל המפלגות עם המנדטים, פס גושים עם שמות, ומשפט עם כתובת האתר. בצבעי העיצוב הפעיל (בגזרה: צבעי הגזרה). */
export async function renderSimpleShare(input: ShareInput): Promise<Blob> {
  const { c, display, body, num } = await sharePalette();
  const css = (n: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(n).trim()})`;
  const rows = Object.keys(input.values).filter(id => input.values[id] >= .5).sort((a, b) => input.values[b] - input.values[a]);
  const half = Math.ceil(rows.length / 2), rowH = 92, top = 210, H = top + half * rowH + 330;
  const cv = document.createElement("canvas"); cv.width = IMG_W; cv.height = H;
  const ctx = cv.getContext("2d")!; ctx.direction = "rtl";
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, IMG_W, H);
  if (input.group) { ctx.lineWidth = 22; ctx.strokeStyle = c.signal; ctx.strokeRect(11, 11, IMG_W - 22, H - 22); ctx.lineWidth = 10; ctx.strokeStyle = css("--bloc-4"); ctx.strokeRect(30, 30, IMG_W - 60, H - 60); }
  const logo = input.group?.logoUrl ? await loadLogo(input.group.logoUrl) : null;
  let right = IMG_W - 70;
  if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(right - 50, 110, 50, 0, 2 * Math.PI); ctx.clip(); ctx.drawImage(logo, right - 100, 60, 100, 100); ctx.restore(); right -= 124; }
  // כותרת בשורה אחת; "בחירות 2026" בקטן רק כשיש מקום
  ctx.fillStyle = c.ink; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  let size = 64; const title = shareTitle(input);
  do { ctx.font = `800 ${size}px ${display}`; } while (ctx.measureText(title).width > right - 110 && --size > 34);
  ctx.fillText(title, right, 110);
  const tw = ctx.measureText(title).width;
  ctx.font = `400 30px ${body}`;
  if (right - tw - 70 > ctx.measureText("בחירות 2026").width + 20) { ctx.fillStyle = c.soft; ctx.textAlign = "left"; ctx.fillText("בחירות 2026", 70, 110); }
  // המפלגות בשני טורים
  const colW = (IMG_W - 180) / 2;
  const imgs = await Promise.all(rows.map(id => PARTY_IMAGES[id] ? loadImg(`${import.meta.env.BASE_URL}${PARTY_IMAGES[id].file}`) : Promise.resolve(null)));
  rows.forEach((id, i) => {
    const col = i < half ? 0 : 1, r = i % half, xR = IMG_W - 70 - col * (colW + 40), y = top + r * rowH;
    const img = imgs[i];
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(xR - 32, y + 32, 32, 0, 2 * Math.PI); ctx.clip(); ctx.fillStyle = c.card; ctx.fill(); ctx.drawImage(img, xR - 64, y, 64, 64); ctx.restore(); }
    ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `500 34px ${body}`;
    let n = nameOf(id); while (ctx.measureText(n).width > colW - 190 && n.length > 3) n = n.slice(0, -2) + "…";
    ctx.fillText(n, xR - 82, y + 34);
    ctx.textAlign = "left"; ctx.font = `700 40px ${num}`; ctx.fillText(String(Math.round(input.values[id] * 10) / 10), xR - colW, y + 34);
  });
  // פס הגושים ושמות הגושים מעליו
  const slices = blocSlices(input.values), total = slices.reduce((s, b) => s + b.value, 0) || 1, barY = top + half * rowH + 70;
  let x = IMG_W - 70; const barW = IMG_W - 140;
  slices.forEach(s => {
    const w = s.value / total * barW, k = ["netanyahu", "haredi", "arab", "eisenkot"].indexOf(s.id);
    ctx.fillStyle = css(`--bloc-${k + 1}`); ctx.fillRect(x - w + 2, barY, w - 4, 56);
    ctx.textAlign = "center"; ctx.fillStyle = c.ink; ctx.font = `700 26px ${body}`;
    if (w > ctx.measureText(SHORT[k]).width + 8) ctx.fillText(SHORT[k], x - w / 2, barY - 24);
    ctx.fillStyle = "#fff"; ctx.font = `700 30px ${num}`; if (w > 44) ctx.fillText(String(s.shown), x - w / 2, barY + 29);
    x -= w;
  });
  ctx.textAlign = "center"; ctx.fillStyle = c.soft; ctx.font = `400 30px ${body}`;
  ctx.fillText(`${input.group ? "הגזרה משערת · " : ""}מה אתם חושבים? ${ltrText(host)}`, IMG_W / 2, H - 80);
  return await new Promise<Blob>((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("image")), "image/png"));
}

/** חלון שיתוף: התמונה, משפט הזמנה, ושיתוף או שמירה */
export default function ShareCard({ input, heading, onClose }: { input: ShareInput; heading: string; onClose: () => void }) {
  const [withName, setWithName] = useState(!!input.name && !isEmail(input.name));
  const data = { ...input, name: withName ? input.name : null };
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(data);
  useEffect(() => {
    let live = true, made: string | null = null;
    renderSimpleShare(data).then(b => { made = URL.createObjectURL(b); if (live) setUrl(made); }).catch(() => live && setMsg("הכנת התמונה לא הצליחה."));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.focus(); }, []);
  const file = async () => new File([await renderSimpleShare(data)], "הכנסת.png", { type: "image/png" });
  const text = inviteText(data);
  const share = async () => {
    setMsg(null);
    try {
      const f = await file().catch(() => null);
      if (navigator.share) await navigator.share(f && navigator.canShare?.({ files: [f] }) ? { text, files: [f] } : { text });
      else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. נסו שוב."); }
  };
  const save = async () => {
    try {
      const f = await file(), u = URL.createObjectURL(f), a = document.createElement("a");
      a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
    } catch { setMsg("שמירת התמונה לא הצליחה."); }
  };
  return createPortal(<div className="f-modal" onClick={e => e.target === e.currentTarget && onClose()} onKeyDown={e => e.key === "Escape" && onClose()}>
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="f-share-title">
      <h2 id="f-share-title" className="text-lg font-bold">{heading}</h2>
      {url ? <img src={url} alt={shareTitle(data)} /> : <p className="text-sm text-ink-soft">מכינים את התמונה…</p>}
      <p className="f-invite">{text}</p>
      {input.kind === "mine" && input.name && !isEmail(input.name) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withName} onChange={e => setWithName(e.target.checked)} />לצרף את השם שלי (<bdi>{input.name}</bdi>)</label>}
      <div className="flex gap-2"><button type="button" className="f-btn pri flex-1" onClick={share}>שיתוף</button><button type="button" className="f-btn flex-1" onClick={save}>שמירת התמונה</button></div>
      <button type="button" className="f-btn" onClick={onClose}>סגירה</button>
      {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
    </div></div>, document.body);
}

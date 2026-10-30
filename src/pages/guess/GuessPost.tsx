import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PARTY_IMAGES } from "../../lib/partyImages";
import { SITE_URL } from "../../lib/shareGuess";
import { dateTime } from "../../lib/format";
import { guessLabel, guessRows, guessScore, type NumberedGuess } from "../../lib/guessHistory";
import type { Seats } from "../../lib/guessAccuracy";
import { nameOf } from "./model";
import { sharePalette, IMG_W, ltrText, drawQr, QR_SIZE } from "./shareImage";

/** תוצאות האמת לפוסט: null = עוד אין; basis = על מה הן מבוססות ("לפי 78% מהקולות") */
export interface PostResults { actual: Seats | null; basis: string }

const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/**
 * פוסט של ניחוש אחד (PNG, רוחב 1080): "ניחוש 3/5", תאריך ושעת הניחוש, הדיוק, ורשימת המפלגות עם הניחוש ותוצאת האמת.
 * הצבעים והגופנים מהעיצוב הפעיל (יום/לילה); בלי המלצה.
 */
async function renderPost(g: NumberedGuess, results: PostResults): Promise<Blob> {
  const { c, display, body, num } = await sharePalette();
  const { actual } = results;
  const rows = guessRows(g.values, actual);
  const rowH = 76, top = 470, H = top + 60 + rows.length * rowH + 230;
  const cv = document.createElement("canvas"); cv.width = IMG_W; cv.height = H;
  const ctx = cv.getContext("2d")!; ctx.direction = "rtl";
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, IMG_W, H);
  ctx.textBaseline = "middle"; ctx.textAlign = "center";
  // כותרת: מספר הניחוש, ותאריך ושעה
  ctx.fillStyle = c.ink; ctx.font = `800 84px ${display}`;
  ctx.fillText(guessLabel(g.n, g.total), IMG_W / 2, 110);
  ctx.fillStyle = c.soft; ctx.font = `600 36px ${body}`;
  ctx.fillText(ltrText(dateTime(g.version.created_at)), IMG_W / 2, 190);
  // הדיוק מול תוצאות האמת
  if (actual) {
    const s = guessScore(g.values, actual);
    const tiles: [string, number, string][] = [["מנדטים מדויקים", s.seats, "מתוך 120"], ["מפלגות מדויקות", s.lists, `מתוך ${s.passed}`]];
    tiles.forEach(([t, v, of], i) => {
      const cx = IMG_W * (i ? .28 : .72);
      ctx.fillStyle = c.soft; ctx.font = `600 32px ${body}`; ctx.fillText(t, cx, 275);
      ctx.fillStyle = c.ink; ctx.font = `800 96px ${num}`; ctx.fillText(ltrText(String(v)), cx, 355);
      ctx.fillStyle = c.soft; ctx.font = `600 28px ${body}`; ctx.fillText(of, cx, 420);
    });
  } else {
    ctx.fillStyle = c.soft; ctx.font = `600 36px ${body}`; ctx.fillText("ממתינים לתוצאות האמת", IMG_W / 2, 330);
  }
  // כותרות הטורים: רשימה (מימין), הניחוש, האמת
  const colGuess = 430, colActual = 190;
  ctx.font = `600 28px ${body}`; ctx.fillStyle = c.soft; ctx.textAlign = "center";
  ctx.fillText("הניחוש", colGuess, top); ctx.fillText("האמת", colActual, top);
  ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(70, top + 30); ctx.lineTo(IMG_W - 70, top + 30); ctx.stroke();
  const imgs = await Promise.all(rows.map((r) => PARTY_IMAGES[r.id] ? loadImg(`${import.meta.env.BASE_URL}${PARTY_IMAGES[r.id].file}`) : Promise.resolve(null)));
  rows.forEach((r, i) => {
    const y = top + 60 + i * rowH, xR = IMG_W - 70, img = imgs[i];
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(xR - 28, y, 28, 0, 2 * Math.PI); ctx.clip(); ctx.fillStyle = c.card; ctx.fill(); ctx.drawImage(img, xR - 56, y - 28, 56, 56); ctx.restore(); }
    ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `500 32px ${body}`;
    let n = nameOf(r.id); while (ctx.measureText(n).width > xR - 72 - colGuess - 70 && n.length > 3) n = n.slice(0, -2) + "…";
    ctx.fillText(n, xR - 72, y);
    ctx.textAlign = "center";
    // פגיעה מדויקת מודגשת בצבע הסימון של העיצוב; אחרת הניחוש בצבע רגיל
    ctx.fillStyle = r.exact ? c.signal : c.ink; ctx.font = `${r.exact ? 800 : 700} 36px ${num}`;
    ctx.fillText(String(r.guess), colGuess, y);
    ctx.fillStyle = c.ink; ctx.font = `700 36px ${num}`;
    ctx.fillText(actual ? String(r.actual) : "—", colActual, y);
  });
  // תחתית: הערת בסיס התוצאות, קוד QR וכתובת האתר
  const fy = top + 60 + rows.length * rowH + 40;
  ctx.textAlign = "right"; ctx.fillStyle = c.soft; ctx.font = `400 28px ${body}`;
  if (actual) ctx.fillText(`תוצאות האמת ${results.basis}`, IMG_W - 70, fy + 20);
  ctx.font = `400 30px ${body}`;
  ctx.fillText(`הניחוש שלי לבחירות 2026 · ${ltrText(host)}`, IMG_W - 70, H - 80, IMG_W - 140 - QR_SIZE - 30);
  drawQr(ctx, SITE_URL, 70, H - 70 - QR_SIZE, QR_SIZE);
  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => b ? res(b) : rej(new Error("image")), "image/png"));
}

/** חלון יצירת הפוסט: תמונה מוכנה לשיתוף או לשמירה */
export default function GuessPost({ guess, results, onClose }: { guess: NumberedGuess; results: PostResults; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    let live = true;
    renderPost(guess, results)
      .then((b) => { if (!live) return; setFile(new File([b], `elections26-guess-${guess.n}-of-${guess.total}.png`, { type: "image/png" })); setUrl(URL.createObjectURL(b)); })
      .catch(() => live && setMsg("הכנת התמונה לא הצליחה."));
    return () => { live = false; };
  }, [guess, results]);
  const save = () => {
    if (!url || !file) return;
    const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  };
  const share = async () => {
    if (!file) return;
    setMsg(null);
    try {
      const text = `${guessLabel(guess.n, guess.total)} שלי לבחירות 2026, מול תוצאות האמת\n${SITE_URL}`;
      if (navigator.canShare?.({ files: [file], text })) await navigator.share({ files: [file], text });
      else if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else save();
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. אפשר לשמור ולשתף."); }
  };
  return createPortal(<div className="f-modal" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="guess-post-title">
      <h2 id="guess-post-title" className="text-lg font-bold">פוסט: {guessLabel(guess.n, guess.total)}</h2>
      {url ? <img src={url} alt={`${guessLabel(guess.n, guess.total)}: המפלגות עם הניחוש ותוצאות האמת`} /> : <p className="text-sm text-ink-soft">מכינים את התמונה…</p>}
      {file && <div className="flex gap-2"><button type="button" className="f-btn pri flex-1" onClick={share}>שיתוף</button><button type="button" className="f-btn flex-1" onClick={save}>שמירה</button></div>}
      <button type="button" className="f-btn" onClick={onClose}>סגירה</button>
      {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
    </div></div>, document.body);
}

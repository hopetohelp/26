import { useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { createPortal } from "react-dom";
import { PARTY_IMAGES } from "../../lib/partyImages";
import { SITE_URL } from "../../lib/shareGuess";
import { groupUrl } from "../../lib/groupLink";
import { accuracyPct, biggestGap, closestPoll, type Seats } from "../../lib/guessAccuracy";
import { crowdDashboardOnce } from "../../lib/sources";
import { THRESHOLD_SEATS } from "../../lib/crowdValidate";
import type { PromoFile } from "../../lib/promoEncode";
import { nameOf } from "../guess/model";
import { sharePalette, IMG_W, ltrText, drawQr, QR_SIZE } from "../guess/shareImage";
import { loadLogo } from "../guess/communityShare";
import { blocSlices } from "./shared";
import { buildPromoData, guesserName } from "./PromoVideo";

export interface AccuracyShareInput {
  actual: Seats; ids: string[]; crowdMean: Seats; mine: Seats | null; pollMean: Seats; polls: Seats[]; pollLabels: string[];
  hist: Record<string, number[]> | null; count: number; best: string[];
  group: { slug: string; logoUrl: string | null } | null;
}
const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const round1 = (v: number) => String(Math.round(v * 10) / 10);

/** המכון הקרוב ביותר לאמת — אותו חישוב של כרטיס "הסקר הקרוב ביותר" */
export function closestPollLabel(input: AccuracyShareInput) {
  return closestPoll(input.polls.map((values, i) => ({ values, label: input.pollLabels[i] })), input.actual)?.label ?? "";
}

/** תמונה: למעלה אחוז דיוק הסקרים מול הניחושים; רשימות — אמת מול הניחוש (או ממוצע הניחושים); בתחתית שתי רצועות גושים */
async function renderImage(input: AccuracyShareInput, values: Seats, label: string): Promise<Blob> {
  const { c, display, body, num } = await sharePalette();
  const css = (n: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(n).trim()})`;
  const rows = input.ids, rowH = 76, top = 400, H = top + 60 + rows.length * rowH + 480;
  const cv = document.createElement("canvas"); cv.width = IMG_W; cv.height = H;
  const ctx = cv.getContext("2d")!; ctx.direction = "rtl";
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, IMG_W, H);
  if (input.group) { ctx.lineWidth = 22; ctx.strokeStyle = c.signal; ctx.strokeRect(11, 11, IMG_W - 22, H - 22); }
  const logo = input.group?.logoUrl ? await loadLogo(input.group.logoUrl) : null;
  if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(IMG_W - 120, 100, 50, 0, 2 * Math.PI); ctx.clip(); ctx.drawImage(logo, IMG_W - 170, 50, 100, 100); ctx.restore(); }
  ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillStyle = c.ink; ctx.font = `800 56px ${display}`;
  ctx.fillText("מי ניחש הכי טוב?", IMG_W / 2, 100);
  // אחוז הדיוק: הסקרים מול הניחושים
  const tiles: [string, number][] = [["דיוק הסקרים", accuracyPct(input.pollMean, input.actual)], [input.mine && values === input.mine ? label : "דיוק הניחושים", accuracyPct(values, input.actual)]];
  tiles.forEach(([t, v], i) => {
    const cx = IMG_W * (i ? .28 : .72);
    ctx.fillStyle = c.soft; ctx.font = `600 32px ${body}`; ctx.fillText(t, cx, 200);
    ctx.fillStyle = c.ink; ctx.font = `800 96px ${num}`; ctx.fillText(ltrText(`${Math.round(v)}%`), cx, 290);
  });
  // כותרות הטורים
  const colA = 300, colB = 150;
  ctx.font = `600 28px ${body}`; ctx.fillStyle = c.soft; ctx.textAlign = "center";
  ctx.fillText("אמת", colA, top); ctx.fillText(label, colB, top);
  const imgs = await Promise.all(rows.map(id => PARTY_IMAGES[id] ? loadImg(`${import.meta.env.BASE_URL}${PARTY_IMAGES[id].file}`) : Promise.resolve(null)));
  rows.forEach((id, i) => {
    const y = top + 60 + i * rowH, xR = IMG_W - 70;
    const img = imgs[i];
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(xR - 28, y, 28, 0, 2 * Math.PI); ctx.clip(); ctx.fillStyle = c.card; ctx.fill(); ctx.drawImage(img, xR - 56, y - 28, 56, 56); ctx.restore(); }
    ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `500 32px ${body}`;
    let n = nameOf(id); while (ctx.measureText(n).width > xR - 72 - colA - 70 && n.length > 3) n = n.slice(0, -2) + "…";
    ctx.fillText(n, xR - 72, y);
    ctx.textAlign = "center"; ctx.font = `700 36px ${num}`; ctx.fillText(round1(input.actual[id] ?? 0), colA, y);
    const g = values[id] ?? 0, d = g - (input.actual[id] ?? 0);
    ctx.fillStyle = Math.abs(d) < .5 ? c.ink : c.soft; ctx.fillText(round1(g), colB, y);
  });
  // שתי רצועות גושים: אמת, ומתחת — הניחוש
  const strip = (vals: Seats, y: number, title: string) => {
    const slices = blocSlices(vals), total = slices.reduce((s, b) => s + b.value, 0) || 1, barW = IMG_W - 140;
    ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `700 28px ${body}`; ctx.fillText(title, IMG_W - 70, y - 30);
    let x = IMG_W - 70;
    slices.forEach(s => {
      const w = s.value / total * barW, k = ["netanyahu", "haredi", "arab", "eisenkot"].indexOf(s.id);
      ctx.fillStyle = css(`--bloc-${k + 1}`); ctx.fillRect(x - w + 2, y, w - 4, 56);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `700 30px ${num}`;
      const tag = `${s.short} ${s.shown}`;
      if (w > ctx.measureText(tag).width + 16) ctx.fillText(tag, x - w / 2, y + 29); else if (w > 44) ctx.fillText(String(s.shown), x - w / 2, y + 29);
      x -= w;
    });
  };
  const sy = top + 60 + rows.length * rowH + 40;
  strip(input.actual, sy, "תוצאות אמת"); strip(values, sy + 140, label);
  drawQr(ctx, input.group ? groupUrl(input.group.slug) : SITE_URL, 70, H - 70 - QR_SIZE, QR_SIZE);
  ctx.textAlign = "right"; ctx.fillStyle = c.soft; ctx.font = `400 30px ${body}`;
  ctx.fillText(`הדיוק המלא באתר · ${ltrText(host)}`, IMG_W - 70, H - 80, IMG_W - 140 - QR_SIZE - 30);
  return await new Promise<Blob>((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("image")), "image/png"));
}

/** סרטון התוצאות: אותו מנוע של סרטון הנתונים, כשבמקום הסקרים — תוצאות האמת */
async function renderVideo(input: AccuracyShareInput, mine: Seats | null, name: string, onProgress: (k: number) => void): Promise<PromoFile | null> {
  const dash = await crowdDashboardOnce();
  if (!dash) return null;
  // סרטון אחד לכולם — תמיד בגרסת הגזרה (הכרעת בעלים 27.10.2026); למי שאינו חבר הקוד מוביל לאתר ולא לקבוצה
  const data = await buildPromoData(dash, input.group ?? { slug: "hagzara", logoUrl: null }, mine, name);
  if (!input.group) { const q = qrcode(0, "M"); q.addData(SITE_URL); q.make(); const m = q.getModuleCount(); data.qr = Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, k) => q.isDark(r, k))); }
  const a = input.actual, crowd = input.crowdMean, slices = blocSlices(a);
  data.lists = input.ids.map(id => { const l = data.lists.find(x => x.id === id); return { id, name: nameOf(id), polls: a[id] ?? 0, crowd: crowd[id] ?? 0, ...(mine ? { mine: mine[id] ?? 0 } : {}), img: l?.img ?? null }; });
  data.blocs = data.blocs.map(b => { const s = slices.find(x => x.id === b.id); return { ...b, polls: s?.value ?? 0, shown: { ...b.shown, polls: s?.shown ?? 0 } }; });
  data.haredi = data.haredi.map(h => ({ ...h, polls: a[h.id] ?? 0 }));
  const gap = biggestGap(crowd, a, input.ids);
  data.gap = data.lists.find(l => l.id === gap?.id) ?? data.lists[0];
  // על קו החסימה: הרשימות הקרובות לסף בפועל או בממוצע הניחושים; passing = אחוז הניחושים שהעבירו אותן
  const passPct = (id: string) => { const h = input.hist?.[id]; if (!h) return 0; const n = h.reduce((s, x) => s + x, 0); return n ? Math.round(h.reduce((s, x, k) => s + (k >= THRESHOLD_SEATS ? x : 0), 0) / n * 100) : 0; };
  data.edge = input.ids.filter(id => (a[id] ?? 0) <= 6 || (crowd[id] ?? 0) <= 6).sort((x, y) => Math.abs((a[x] ?? 0) - THRESHOLD_SEATS) - Math.abs((a[y] ?? 0) - THRESHOLD_SEATS)).slice(0, 2).map(id => ({ id, passing: passPct(id), n: 100 }));
  const mg = mine ? biggestGap(mine, a, input.ids) : null;
  data.results = { pollAcc: accuracyPct(input.pollMean, a), crowdAcc: accuracyPct(crowd, a), closest: closestPollLabel(input), mineGap: mg ? { name: nameOf(mg.id), gap: mg.gap } : null };
  const { renderPromoVideo } = await import("../../lib/promoEncode");
  return renderPromoVideo(data, onProgress);
}

/** חלון השיתוף: תמונה או סרטון; הניחוש שלי או ממוצע הניחושים; הגזרה או כולם — לפי החברות */
export default function AccuracyShare({ input, onClose }: { input: AccuracyShareInput; onClose: () => void }) {
  const [format, setFormat] = useState<"image" | "video">("image");
  const [who, setWho] = useState<"mine" | "crowd">(input.mine ? "mine" : "crowd");
  const [name, setName] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const mine = who === "mine" ? input.mine : null;
  const label = mine ? (guesserName(name) ? `הניחוש של ${guesserName(name)}` : "הניחוש שלי") : "ממוצע הניחושים";
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  // תמונה — מתעדכנת מיד; סרטון — רק בלחיצה
  useEffect(() => {
    if (format !== "image") { setUrl(null); setFile(null); return; }
    let live = true;
    renderImage(input, mine ?? input.crowdMean, label).then(b => { if (!live) return; setFile(new File([b], "elections26-accuracy.png", { type: "image/png" })); setUrl(URL.createObjectURL(b)); }).catch(() => live && setMsg("הכנת התמונה לא הצליחה."));
    return () => { live = false; };
  }, [format, who, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const makeVideo = async () => {
    setBusy(0); setMsg(null);
    try {
      const f = await renderVideo(input, mine, mine ? name : "", setBusy);
      if (!f) { setMsg("נתוני המשתתפים אינם זמינים כרגע."); return; }
      setFile(new File([f.blob], f.name, { type: f.type })); setUrl(URL.createObjectURL(f.blob));
    } catch { setMsg("יצירת הסרטון לא הצליחה בדפדפן הזה. נסו בכרום או בספארי עדכניים."); } finally { setBusy(null); }
  };
  const share = async () => {
    if (!file) return;
    setMsg(null);
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else save();
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. אפשר לשמור ולשתף."); }
  };
  const save = () => {
    if (!url || !file) return;
    const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  };
  return createPortal(<div className="f-modal" onClick={e => e.target === e.currentTarget && onClose()} onKeyDown={e => e.key === "Escape" && onClose()}>
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="f-acc-share">
      <h2 id="f-acc-share" className="text-lg font-bold">שיתוף דיוק הניחושים</h2>
      <div className="f-seg fit" role="group" aria-label="תמונה או סרטון">
        <button type="button" aria-pressed={format === "image"} onClick={() => setFormat("image")}>תמונה</button>
        <button type="button" aria-pressed={format === "video"} onClick={() => { setFormat("video"); setUrl(null); setFile(null); }}>סרטון</button>
      </div>
      {input.mine && <div className="f-seg fit" role="group" aria-label="מה משתפים">
        <button type="button" aria-pressed={who === "mine"} onClick={() => { setWho("mine"); if (format === "video") { setUrl(null); setFile(null); } }}>הניחוש שלי</button>
        <button type="button" aria-pressed={who === "crowd"} onClick={() => { setWho("crowd"); if (format === "video") { setUrl(null); setFile(null); } }}>ממוצע הניחושים</button>
      </div>}
      {mine && <label className="grid gap-1 text-sm">שם שיופיע (לא חובה, עד שתי מילים)
        <input type="text" value={name} maxLength={30} onChange={e => setName(e.target.value)} className="bg-paper border border-line rounded-xl px-3 py-2 w-full text-base" /></label>}
      {format === "image" ? (url ? <img src={url} alt="דיוק הניחושים" /> : <p className="text-sm text-ink-soft">מכינים את התמונה…</p>)
        : url ? <video src={url} controls playsInline className="w-full rounded-[14px] border border-line" style={{ aspectRatio: "9 / 16", maxHeight: "60vh" }} />
        : <button type="button" className="f-btn pri" onClick={makeVideo} disabled={busy !== null} aria-busy={busy !== null}>{busy !== null ? `יוצרים סרטון… ${Math.round(busy * 100)}%` : "יצירת הסרטון"}</button>}
      {file && <div className="flex gap-2"><button type="button" className="f-btn pri flex-1" onClick={share}>שיתוף</button><button type="button" className="f-btn flex-1" onClick={save}>שמירה</button></div>}
      <button type="button" className="f-btn" onClick={onClose}>סגירה</button>
      {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
    </div></div>, document.body);
}

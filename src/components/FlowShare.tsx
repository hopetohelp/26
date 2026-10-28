import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SITE_URL } from "../lib/shareGuess";
import { sharePalette, IMG_W, ltrText, drawQr, QR_SIZE } from "../pages/guess/shareImage";
import { DEFAULT_LINEAGE } from "../lib/lineage";
import { BLOC_MEMBERS } from "../lib/simpleSources";
import { BLOC_IDS, BLOC_NAMES, bloc2022, blocsOf, cameFromGroup, flow, flowsFor, newName, partialLine, type FlowPart, type FlowRow, type Mode } from "../lib/voterFlow";

/** public/flow-units.json: לכל יישוב — קלפיות 2022 ו-2026: [מספר, ריכוז, בעלי זכות, מצביעים, ...קולות] */
type Ballot = [string, string, number, number, ...number[]];
interface Units { letters22: string[]; letters26: string[]; places: Record<string, { name: string; y22: Ballot[]; y26: Ballot[] }> }
type Who = "all" | "haredi" | "party";
type Where = "country" | "top" | "city";

const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
const ENVELOPES = "9999";
/** חלק קטן מ-3% לא מוצג בתמונה, כדי שתישאר קריאה */
const MIN_SHARE = 3;
/** "השינוי הגדול ביותר" — רק בעיר שיש בה לפחות 5% מהמצביעים של המפלגה (הכרעת בעלים 28.10.2026) */
const MIN_CITY_SHARE = 0.05;
const LETTER_OF = Object.fromEntries(Object.entries(flow.letters26).map(([l, id]) => [id, l]));
const colorOf = (bloc: string) => { const k = ["netanyahu", "haredi", "arab", "eisenkot"].indexOf(bloc); return k < 0 ? "--bloc-miss" : `--bloc-${k + 1}`; };

interface CityShare { code: string; name: string; votes: number; share26: number; share22: number | null }
/** אחוז הקבוצה בכל יישוב: 2026 — הרשימות עצמן; 2022 — הרשימות שקדמו להן לפי השיוך של האתר (raw/lineage.json); בלי קודמת — אין השוואה */
function cityShares(u: Units, ids: string[]): CityShare[] {
  const l26 = ids.map((id) => u.letters26.indexOf(LETTER_OF[id])).filter((k) => k >= 0);
  const prev = [...new Set(ids.flatMap((id) => DEFAULT_LINEAGE.map[id] ?? []))];
  const l22 = prev.map((l) => u.letters22.indexOf(l)).filter((k) => k >= 0);
  const sum = (rows: Ballot[], ks: number[]) => rows.reduce((a, r) => a + ks.reduce((s, k) => s + (r[4 + k] as number), 0), 0);
  const valid = (rows: Ballot[], n: number) => rows.reduce((a, r) => a + (r.slice(4, 4 + n) as number[]).reduce((s, v) => s + v, 0), 0);
  return Object.entries(u.places).filter(([code, p]) => code !== ENVELOPES && p.y26.length).map(([code, p]) => {
    const v26 = valid(p.y26, u.letters26.length), v22 = valid(p.y22, u.letters22.length), votes = sum(p.y26, l26);
    return { code, name: p.name, votes, share26: v26 ? (votes / v26) * 100 : 0, share22: l22.length && v22 ? (sum(p.y22, l22) / v22) * 100 : null };
  });
}

/** ערים בולטות: 4 הערים עם הכי הרבה מצביעים לקבוצה, והעיר עם השינוי הגדול ביותר באחוזים מבין הערים עם לפחות 5% מהמצביעים שלה */
function topCities(all: CityShare[]): (CityShare & { biggest?: boolean })[] {
  const total = all.reduce((a, c) => a + c.votes, 0);
  const top = [...all].sort((a, b) => b.votes - a.votes).slice(0, 4).map((c) => ({ ...c }));
  const change = all.filter((c) => c.share22 !== null && c.votes >= total * MIN_CITY_SHARE)
    .sort((a, b) => Math.abs(b.share26 - b.share22!) - Math.abs(a.share26 - a.share22!))[0];
  if (!change) return top;
  const hit = top.find((c) => c.code === change.code);
  if (hit) { (hit as CityShare & { biggest?: boolean }).biggest = true; return top; }
  return [...top, { ...change, biggest: true }];
}

interface Spec { who: Who; party: string; where: Where; city: string; blocs: boolean; mode: Mode }

async function render(spec: Spec, units: Units | null): Promise<Blob> {
  const { c, display, body, num } = await sharePalette();
  const css = (n: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(n).trim()})`;
  const cv = document.createElement("canvas"); cv.width = IMG_W; cv.height = 3200;
  const ctx = cv.getContext("2d")!; ctx.direction = "rtl"; ctx.textBaseline = "middle";
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, IMG_W, cv.height);
  const R = IMG_W - 70, L = 70;
  const ids = spec.who === "haredi" ? [...BLOC_MEMBERS.haredi] : spec.who === "party" ? [spec.party] : [];
  const groupName = spec.who === "haredi" ? "המפלגות החרדיות" : newName(spec.party);
  const place = spec.where === "city" && units ? Object.entries(units.places).find(([, p]) => p.name === spec.city.trim()) : undefined;
  const cityData = place ? (flow as unknown as { cities?: Record<string, { flows: number[][] }> }).cities?.[place[0]] : undefined;
  const matrix = cityData?.flows ?? (spec.where === "city" ? null : flow.modes[spec.mode].flows);
  const where = spec.where === "country" ? "כל הארץ" : spec.where === "top" ? "ערים בולטות" : place?.[1].name ?? spec.city;

  // כותרת
  ctx.textAlign = "center"; ctx.fillStyle = c.ink; ctx.font = `800 58px ${display}`;
  const title = spec.where === "top" ? `איפה ${groupName} ${spec.who === "party" ? "הכי חזקה" : "הכי חזקות"}?`
    : spec.who === "all" ? "מאיפה הגיעו המצביעים?" : `מאיפה הגיעו המצביעים של ${groupName}?`;
  let y = 100;
  for (const line of wrap(ctx, title, IMG_W - 140)) { ctx.fillText(line, IMG_W / 2, y); y += 72; }
  ctx.fillStyle = c.soft; ctx.font = `500 32px ${body}`; ctx.fillText(`${where} · 2022 מול 2026`, IMG_W / 2, y); y += 44;
  ctx.font = `400 28px ${body}`; ctx.fillText(partialLine(), IMG_W / 2, y); y += 70;

  const bar = (x: number, w: number, yy: number, h: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, yy, Math.max(w, 2), h, 8); ctx.fill(); };
  /** שורת מקור: שם, פס בצבע הגוש של 2022, אחוז גדול */
  const sources = (list: FlowPart[]) => {
    for (const p of list.filter((x) => x.share >= MIN_SHARE).slice(0, 7)) {
      ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `600 34px ${body}`; ctx.fillText(p.name, R, y + 26);
      const x0 = L + 150, w = (R - 290 - x0) * p.share / 100;
      bar(R - 290 - w, w, y + 6, 40, css(colorOf(bloc2022(p.id))));
      ctx.textAlign = "left"; ctx.fillStyle = c.ink; ctx.font = `800 52px ${num}`; ctx.fillText(ltrText(`${Math.round(p.share)}%`), L, y + 26);
      y += 78;
    }
  };
  /** פס מוערם לכל שורה: חלקי המקור בצבעי הגושים של 2022 */
  const stacked = (rows: FlowRow[], blocOfPart: (id: string) => string) => {
    for (const r of rows) {
      ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `600 30px ${body}`;
      let n = r.name; while (ctx.measureText(n).width > 300 && n.length > 3) n = n.slice(0, -2) + "…";
      ctx.fillText(n, R, y + 22);
      let x = R - 330; const W = R - 330 - L;
      for (const p of r.parts) {
        const w = W * p.share / 100; bar(x - w + 1, w - 2, y + 4, 36, css(colorOf(blocOfPart(p.id))));
        // האחוז בתוך כל חלק שיש בו מקום
        ctx.font = `700 24px ${num}`; const t = ltrText(`${Math.round(p.share)}%`);
        if (w > ctx.measureText(t).width + 14) { ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText(t, x - w / 2, y + 23); }
        x -= w;
      }
      y += 62;
    }
  };
  const legend = () => {
    ctx.font = `500 26px ${body}`; let x = R; y += 10;
    for (const b of [...BLOC_IDS.slice(0, 4), "abstain"]) {
      const label = b === "abstain" ? "לא הצביעו" : BLOC_NAMES[b], w = ctx.measureText(label).width + 70;
      if (x - w < L) { x = R; y += 44; }
      ctx.fillStyle = css(colorOf(b)); ctx.fillRect(x - 24, y - 12, 24, 24);
      ctx.textAlign = "right"; ctx.fillStyle = c.soft; ctx.fillText(label, x - 34, y); x -= w;
    }
    y += 54;
  };

  if (spec.where === "top" && units) {
    for (const ct of topCities(cityShares(units, ids))) {
      ctx.fillStyle = c.card; ctx.strokeStyle = ct.biggest ? css("--signal") : c.line; ctx.lineWidth = ct.biggest ? 5 : 2;
      ctx.beginPath(); ctx.roundRect(L, y, R - L, 130, 22); ctx.fill(); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `700 40px ${body}`; ctx.fillText(ct.name, R - 30, y + 50);
      ctx.fillStyle = c.soft; ctx.font = `500 26px ${body}`; ctx.fillText([ct.share22 === null ? "" : `2022: ${Math.round(ct.share22)}%`, ct.biggest ? "השינוי הגדול ביותר" : ""].filter(Boolean).join(" · "), R - 30, y + 96);
      ctx.textAlign = "left"; ctx.fillStyle = c.ink; ctx.font = `800 64px ${num}`; ctx.fillText(ltrText(`${Math.round(ct.share26)}%`), L + 30, y + 58);
      if (ct.share22 !== null) { const d = ct.share26 - ct.share22; ctx.font = `700 28px ${num}`; ctx.fillStyle = c.soft; ctx.fillText(ltrText(`${d >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(d))}%`), L + 30, y + 106); }
      y += 150;
    }
  } else if (matrix) {
    if (spec.who === "all") {
      const rows = flowsFor(spec.mode).lists.cameFrom.filter((r) => r.id !== "other" && r.id !== "abstain" && r.total > 0);
      const m = matrix === flow.modes[spec.mode].flows ? rows : rows.map((r) => ({ ...r, parts: cameFromGroup(matrix, [r.id]) }));
      stacked(m, bloc2022); legend();
    } else sources(cameFromGroup(matrix, ids));
  } else if (units && place) {
    // עיר עם מעט קלפיות: רק האחוזים, 2022 מול 2026
    const list = (spec.who === "all" ? Object.keys(LETTER_OF).filter((id) => id !== "other") : [ids]).map((x) => cityShares({ ...units, places: { [place[0]]: place[1] } }, Array.isArray(x) ? x : [x])[0]);
    const names = spec.who === "all" ? Object.keys(LETTER_OF).filter((id) => id !== "other") : [groupName];
    list.map((s, i) => ({ s, n: spec.who === "all" ? newName(names[i]) : names[i] })).filter(({ s }) => s.share26 >= 1).sort((a, b) => b.s.share26 - a.s.share26).slice(0, 8).forEach(({ s, n }) => {
      ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `600 34px ${body}`; ctx.fillText(n, R, y + 26);
      ctx.textAlign = "left"; ctx.font = `800 48px ${num}`; ctx.fillText(ltrText(`${Math.round(s.share26)}%`), L, y + 26);
      if (s.share22 !== null) { ctx.fillStyle = c.soft; ctx.font = `500 28px ${num}`; ctx.fillText(ltrText(`2022: ${Math.round(s.share22)}%`), L + 150, y + 28); }
      y += 70;
    });
    ctx.textAlign = "center"; ctx.fillStyle = c.soft; ctx.font = `400 26px ${body}`; ctx.fillText("בעיר יש מעט קלפיות להשוואה, ולכן מוצגים רק האחוזים", IMG_W / 2, y + 10); y += 50;
  }

  if (spec.blocs && (matrix || spec.where !== "city")) {
    y += 30; ctx.textAlign = "right"; ctx.fillStyle = c.ink; ctx.font = `800 40px ${display}`; ctx.fillText("מעבר בין הגושים", R, y); y += 50;
    const blocRows = blocsOf(matrix ?? flow.modes[spec.mode].flows).cameFrom.filter((r) => BLOC_IDS.slice(0, 4).includes(r.id));
    stacked(blocRows, (id) => id); legend();
  }
  // תחתית: קוד QR וכתובת האתר
  y += 30; drawQr(ctx, `${SITE_URL}#/changes`, L, y, QR_SIZE);
  ctx.textAlign = "right"; ctx.fillStyle = c.soft; ctx.font = `400 30px ${body}`;
  ctx.fillText(`השוואת כל הקלפיות באתר · ${ltrText(host)}`, R, y + QR_SIZE / 2, R - L - QR_SIZE - 30);
  y += QR_SIZE + 60;
  const out = document.createElement("canvas"); out.width = IMG_W; out.height = Math.max(y, 1080);
  const o = out.getContext("2d")!; o.fillStyle = c.bg; o.fillRect(0, 0, IMG_W, out.height); o.drawImage(cv, 0, 0);
  return await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("image"))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []; let line = "";
  for (const w of text.split(" ")) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t; }
  return line ? [...out, line] : out;
}

const PARTIES = flow.new.filter((id) => id !== "other" && id !== "abstain");

/** חלון השיתוף של "מה השתנה": מי, איפה, וגושים — ותמונה באותו עיצוב של שאר תמונות השיתוף */
export default function FlowShare({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const [who, setWho] = useState<Who>("party");
  const [party, setParty] = useState(PARTIES[0]);
  const [where, setWhere] = useState<Where>("country");
  const [city, setCity] = useState("");
  const [blocs, setBlocs] = useState(false);
  const [units, setUnits] = useState<Units | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}flow-units.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setUnits).catch(() => setMsg("נתוני הערים לא נטענו.")); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  // ערים בולטות — רק לחרדים או למפלגה
  const effWhere: Where = where === "top" && who === "all" ? "country" : where;
  const names = useMemo(() => Object.entries(units?.places ?? {}).filter(([c]) => c !== ENVELOPES).map(([, p]) => p.name).sort(), [units]);
  const cityReady = effWhere !== "city" || names.includes(city.trim());
  useEffect(() => {
    if (!cityReady || (effWhere !== "country" && !units)) return;
    let live = true;
    render({ who, party, where: effWhere, city, blocs, mode }, units)
      .then((b) => { if (!live) return; setFile(new File([b], "elections26-changes.png", { type: "image/png" })); setUrl(URL.createObjectURL(b)); })
      .catch(() => live && setMsg("הכנת התמונה לא הצליחה."));
    return () => { live = false; };
  }, [who, party, effWhere, city, blocs, mode, units, cityReady]);
  const share = async () => {
    if (!file) return;
    const text = `מאיפה הגיעו המצביעים של כל מפלגה?\nהשוואה של כל הקלפיות, 2022 מול 2026\n${SITE_URL}#/changes`;
    try {
      if (navigator.canShare?.({ files: [file], text })) await navigator.share({ files: [file], text });
      else if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else save();
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg("השיתוף לא הצליח. אפשר לשמור ולשתף."); }
  };
  const save = () => { if (!url || !file) return; const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); };
  const seg = <T extends string>(label: string, value: T, set: (v: T) => void, opts: { id: T; label: string; disabled?: boolean }[]) => (
    <div className="f-seg fit" role="group" aria-label={label}>
      {opts.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} disabled={o.disabled} onClick={() => set(o.id)}>{o.label}</button>)}
    </div>
  );
  return createPortal(<div className="f-modal" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === "Escape" && onClose()}>
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="f-flow-share">
      <h2 id="f-flow-share" className="text-lg font-bold">שיתוף: מה השתנה</h2>
      {seg("מי", who, setWho, [{ id: "all", label: "כל המפלגות" }, { id: "haredi", label: "חרדים" }, { id: "party", label: "מפלגה" }])}
      {who === "party" && <label className="grid gap-1 text-sm">מפלגה
        <select value={party} onChange={(e) => setParty(e.target.value)} className="bg-paper border border-line rounded-xl px-3 py-2 w-full text-base">
          {PARTIES.map((id) => <option key={id} value={id}>{newName(id)}</option>)}
        </select></label>}
      {seg("איפה", effWhere, setWhere, [{ id: "country", label: "כל הארץ" }, { id: "top", label: "ערים בולטות", disabled: who === "all" }, { id: "city", label: "עיר" }])}
      {effWhere === "city" && <label className="grid gap-1 text-sm">עיר
        <input list="flow-share-cities" value={city} onChange={(e) => setCity(e.target.value)} className="bg-paper border border-line rounded-xl px-3 py-2 w-full text-base" />
        <datalist id="flow-share-cities">{names.map((n) => <option key={n} value={n} />)}</datalist></label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blocs} onChange={(e) => setBlocs(e.target.checked)} className="w-5 h-5" />להוסיף מעבר בין הגושים</label>
      {url && cityReady ? <img src={url} alt="תמונת שיתוף: מה השתנה" /> : <p className="text-sm text-ink-soft">{effWhere === "city" && !cityReady ? "בחרו עיר מהרשימה." : "מכינים את התמונה…"}</p>}
      {file && cityReady && <div className="flex gap-2"><button type="button" className="f-btn pri flex-1" onClick={share}>שיתוף</button><button type="button" className="f-btn flex-1" onClick={save}>שמירה</button></div>}
      <button type="button" className="f-btn" onClick={onClose}>סגירה</button>
      {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
    </div></div>, document.body);
}


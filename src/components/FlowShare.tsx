import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SITE_URL } from "../lib/shareGuess";
import { sharePalette, IMG_W, ltrText, drawQr, QR_SIZE } from "../pages/guess/shareImage";
import { BLOC_COLORS, THEMES } from "../lib/promoVideo";
import { results2026 } from "../lib/guessAccuracyData";
import { DEFAULT_LINEAGE } from "../lib/lineage";
import { BLOC_MEMBERS } from "../lib/simpleSources";
import { BLOC_IDS, BLOC_NAMES, bloc2022, bloc2026, blocsOf, cameFromGroup, flow, flowsFor, newName, partialLine, type FlowPart, type FlowRow, type Mode } from "../lib/voterFlow";

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

/** תמונת השיתוף בגווני הגזרה (הכרעת בעלים 28.10.2026): רקע כהה עם הילות כחול ואדום, מסגרת מעוגלת, כרטיסים רכים; אחוזים בלבד */
async function render(spec: Spec, units: Units | null): Promise<Blob> {
  const { display, body, num } = await sharePalette();
  const P = THEMES.hagzara;
  const blocColor = (b: string) => BLOC_COLORS[b] ?? "rgba(255,255,255,.28)";
  const cv = document.createElement("canvas"); cv.width = IMG_W; cv.height = 3600;
  const ctx = cv.getContext("2d")!; ctx.direction = "rtl"; ctx.textBaseline = "middle";
  const R = IMG_W - 90, L = 90, CW = R - L;
  const ids = spec.who === "haredi" ? [...BLOC_MEMBERS.haredi] : spec.who === "party" ? [spec.party] : [];
  const groupName = spec.who === "haredi" ? "המפלגות החרדיות" : newName(spec.party);
  const place = spec.where === "city" && units ? Object.entries(units.places).find(([, p]) => p.name === spec.city.trim()) : undefined;
  const cityData = place ? (flow as unknown as { cities?: Record<string, { flows: number[][] }> }).cities?.[place[0]] : undefined;
  const matrix = cityData?.flows ?? (spec.where === "city" ? null : flow.modes[spec.mode].flows);
  const where = spec.where === "country" ? "כל הארץ" : spec.where === "top" ? "ערים בולטות" : place?.[1].name ?? spec.city;
  const card = (x: number, yy: number, w: number, h: number, stroke?: string) => {
    ctx.fillStyle = P.card; ctx.beginPath(); ctx.roundRect(x, yy, w, h, 28); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.stroke(); }
  };
  const pill = (x: number, yy: number, w: number, h: number, color: string) => { if (w < 1) return; ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, yy, w, h, h / 2); ctx.fill(); };
  const pct = (v: number) => ltrText(`${Math.round(v)}%`);

  // כותרת
  let y = 120;
  ctx.textAlign = "center"; ctx.fillStyle = P.ink; ctx.font = `800 62px ${display}`;
  const title = spec.where === "top" ? (spec.who === "party" ? `איפה ${groupName} הכי חזקה?` : "איפה החרדים הכי חזקים?")
    : spec.who === "all" ? "מי הגיע מאיפה?" : `מאיפה הגיעו המצביעים של ${groupName}?`;
  for (const line of wrap(ctx, title, CW)) { ctx.fillText(line, IMG_W / 2, y); y += 76; }
  ctx.fillStyle = P.soft; ctx.font = `500 32px ${body}`; ctx.fillText(`${where} · 2022 מול 2026`, IMG_W / 2, y); y += 56;
  ctx.font = `500 26px ${body}`; const pl = partialLine(), pw = ctx.measureText(pl).width + 48;
  pill(IMG_W / 2 - pw / 2, y - 22, pw, 44, P.faint); ctx.fillStyle = P.ink; ctx.fillText(pl, IMG_W / 2, y); y += 70;

  /** מאיפה הגיעו: כרטיס עם שורה לכל מקור — שם, פס בצבע הגוש של 2022 ואחוז גדול */
  const sources = (list: FlowPart[]) => {
    const rows = list.filter((x) => x.share >= MIN_SHARE).slice(0, 6), h = 60 + rows.length * 96;
    card(L, y, CW, h); y += 48;
    for (const p of rows) {
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `600 34px ${body}`; ctx.fillText(p.name, R - 36, y + 8);
      ctx.textAlign = "left"; ctx.font = `800 54px ${num}`; ctx.fillText(pct(p.share), L + 36, y + 10);
      // פס דק מתחת לשורה: המסלול המלא, והחלק בצבע הגוש של 2022
      const x0 = L + 36, W = R - 36 - x0;
      pill(x0, y + 44, W, 12, P.track);
      pill(R - 36 - W * p.share / 100, y + 44, W * p.share / 100, 12, blocColor(bloc2022(p.id)));
      y += 96;
    }
    y += 20;
  };
  /** כל המפלגות: רשת כרטיסים — לכל רשימה המקור העיקרי באחוז גדול, והמקור השני בקטן */
  const grid = (rows: FlowRow[]) => {
    const gap = 24, w = (CW - gap) / 2, h = 170;
    rows.forEach((r, i) => {
      const col = i % 2, x = R - (col + 1) * w - col * gap, yy = y + Math.floor(i / 2) * (h + gap);
      const [a, b] = r.parts.filter((p) => p.id !== "abstain" && p.id !== "other");
      card(x, yy, w, h);
      pill(x + w - 30, yy + 28, 8, h - 56, blocColor(bloc2026(r.id)));
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `700 32px ${body}`;
      let n = r.name; while (ctx.measureText(n).width > w - 70 && n.length > 3) n = n.slice(0, -2) + "…";
      ctx.fillText(n, x + w - 52, yy + 44);
      if (a) {
        ctx.font = `800 52px ${num}`; ctx.fillText(pct(a.share), x + w - 52, yy + 104);
        const nw = ctx.measureText(pct(a.share)).width;
        ctx.fillStyle = P.soft; ctx.font = `500 26px ${body}`; ctx.fillText(`מ${a.name}`, x + w - 52 - nw - 14, yy + 108, w - nw - 90);
      }
      if (b) { ctx.fillStyle = P.soft; ctx.font = `500 24px ${body}`; ctx.fillText(`${Math.round(b.share)}% מ${b.name}`, x + w - 52, yy + 146, w - 80); }
    });
    y += Math.ceil(rows.length / 2) * (h + gap) + 10;
  };
  /** מעבר בין הגושים: לכל גוש של 2026 פס מוערם בצבעי הגושים של 2022 */
  const blocs = (rows: FlowRow[]) => {
    ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `800 42px ${display}`; ctx.fillText("מעבר בין הגושים", R, y + 10); y += 60;
    card(L, y, CW, 60 + rows.length * 100 + 70); y += 50;
    for (const r of rows) {
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `600 30px ${body}`; ctx.fillText(r.name, R - 36, y);
      let x = R - 36; const W = CW - 72;
      for (const p of r.parts) {
        const w = W * p.share / 100; pill(x - w + 2, y + 28, w - 4, 40, blocColor(p.id === "abstain" || p.id === "other" ? "" : p.id));
        ctx.font = `700 24px ${num}`; const t = pct(p.share);
        if (w > ctx.measureText(t).width + 20) { ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText(t, x - w / 2, y + 49); }
        x -= w;
      }
      y += 100;
    }
    // מקרא
    ctx.font = `500 24px ${body}`; let x = R - 36;
    for (const b of [...BLOC_IDS.slice(0, 4), "abstain"]) {
      const label = b === "abstain" ? "לא הצביעו" : BLOC_NAMES[b], w = ctx.measureText(label).width + 56;
      if (x - w < L + 36) { x = R - 36; y += 38; }
      pill(x - 20, y - 10, 20, 20, blocColor(b === "abstain" ? "" : b)); ctx.textAlign = "right"; ctx.fillStyle = P.soft; ctx.fillText(label, x - 30, y); x -= w;
    }
    y += 60;
  };

  if (spec.where === "top" && units) {
    for (const ct of topCities(cityShares(units, ids))) {
      card(L, y, CW, 140, ct.biggest ? P.blueHi : undefined);
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `700 42px ${body}`; ctx.fillText(ct.name, R - 36, y + 52);
      ctx.fillStyle = P.soft; ctx.font = `500 26px ${body}`;
      ctx.fillText([ct.share22 === null ? "" : `2022: ${Math.round(ct.share22)}%`, ct.biggest ? "השינוי הגדול ביותר" : ""].filter(Boolean).join(" · "), R - 36, y + 102);
      ctx.textAlign = "left"; ctx.fillStyle = P.ink; ctx.font = `800 66px ${num}`; ctx.fillText(pct(ct.share26), L + 36, y + 62);
      if (ct.share22 !== null) {
        const d = ct.share26 - ct.share22; ctx.font = `700 28px ${num}`; ctx.fillStyle = d >= 0 ? P.blueHi : P.redHi;
        ctx.fillText(ltrText(`${d >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(d))}%`), L + 36, y + 112);
      }
      y += 160;
    }
  } else if (matrix) {
    if (spec.who === "all") {
      const rows = flowsFor(spec.mode).lists.cameFrom.filter((r) => r.id !== "other" && r.id !== "abstain" && r.total > 0 && (results2026.seats[r.id] ?? 0) > 0)
        .map((r) => (matrix === flow.modes[spec.mode].flows ? r : { ...r, parts: cameFromGroup(matrix, [r.id]) }));
      grid(rows);
    } else sources(cameFromGroup(matrix, ids));
  } else if (units && place) {
    // עיר עם מעט קלפיות: רק האחוזים, 2022 מול 2026
    const keys = spec.who === "all" ? Object.keys(LETTER_OF).filter((id) => id !== "other").map((id) => [id]) : [ids];
    const list = keys.map((k) => ({ s: cityShares({ ...units, places: { [place[0]]: place[1] } }, k)[0], n: spec.who === "all" ? newName(k[0]) : groupName }))
      .filter(({ s }) => s.share26 >= 1).sort((a, b) => b.s.share26 - a.s.share26).slice(0, 6);
    card(L, y, CW, 50 + list.length * 84); y += 50;
    for (const { s, n } of list) {
      ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `600 34px ${body}`; ctx.fillText(n, R - 36, y + 10);
      ctx.textAlign = "left"; ctx.font = `800 50px ${num}`; ctx.fillText(pct(s.share26), L + 36, y + 10);
      if (s.share22 !== null) { ctx.fillStyle = P.soft; ctx.font = `500 26px ${num}`; ctx.fillText(ltrText(`2022: ${Math.round(s.share22)}%`), L + 180, y + 12); }
      y += 84;
    }
    ctx.textAlign = "center"; ctx.fillStyle = P.soft; ctx.font = `400 26px ${body}`; ctx.fillText("בעיר יש מעט קלפיות להשוואה, ולכן מוצגים רק האחוזים", IMG_W / 2, y + 20); y += 70;
  }
  if (spec.blocs && (matrix || spec.where !== "city")) { y += 20; blocs(blocsOf(matrix ?? flow.modes[spec.mode].flows).cameFrom.filter((r) => BLOC_IDS.slice(0, 4).includes(r.id))); }

  // תחתית: QR וכתובת האתר
  y += 20; drawQr(ctx, `${SITE_URL}#/changes`, L, y, QR_SIZE);
  ctx.textAlign = "right"; ctx.fillStyle = P.ink; ctx.font = `700 32px ${body}`; ctx.fillText("השוואת כל הקלפיות", R, y + 50);
  ctx.fillStyle = P.soft; ctx.font = `400 30px ${body}`; ctx.fillText(ltrText(host), R, y + 96);
  y += QR_SIZE + 80;

  // הרקע, ההילות והמסגרת — מתחת לתוכן, בגובה הסופי
  const H = Math.max(y, 1350);
  const out = document.createElement("canvas"); out.width = IMG_W; out.height = H;
  const o = out.getContext("2d")!;
  o.fillStyle = P.bg; o.fillRect(0, 0, IMG_W, H);
  const glow = (x: number, yy: number, r: number, rgb: string, a: number) => { const g = o.createRadialGradient(x, yy, 0, x, yy, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); o.fillStyle = g; o.fillRect(0, 0, IMG_W, H); };
  glow(IMG_W * .85, 120, 700, P.glowA, P.glowAlpha); glow(IMG_W * .1, H - 160, 700, P.glowB, P.glowBAlpha);
  const fr = o.createLinearGradient(0, 0, IMG_W, H); fr.addColorStop(0, P.blue); fr.addColorStop(1, P.red);
  o.strokeStyle = fr; o.lineWidth = 10; o.beginPath(); o.roundRect(22, 22, IMG_W - 44, H - 44, 48); o.stroke();
  // תמונה קצרה — התוכן ממורכז לגובה, בלי שטח ריק בתחתית
  o.drawImage(cv, 0, 0, IMG_W, y, 0, Math.max(0, (H - y) / 2), IMG_W, y);
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


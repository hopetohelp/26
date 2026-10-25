import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PartyAvatar } from "../../components/PartyAvatar";
import { nameOf, IDS } from "../guess/model";
import { POLLSTER_LOGOS } from "../../lib/pollsterLogos";
import { BLOC_IDS, PERSONAL_CELLS, SIMPLE_BLOCS, SIMPLE_FIRMS, blocTotal, UNITY_LISTS, defaultCell, personalBlocs, type BlocDef, simpleSelection, simpleSpread, simpleValue } from "../../lib/simpleSources";
import type { Selection } from "../../lib/dataResolver";
import { seatsFmt } from "../../lib/format";
import { THRESHOLD_SEATS } from "../../lib/crowdValidate";
import { largestRemainder } from "../../lib/fillAll";
import { shareOpacity } from "../../lib/capsule";
import { smartRange } from "../../components/ChartLegend";
import { useInterface } from "../../lib/interfaceMode";

const SOURCE_KEY = "elections26.simple-source";
let current = (() => { try { return localStorage.getItem(SOURCE_KEY) ?? "all"; } catch { return "all"; } })();
const listeners = new Set<(key: string) => void>();
/** מקור הסקרים של התצוגה הממוקדת. `averagesOnly`: רק ממוצע הסקרים או ממוצע 14 ו־i24 (הכנסת הממוצעת). */
/** `allowCrowd`: גם "טווח הניחושים" (מפתח crowd) — בממוצע הניחושים כשמנהל הקבוצה בחר להשוות לממוצע הניחושים */
export function useSimpleSource(averagesOnly = false, allowCrowd = false) {
  const [stored, setStored] = useState(current);
  useEffect(() => { listeners.add(setStored); return () => { listeners.delete(setStored); }; }, []);
  const key = stored === "crowd" ? (allowCrowd ? "crowd" : "all") : averagesOnly && stored !== "14-24" ? "all" : stored;
  return { key, selection: simpleSelection(key), averagesOnly, setKey: (next: string) => {
    current = next;
    try { localStorage.setItem(SOURCE_KEY, next); } catch { /* מקומי לביקור */ }
    listeners.forEach(fn => fn(next));
  } };
}
export type SimpleSource = ReturnType<typeof useSimpleSource>;

const Logo = ({ id, initials }: { id: string; initials: string }) => {
  const logo = POLLSTER_LOGOS[id];
  return logo ? <img src={`${import.meta.env.BASE_URL}${logo.file}`} alt="" /> : <span className="f-ini" aria-hidden="true">{initials}</span>;
};
const initialsOf = (name: string) => name.split(/[\s+,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("");

/**
 * סרגל בחירה נגלל: ממוצע, 14 ו־i24, ומכונים (רק כשמותר).
 * ranges = השוואה לממוצע הניחושים (הכרעת בעלים 25.10.2026): בחירת טווח — כל הסקרים, 14 ו־i24, או הניחושים של כל המשתתפים.
 */
export function SourceBar({ source, extra, ranges = false }: { source: SimpleSource; extra?: ReactNode; ranges?: boolean }) {
  const options: [string, ReactNode, string][] = [
    ["all", <span className="f-ini" aria-hidden="true">∑</span>, ranges ? "טווח כל הסקרים" : "ממוצע הסקרים"],
    ["14-24", <><Logo id="Channel 14" initials="14" /><Logo id="i24 News" initials="24" /></>, ranges ? "טווח 14 ו־i24" : "ממוצע 14 ו־i24"],
    ...(ranges ? [["crowd", <span className="f-ini" aria-hidden="true">✓</span>, "טווח הניחושים"] as [string, ReactNode, string]] : []),
    ...(source.averagesOnly ? [] : SIMPLE_FIRMS.map(f => [`firm:${f.id}`, <Logo id={f.id} initials={initialsOf(f.name)} />, f.name] as [string, ReactNode, string])),
  ];
  const seg = <div className={`f-seg ${source.averagesOnly ? "fit" : ""}`} role="group" aria-label="מקור הסקרים">{options.map(([key, icon, label]) =>
    <button key={key} type="button" aria-pressed={source.key === key} onClick={() => source.setKey(key)}>{icon}{label}</button>)}</div>;
  // משמאל למתג (הכרעת בעלים 24.10.2026): מספר המשתתפים הכללי, ולחברי הגזרה — גם של הגזרה
  return extra ? <div className="f-seg-row">{seg}{extra}</div> : seg;
}

export const fmt = (n: number | null | undefined) => n == null ? "—" : seatsFmt(n);
export function PartyName({ id }: { id: string }) {
  return <span className="f-who"><PartyAvatar id={id} size={34} /><span>{nameOf(id)}</span></span>;
}
/** הרשימות לפי הסדר של המקור הנבחר; רשימה בלי ערך בשום מקור נשמטת */
/** סדר המפלגות: מהגדול לקטן לפי ממוצע המשתתפים (הכרעת בעלים 25.10.2026); בשוויון או בלי נתוני משתתפים — לפי המקור הנבחר */
export function orderedLists(selection: Selection, extra: Record<string, number>[] = [], crowd: Record<string, number> = {}) {
  const value = (id: string) => simpleValue(selection, [id]) ?? 0;
  return IDS.filter(id => value(id) > 0 || [...extra, crowd].some(e => (e[id] ?? 0) >= .5)).sort((a, b) => (crowd[b] ?? 0) - (crowd[a] ?? 0) || value(b) - value(a));
}

const AXIS_MAX = 32;
const x = (v: number) => `${Math.min(100, v / AXIS_MAX * 100)}%`;
/** קפסולת הסקרים (הכרעת בעלים 25.10.2026): מ-0 עד הסקר הגבוה; מלאה עד הנמוך, ומשם נחלשת לפי חלק הסקרים שמגיעים לכל ערך */
function Capsule({ spread }: { spread: [number, number, number, number, number, number] }) {
  const [mn, p10, p25, p75, p90, mx] = spread;
  const one = mx - mn < .01, w = Math.max(mx, .6), pc = (v: number) => Math.round(v / w * 10000) / 100;
  const pts: [number, number][] = one ? [[0, 1], [mx, 1]] : [[0, 1], [mn, 1], [p10, .9], [p25, .75], [p75, .25], [p90, .1], [mx, 0]];
  const fill = (alpha: (o: number) => string) => `linear-gradient(270deg,${pts.map(([v, s]) => `${alpha(shareOpacity(s))} ${pc(v)}%`).join(",")})`;
  const mask = fill(o => `rgba(0,0,0,${o})`);
  // בצבעי הגזרה כל קפסולה עוברת בעצמה מאדום בהיר לכחול, בדגש על הכחול; מתחת לאחוז החסימה — בעיקר אדום (הכרעת בעלים 23.10.2026)
  const below = mx < THRESHOLD_SEATS;
  // מעבר עדין: הגוון מתחלף בהדרגה, והבדלי הבהירות הם אותם שלושה דרגים של המחקר המתקדם
  const heat = { background: below ? "linear-gradient(270deg,rgb(var(--heat-lo)),color-mix(in srgb,rgb(var(--heat-lo)) 70%,rgb(var(--heat-hi))))" : "linear-gradient(270deg,color-mix(in srgb,rgb(var(--heat-lo)) 55%,rgb(var(--heat-hi))),rgb(var(--heat-hi)) 70%)", WebkitMask: mask, mask };
  return <span className="f-cap" style={{ right: 0, width: x(w) }}><i style={heat} /></span>;
}
export type Mark = { value: number | null | undefined; kind?: "solid" | "dash" | "soft"; side: "up" | "down" };
/** גרף המפלגות: קפסולה לסקרים ותגיות ערך לקווים */
/** spreadOf = טווח אחר במקום טווח הסקרים (למשל טווח הניחושים של כל המשתתפים) */
export function PartyChart({ selection, lists, marks, legend, spreadOf }: { selection: Selection; lists: string[]; marks: (id: string) => Mark[]; legend: ReactNode; spreadOf?: (id: string) => [number, number, number, number, number, number] | null }) {
  const tall = lists.some(id => marks(id).some(m => m.side === "down"));
  return <div className="f-card">
    <div className="f-legend">{legend}</div>
    <div className="f-axis" aria-hidden="true"><span /><div className="font-num"><span>0</span><span>8</span><span>16</span><span>24</span><span>32</span></div></div>
    {lists.map(id => {
      const spread = spreadOf ? spreadOf(id) : simpleSpread(selection, id);
      return <div key={id} className={`f-row ${tall ? "tall" : ""}`}><PartyName id={id} />
        <div className="f-track" role="img" aria-label={`${nameOf(id)}: ${marks(id).filter(m => m.value != null).map(m => fmt(m.value)).join(", ")}`}>
          {spread && <Capsule spread={spread} />}
          {marks(id).map((m, i) => m.value == null ? null : <span key={i} className={`f-mark ${m.kind === "dash" ? "dash" : m.kind === "soft" ? "soft" : ""}`} style={{ right: x(m.value) }}><span className={`f-tag ${m.side}`}>{fmt(m.value)}</span></span>)}
        </div></div>;
    })}
  </div>;
}
export const LegendCapsule = ({ label = smartRange("הסקרים") }: { label?: string }) => <span><span className="f-lg-cap" />{label}</span>;
/** מקרא בתוך מסגרת כמו הקו שלו (רציף / מקוטע), עם מספר המשתתפים — כמו התאים בגרף (הכרעת בעלים 24.10.2026) */
export const LegendBox = ({ kind, label, n }: { kind?: "dash" | "soft"; label: string; n?: number | null }) => <span className={`f-lg-box ${kind ?? ""}`}>{label}{n != null && <b className="font-num">{n.toLocaleString("he-IL")}</b>}</span>;
export const LegendLine = ({ kind, label }: { kind?: "dash" | "soft"; label: string }) => <span><span className={`f-lg-line ${kind ?? ""}`} />{label}</span>;

/** גושים לתרשים; "חסר" — מנדטים שעוד לא חולקו */
type Slice = { id: string; name: string; short: string; lists: readonly string[]; value: number; color: string; shown: number };
/** צבע לכל תא בחלוקה האישית — מטוקני הגושים (חרדים וערבים באותו צבע כמו בחלוקה הקבועה) */
const PERSONAL_COLOR: Record<string, number> = { haredi: 2, right: 1, unity: 4, left: 5, arab: 3 };
/** `shown` = המספר המוצג: שלמים בשיטת השארית הגדולה, כך שסכום הגושים שווה לסך המעוגל (ממוצעים לא-שלמים לא יסתכמו ב-121) */
export function blocSlices(values: Record<string, number | null | undefined>, missing = 0, defs: readonly BlocDef[] = SIMPLE_BLOCS): Slice[] {
  const slices: Slice[] = defs.map((b, i) => ({ ...b, value: blocTotal(values, b.lists), color: `rgb(var(--bloc-${defs === SIMPLE_BLOCS ? i + 1 : PERSONAL_COLOR[b.id] ?? i + 1}))`, shown: 0 }));
  if (missing > 0) slices.push({ id: "missing", name: "חסר", short: "חסר", lists: [], value: missing, color: "rgb(var(--bloc-miss))", shown: 0 });
  const kept = slices.filter(s => s.value > 0);
  const shown = largestRemainder(Math.round(kept.reduce((a, s) => a + s.value, 0)), Object.fromEntries(kept.map(s => [s.id, s.value])));
  return kept.map(s => ({ ...s, shown: shown[s.id] }));
}

/** החלוקה האישית של הצופה (הכרעת בעלים 25.10.2026): העדפת תצוגה בלבד — לא משנה מנדטים ולא נשלחת כניחוש. נשמרת בדפדפן. */
const PERSONAL_KEY = "elections26.personal-blocs.v1";
type PersonalPrefs = { assign: Record<string, string>; show: boolean };
let personal: PersonalPrefs = (() => {
  try { const v = JSON.parse(localStorage.getItem(PERSONAL_KEY) ?? "{}"); return { assign: v?.assign && typeof v.assign === "object" ? v.assign : {}, show: v?.show === true }; }
  catch { return { assign: {}, show: false }; }
})();
const personalListeners = new Set<(v: PersonalPrefs) => void>();
export function usePersonalBlocs() {
  const [prefs, setPrefs] = useState(personal);
  useEffect(() => { personalListeners.add(setPrefs); return () => { personalListeners.delete(setPrefs); }; }, []);
  const save = (next: PersonalPrefs) => {
    personal = next;
    try { localStorage.setItem(PERSONAL_KEY, JSON.stringify(next)); } catch { /* מקומי לביקור */ }
    personalListeners.forEach(fn => fn(next));
  };
  return {
    ...prefs, defs: personalBlocs(prefs.assign),
    setShow: (show: boolean) => save({ ...prefs, show }),
    move: (id: string, cell: string) => { const assign = { ...prefs.assign }; if (cell === defaultCell(id)) delete assign[id]; else assign[id] = cell; save({ ...prefs, assign }); },
    reset: () => save({ ...prefs, assign: {} }),
  };
}

function Pop({ slice, values, at }: { slice: Slice; values: Record<string, number | null | undefined>; at: { left: number; top?: number } }) {
  const lists = slice.lists.filter(id => (values[id] ?? 0) > 0);
  return <div className="f-pop" style={{ left: at.left, top: at.top }}><strong>{slice.name} · <span className="font-num">{slice.shown}</span></strong>
    {lists.length > 0 && <ul>{lists.map(id => <li key={id}><PartyAvatar id={id} size={20} />{nameOf(id)}</li>)}</ul>}</div>;
}
function usePop() {
  const [pop, setPop] = useState<{ i: number; left: number; top?: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = () => setPop(null); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, []);
  const open = (i: number, el: Element, below: boolean) => {
    const h = host.current!.getBoundingClientRect(), r = el.getBoundingClientRect();
    setPop({ i, left: Math.max(0, Math.min(h.width - 200, r.left - h.left + r.width / 2 - 100)), top: below ? r.top - h.top + r.height / 2 : undefined });
  };
  const handlers = (i: number, below: boolean) => ({
    onMouseEnter: (e: React.MouseEvent) => open(i, e.currentTarget, below), onMouseLeave: () => setPop(null),
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (pop?.i === i) setPop(null); else open(i, e.currentTarget, below); },
  });
  return { pop, host, handlers };
}
/** האחדות בעוגה הכפולה: חלק האחדות בתוך נתניהו ובתוך אייזנקוט, והמיקום שלה (במנדטים מתחילת העוגה). */
export function unityOverlay(values: Record<string, number | null | undefined>) {
  const [net, , , eis] = SIMPLE_BLOCS;
  const inUnity = (lists: readonly string[]) => blocTotal(values, lists.filter(id => UNITY_LISTS.includes(id)));
  const netU = inUnity(net.lists), eisU = inUnity(eis.lists), netT = blocTotal(values, net.lists);
  return { id: "unity", name: "אחדות", short: "אחדות", lists: UNITY_LISTS, value: netU + eisU, start: netT - netU, color: "rgb(var(--bloc-unity))", shown: Math.round(netU + eisU) };
}
type Overlay = ReturnType<typeof unityOverlay>;
/**
 * שני החלקים הפנימיים שמחוץ לאחדות (הכרעת בעלים 25.10.2026): "ימין" בתוך נתניהו ו"שמאל" בתוך אייזנקוט.
 * באותו צבע של הגוש, אבל פרוסה נפרדת — בלחיצה מוצגות רק הרשימות שלה והמספר שלה. `start` = במנדטים מתחילת העוגה.
 */
function innerParts(values: Record<string, number | null | undefined>, ring: Slice[]): (Slice & { start: number })[] {
  const [net, , , eis] = SIMPLE_BLOCS;
  const color = (id: string) => ring.find(s => s.id === id)?.color ?? "currentColor";
  const part = (b: { id: string; name: string; short: string; lists: readonly string[] }, name: string, start: number) => { const lists = b.lists.filter(id => !UNITY_LISTS.includes(id)); const value = blocTotal(values, lists);
    return { id: `${b.id}-inner`, name, short: name, lists, value, color: color(b.id), shown: Math.round(value), start }; };
  const netT = blocTotal(values, net.lists), eisT = blocTotal(values, eis.lists), eisU = blocTotal(values, eis.lists.filter(id => UNITY_LISTS.includes(id)));
  return [part(net, "ימין", 0), part(eis, "שמאל", netT + eisU)].filter(p => p.value > 0 && p.start + p.value <= netT + eisT + 1e-9);
}
/** סדר העוגה הכפולה: נתניהו ואייזנקוט צמודים, כדי שהאחדות תהיה רצופה */
const DOUBLE_ORDER = ["netanyahu", "eisenkot", "arab", "haredi", "missing"];
/**
 * כיתוב בתוך פרוסה (הכרעת בעלים 25.10.2026): תמיד בתוכה ולא מסתיר את המספר; כשאין מקום — קטן יותר.
 * `w` — הרוחב שיש בפרוסה בגובה הכיתוב, `h` — העומק. כשגם השם הקטן ביותר לא נכנס — רק המספר.
 */
function SliceLabel({ x, y, w, h, name, short, value }: { x: number; y: number; w: number; h: number; name: string; short: string; value: number }) {
  const MAX = 14, MIN = 6, CH = .6; // רוחב משוער של תו ביחס לגודל הגופן
  const num = String(value);
  const fitName = (t: string) => Math.min(MAX * .75, w * .85 / (CH * t.length), h * .85 / 2.4);
  const text = fitName(name) >= 8 ? name : short;
  const fs = fitName(text);
  const fn = Math.max(MIN, Math.min(MAX, w * .85 / (CH * num.length), h * .85 / (fs >= MIN ? 2.4 / 1.35 : 1.1)));
  const common = { x, textAnchor: "middle" as const, fill: "#fff", pointerEvents: "none" as const };
  if (fs < MIN) return <text {...common} y={y + fn * .35} style={{ fontSize: fn }} fontWeight="700" className="font-num">{num}</text>;
  const nfs = Math.min(fn, fs * 1.35);
  return <><text {...common} y={y - nfs * .25} style={{ fontSize: fs }}>{text}</text><text {...common} y={y + nfs * .9} style={{ fontSize: nfs }} fontWeight="700" className="font-num">{num}</text></>;
}
/** עוגה מלאה (בלי חור), מלמעלה בכיוון השעון; אופציונלית — פלח אחדות פנימי. הכיתוב רק בתוך החלק שלו; הסכום מתחת לעוגה. */
function Pie({ slices, values, label, overlay, inner, parts = [] }: { slices: Slice[]; values: Record<string, number | null | undefined>; label: string; overlay?: Overlay; inner?: [number, number]; parts?: (Slice & { start: number })[] }) {
  const { pop, host, handlers } = usePop();
  const total = slices.reduce((s, b) => s + b.value, 0) || 1, R = 130, c = 140, rU = 80, toA = (seats: number) => seats / total * 2 * Math.PI - Math.PI / 2;
  const at = (a: number, rad: number) => [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  const sector = (a1: number, a2: number, rad: number) => {
    if (a2 - a1 >= 2 * Math.PI - 1e-6) return `M${c} ${c - rad}A${rad} ${rad} 0 1 1 ${c - .01} ${c - rad}Z`;
    const [x1, y1] = at(a1, rad), [x2, y2] = at(a2, rad);
    return `M${c} ${c}L${x1} ${y1}A${rad} ${rad} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`;
  };
  const u = overlay && overlay.value > 0 ? { a1: toA(overlay.start), a2: toA(overlay.start + overlay.value) } : null;
  const covered = (a: number) => u != null && a > u.a1 && a < u.a2;
  const shownTotal = slices.reduce((n, s) => n + s.shown, 0);
  let seats = 0;
  return <div className="f-pie" ref={host}><svg viewBox="0 0 280 280" role="img" aria-label={`${label}: ${slices.map(s => `${s.name} ${s.shown}`).join(", ")}${u ? `; אחדות ${overlay!.shown}` : ""}`}>
    {slices.map((s, i) => {
      const a1 = toA(seats), a2 = toA(seats + s.value), da = a2 - a1, mid = (a1 + a2) / 2;
      seats += s.value;
      const band = covered(mid), rad = band ? (R + rU) / 2 : R * .6;
      const [lx, ly] = at(mid, rad);
      const w = Math.min(2 * rad * Math.sin(Math.min(da, Math.PI) / 2), band ? 90 : 120), h = band ? R - rU : R * .55;
      return <g key={s.id} {...handlers(i, true)}><path className={s.id === "missing" ? "f-miss" : undefined} d={sector(a1, a2, R)} fill={s.color} stroke="rgb(var(--paper))" strokeWidth="2" />
        {s.value > 0 && <SliceLabel x={lx} y={ly} w={w} h={h} name={s.name} short={s.short} value={s.shown} />}</g>;
    })}
    {/* החלקים הפנימיים שמחוץ לאחדות — פרוסות נפרדות ללחיצה, באותו צבע (בלי כיתוב: הוא בחלק החיצוני) */}
    {u && parts.map((p, k) => { const a1 = toA(p.start), a2 = toA(p.start + p.value);
      return <path key={p.id} d={sector(a1, a2, rU)} fill={p.color} stroke="rgb(var(--paper))" strokeWidth="2" {...handlers(slices.length + 1 + k, true)} />; })}
    {inner && inner[1] > inner[0] && (() => { const a1 = toA(inner[0]), a2 = toA(inner[1]), [x1, y1] = at(a1, rU), [x2, y2] = at(a2, rU);
      return <path d={`M${x1} ${y1}A${rU} ${rU} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke="rgb(var(--paper))" strokeWidth="2" pointerEvents="none" />; })()}
    {u && (() => { const [lx, ly] = at((u.a1 + u.a2) / 2, rU * .5); return <g {...handlers(slices.length, true)}><path d={sector(u.a1, u.a2, rU)} fill={overlay!.color} stroke="rgb(var(--paper))" strokeWidth="2" />
      <SliceLabel x={lx} y={ly} w={Math.min(2 * rU * .5 * Math.sin(Math.min(u.a2 - u.a1, Math.PI) / 2), rU)} h={rU * .7} name={overlay!.name} short={overlay!.short} value={overlay!.shown} /></g>; })()}
  </svg>{shownTotal !== 120 && <p className="f-pie-total"><b className="font-num">{shownTotal}</b> מנדטים</p>}
    {(() => { const picked = pop && (slices[pop.i] ?? (u && pop.i === slices.length ? overlay : u ? parts[pop.i - slices.length - 1] : null));
      return pop && picked ? <Pop slice={picked} values={values} at={pop} /> : null; })()}</div>;
}
/** פס גושים (טלפון, צמוד לתחתית): שם הגוש כשיש מקום, מילה אחת כשצר. `overlay` — קו צר מתחת לפס, במקום האחדות (רק במתקדם; בממוקד אין אחדות בטלפון — הכרעת בעלים 25.10.2026). */
function Stack({ slices, values, label, overlay }: { slices: Slice[]; values: Record<string, number | null | undefined>; label: string; overlay?: Overlay }) {
  const { pop, host, handlers } = usePop();
  const total = slices.reduce((s, b) => s + b.value, 0);
  return <div className="f-stack-host" ref={host}><div className="f-stack" role="group" aria-label={label}>{slices.map((s, i) =>
    <button key={s.id} type="button" className={s.id === "missing" ? "f-miss" : undefined} aria-label={`${s.name} ${s.shown}`} style={{ flex: s.value, background: s.color }} {...handlers(i, false)}>
      {s.value >= 30 ? <span>{s.name}</span> : s.value >= 18 ? <span>{s.short}</span> : null}{s.shown}</button>)}
  </div>
    {overlay && overlay.value > 0 && <div className="f-unity-line"><span style={{ flex: overlay.start }} /><button type="button" aria-label={`אחדות ${overlay.shown}`} style={{ flex: overlay.value }} {...handlers(slices.length, false)}>אחדות {overlay.shown}</button><span style={{ flex: Math.max(0, total - overlay.start - overlay.value) }} /></div>}
    {pop && (slices[pop.i] ?? (overlay && pop.i === slices.length ? overlay : null)) && <Pop slice={slices[pop.i] ?? overlay!} values={values} at={pop} />}</div>;
}
/** עריכת החלוקה האישית — במקום אחד בלבד, באזור האישי. לכל רשימה בוחרים תא; אינה משנה מנדטים. */
export function PersonalBlocsEditor() {
  const personal = usePersonalBlocs();
  const cellOf = (id: string) => personal.defs.find(b => b.lists.includes(id))?.id ?? "unity";
  return <div className="f-blocedit">
    <label className="f-blocedit-show"><input type="checkbox" role="switch" checked={personal.show} aria-checked={personal.show} onChange={e => personal.setShow(e.target.checked)} />הצגת העוגה שלי (במצב מתקדם)</label>
    <p>בחרו לכל רשימה לאיזה חלק היא שייכת. זה משנה רק את התצוגה, לא את המנדטים.</p>
    <ul>{BLOC_IDS.map(id => <li key={id}><PartyAvatar id={id} size={22} /><span className="f-blocedit-name">{nameOf(id)}</span>
      <select aria-label={`החלק של ${nameOf(id)}`} value={cellOf(id)} onChange={e => personal.move(id, e.target.value)}>{PERSONAL_CELLS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></li>)}</ul>
    <button type="button" className="f-blocedit-reset" onClick={personal.reset}>חזרה לחלוקה המקורית</button>
  </div>;
}
/** העוגה הכפולה לבדה (בלי פס הטלפון) — לתצוגות הגושים במתקדם */
export function DoublePie({ values, missing = 0 }: { values: Record<string, number | null | undefined>; missing?: number }) {
  const fixed = blocSlices(values, missing);
  const ring = [...fixed].sort((a, b) => DOUBLE_ORDER.indexOf(a.id) - DOUBLE_ORDER.indexOf(b.id));
  const inner: [number, number] = [0, blocTotal(values, SIMPLE_BLOCS[0].lists) + blocTotal(values, SIMPLE_BLOCS[3].lists)];
  return <div className="f-pie-wrap is-inline"><Pie slices={ring} values={values} label="החלוקה הקבועה והאחדות" overlay={unityOverlay(values)} inner={inner} parts={innerParts(values, ring)} /></div>;
}
/**
 * חלוקות הכנסת (הכרעת בעלים 25.10.2026): עוגה כפולה — הקבועה, ובתוכה האחדות (קבועה לכולם); קו העיגול הפנימי לכל אורך נתניהו ואייזנקוט.
 * העוגה האישית — רק במתקדם, ורק כשהמשתמש הפעיל אותה (במחשב בנוסף לכפולה, בטלפון במקומה). העריכה — באזור האישי.
 */
export function BlocChart({ values, missing = 0, logo = null }: { values: Record<string, number | null | undefined>; missing?: number; logo?: string | null }) {
  const personal = usePersonalBlocs();
  const { advanced } = useInterface();
  const showMine = advanced && personal.show;
  const fixed = blocSlices(values, missing), unity = unityOverlay(values);
  const rank = (id: string, order: string[]) => order.indexOf(id);
  const ring = [...fixed].sort((a, b) => rank(a.id, DOUBLE_ORDER) - rank(b.id, DOUBLE_ORDER));
  const BAR = ["haredi", "netanyahu", "eisenkot", "arab", "missing"];
  const bar = [...fixed].sort((a, b) => rank(a.id, BAR) - rank(b.id, BAR));
  const inner: [number, number] = [0, blocTotal(values, SIMPLE_BLOCS[0].lists) + blocTotal(values, SIMPLE_BLOCS[3].lists)];
  const unityBar = { ...unity, start: blocTotal(values, SIMPLE_BLOCS[1].lists) + unity.start };
  const mine = showMine ? blocSlices(values, missing, personal.defs) : [];
  return <>
    <div className="f-pie-wrap">{logo && <img src={logo} alt="הגזרה" className="f-glogo" />}
      <Pie slices={ring} values={values} label="החלוקה הקבועה והאחדות" overlay={unity} inner={inner} parts={innerParts(values, ring)} />
      {showMine && <figure className="f-pie-mine"><figcaption>החלוקה שלי</figcaption><Pie slices={mine} values={values} label="החלוקה שלי" /></figure>}
      {advanced && <div className="f-pie-tools"><label><input type="checkbox" role="switch" checked={personal.show} aria-checked={personal.show} onChange={e => personal.setShow(e.target.checked)} />הצגת העוגה שלי</label><Link to="/account?blocs">עריכת החלוקה שלי</Link></div>}
    </div>
    <div className="f-dock floating">{showMine ? <Stack slices={mine} values={values} label="החלוקה שלי" /> : <Stack slices={bar} values={values} label="החלוקה הקבועה" overlay={advanced ? unityBar : undefined} />}</div>
  </>;
}
/** פס הגושים בתוך התוכן (למשל במסך הנעול) */
export function InlineBlocBar({ values, missing = 0 }: { values: Record<string, number | null | undefined>; missing?: number }) {
  const slices = blocSlices(values, missing);
  return <div className="f-stack" role="img" aria-label={slices.map(s => `${s.name} ${s.shown}`).join(", ")}>{slices.map(s => <button key={s.id} type="button" className={s.id === "missing" ? "f-miss" : undefined} tabIndex={-1} style={{ flex: s.value, background: s.color }}>{s.value >= 18 && <span>{s.short}</span>}{s.shown}</button>)}</div>;
}
/** נתוני הגזרה = כלל המשתתפים (הכרעת בעלים 25.10.2026); מתחת לכותרת — כמה מהמשתתפים הם חברי הגזרה. בלי מספר כשהנתון לא נטען. */
export function HagzaraCount({ members, total }: { members?: number | null; total?: number | null }) {
  if (members == null || !total) return null;
  return <p className="f-gcount"><b className="font-num">{members.toLocaleString("he-IL")}/{total.toLocaleString("he-IL")}</b> חברים בהגזרה</p>;
}
/** ממוצע הניחושים (הכרעת בעלים 25.10.2026): בגדול — כמה ניחשו (כל הניחושים); לחבר הגזרה בקטן מתחת — X/N חברים בהגזרה */
export function GuessCount({ total, members }: { total?: number | null; members?: number | null }) {
  if (!total) return null;
  return <div className="f-guesses"><p><b className="font-num">{total.toLocaleString("he-IL")}</b> ניחשו</p>{members != null && <HagzaraCount members={members} total={total} />}</div>;
}
export function FocusFoot() {
  return <div className="f-foot"><Link to="/method" className="f-info" aria-label="מידע ומקורות">i</Link><Link to="/method">מידע ומקורות</Link></div>;
}

/** הודעה קצרה צפה, שנשארת גם אחרי מעבר מסך (נבנית מחוץ ל-React ונעלמת לבד) */
export function flashNotice(text: string) {
  document.querySelector(".f-toast")?.remove();
  const el = document.createElement("div");
  el.className = "f-toast"; el.setAttribute("role", "status"); el.textContent = text;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 3500);
}

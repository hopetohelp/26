import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PartyAvatar } from "../../components/PartyAvatar";
import { nameOf, IDS } from "../guess/model";
import { POLLSTER_LOGOS } from "../../lib/pollsterLogos";
import { SIMPLE_BLOCS, SIMPLE_FIRMS, blocTotal, simpleSelection, simpleSpread, simpleValue } from "../../lib/simpleSources";
import type { Selection } from "../../lib/dataResolver";
import { seatsFmt } from "../../lib/format";
import { THRESHOLD_SEATS } from "../../lib/crowdValidate";
import { largestRemainder } from "../../lib/fillAll";
import { shareOpacity } from "../../lib/capsule";

const SOURCE_KEY = "elections26.simple-source";
let current = (() => { try { return localStorage.getItem(SOURCE_KEY) ?? "all"; } catch { return "all"; } })();
const listeners = new Set<(key: string) => void>();
/** מקור הסקרים של התצוגה הממוקדת. `averagesOnly`: רק ממוצע הסקרים או ממוצע 14 ו־i24 (הכנסת הממוצעת). */
export function useSimpleSource(averagesOnly = false) {
  const [stored, setStored] = useState(current);
  useEffect(() => { listeners.add(setStored); return () => { listeners.delete(setStored); }; }, []);
  const key = averagesOnly && stored !== "14-24" ? "all" : stored;
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

/** סרגל בחירה נגלל: ממוצע, 14 ו־i24, ומכונים (רק כשמותר) */
export function SourceBar({ source, extra }: { source: SimpleSource; extra?: ReactNode }) {
  const options: [string, ReactNode, string][] = [
    ["all", <span className="f-ini" aria-hidden="true">∑</span>, "ממוצע הסקרים"],
    ["14-24", <><Logo id="Channel 14" initials="14" /><Logo id="i24 News" initials="24" /></>, "ממוצע 14 ו־i24"],
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
export function orderedLists(selection: Selection, extra: Record<string, number>[] = []) {
  const value = (id: string) => simpleValue(selection, [id]) ?? 0;
  return IDS.filter(id => value(id) > 0 || extra.some(e => (e[id] ?? 0) >= .5)).sort((a, b) => value(b) - value(a));
}

const AXIS_MAX = 32;
const x = (v: number) => `${Math.min(100, v / AXIS_MAX * 100)}%`;
/** קפסולת הסקרים (הכרעת בעלים 25.10.2026): מ-0 עד הסקר הגבוה; מלאה עד הנמוך, ומשם נחלשת לפי חלק הסקרים שמגיעים לכל ערך */
function Capsule({ spread }: { spread: [number, number, number, number, number, number] }) {
  const [mn, p10, p25, p75, p90, mx] = spread;
  const one = mx - mn < .01, w = Math.max(mx, .6), pc = (v: number) => Math.round(v / w * 10000) / 100;
  const pts: [number, number][] = one ? [[0, 1], [mx, 1]] : [[0, 1], [mn, 1], [p10, .9], [p25, .75], [p75, .25], [p90, .1], [mx, 0]];
  const fill = (alpha: (o: number) => string) => `linear-gradient(90deg,${pts.map(([v, s]) => `${alpha(shareOpacity(s))} ${pc(v)}%`).join(",")})`;
  const mask = fill(o => `rgba(0,0,0,${o})`);
  // בצבעי הגזרה כל קפסולה עוברת בעצמה מאדום בהיר לכחול, בדגש על הכחול; מתחת לאחוז החסימה — בעיקר אדום (הכרעת בעלים 23.10.2026)
  const below = mx < THRESHOLD_SEATS;
  // מעבר עדין: הגוון מתחלף בהדרגה, והבדלי הבהירות הם אותם שלושה דרגים של המחקר המתקדם
  const heat = { background: below ? "linear-gradient(90deg,rgb(var(--heat-lo)),color-mix(in srgb,rgb(var(--heat-lo)) 70%,rgb(var(--heat-hi))))" : "linear-gradient(90deg,color-mix(in srgb,rgb(var(--heat-lo)) 55%,rgb(var(--heat-hi))),rgb(var(--heat-hi)) 70%)", WebkitMask: mask, mask };
  return <span className="f-cap" style={{ left: 0, width: x(w) }}><i style={heat} /></span>;
}
export type Mark = { value: number | null | undefined; kind?: "solid" | "dash" | "soft"; side: "up" | "down" };
/** גרף המפלגות: קפסולה לסקרים ותגיות ערך לקווים */
export function PartyChart({ selection, lists, marks, legend }: { selection: Selection; lists: string[]; marks: (id: string) => Mark[]; legend: ReactNode }) {
  const tall = lists.some(id => marks(id).some(m => m.side === "down"));
  return <div className="f-card">
    <div className="f-legend">{legend}</div>
    <div className="f-axis" aria-hidden="true"><span /><div className="font-num"><span>0</span><span>8</span><span>16</span><span>24</span><span>32</span></div></div>
    {lists.map(id => {
      const spread = simpleSpread(selection, id);
      return <div key={id} className={`f-row ${tall ? "tall" : ""}`}><PartyName id={id} />
        <div className="f-track" role="img" aria-label={`${nameOf(id)}: ${marks(id).filter(m => m.value != null).map(m => fmt(m.value)).join(", ")}`}>
          {spread && <Capsule spread={spread} />}
          {marks(id).map((m, i) => m.value == null ? null : <span key={i} className={`f-mark ${m.kind === "dash" ? "dash" : m.kind === "soft" ? "soft" : ""}`} style={{ left: x(m.value) }}><span className={`f-tag ${m.side}`}>{fmt(m.value)}</span></span>)}
        </div></div>;
    })}
  </div>;
}
export const LegendCapsule = () => <span><span className="f-lg-cap" />טווח הסקרים</span>;
/** מקרא בתוך מסגרת כמו הקו שלו (רציף / מקוטע), עם מספר המשתתפים — כמו התאים בגרף (הכרעת בעלים 24.10.2026) */
export const LegendBox = ({ kind, label, n }: { kind?: "dash"; label: string; n?: number | null }) => <span className={`f-lg-box ${kind ?? ""}`}>{label}{n != null && <b className="font-num">{n.toLocaleString("he-IL")}</b>}</span>;
export const LegendLine = ({ kind, label }: { kind?: "dash" | "soft"; label: string }) => <span><span className={`f-lg-line ${kind ?? ""}`} />{label}</span>;

/** גושים לתרשים; "חסר" — מנדטים שעוד לא חולקו */
type Slice = { id: string; name: string; short: string; lists: readonly string[]; value: number; color: string; shown: number };
/** `shown` = המספר המוצג: שלמים בשיטת השארית הגדולה, כך שסכום הגושים שווה לסך המעוגל (ממוצעים לא-שלמים לא יסתכמו ב-121) */
export function blocSlices(values: Record<string, number | null | undefined>, missing = 0): Slice[] {
  const slices: Slice[] = SIMPLE_BLOCS.map((b, i) => ({ ...b, value: blocTotal(values, b.lists), color: `rgb(var(--bloc-${i + 1}))`, shown: 0 }));
  if (missing > 0) slices.push({ id: "missing", name: "חסר", short: "חסר", lists: [], value: missing, color: "rgb(var(--bloc-miss))", shown: 0 });
  const kept = slices.filter(s => s.value > 0);
  const shown = largestRemainder(Math.round(kept.reduce((a, s) => a + s.value, 0)), Object.fromEntries(kept.map(s => [s.id, s.value])));
  return kept.map(s => ({ ...s, shown: shown[s.id] }));
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
/** עוגה (מחשב וטאבלט): מלמעלה בכיוון השעון, שם ומספר על הפלח */
function Pie({ slices, values }: { slices: Slice[]; values: Record<string, number | null | undefined> }) {
  const { pop, host, handlers } = usePop();
  const total = slices.reduce((s, b) => s + b.value, 0) || 1, R = 112, r = 52, c = 130;
  const at = (a: number, rad: number) => [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  let a = -Math.PI / 2;
  return <div className="f-pie" ref={host}><svg viewBox="0 0 260 260" role="img" aria-label={slices.map(s => `${s.name} ${s.shown}`).join(", ")}>
    {slices.map((s, i) => {
      const da = s.value / total * 2 * Math.PI, a2 = a + da, [x1, y1] = at(a, R), [x2, y2] = at(a2, R), [x3, y3] = at(a2, r), [x4, y4] = at(a, r), big = da > Math.PI ? 1 : 0, [lx, ly] = at(a + da / 2, (R + r) / 2);
      a = a2;
      return <g key={s.id} {...handlers(i, true)}><path className={s.id === "missing" ? "f-miss" : undefined} d={`M${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${big} 0 ${x4} ${y4}Z`} fill={s.color} stroke="rgb(var(--paper))" strokeWidth="2" />
        {da > .35 && <><text x={lx} y={ly - 2} textAnchor="middle" fontSize={da > 1.4 ? 11 : 10} fill="#fff" pointerEvents="none">{da > 1.4 ? s.name : s.short}</text><text x={lx} y={ly + 13} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" className="font-num" pointerEvents="none">{s.shown}</text></>}</g>;
    })}
    <text x="130" y="134" textAnchor="middle" fontSize="26" fontWeight="700" fill="rgb(var(--ink))" className="font-num">120</text>
    <text x="130" y="154" textAnchor="middle" fontSize="11.5" fill="rgb(var(--ink-soft))">מנדטים</text>
  </svg>{pop && slices[pop.i] && <Pop slice={slices[pop.i]} values={values} at={pop} />}</div>;
}
/** פס גושים (טלפון, צמוד לתחתית): שם הגוש כשיש מקום, מילה אחת כשצר */
function Stack({ slices, values }: { slices: Slice[]; values: Record<string, number | null | undefined> }) {
  const { pop, host, handlers } = usePop();
  return <div className="f-dock floating" ref={host}><div className="f-stack">{slices.map((s, i) =>
    <button key={s.id} type="button" className={s.id === "missing" ? "f-miss" : undefined} aria-label={`${s.name} ${s.shown}`} style={{ flex: s.value, background: s.color }} {...handlers(i, false)}>
      {s.value >= 30 ? <span>{s.name}</span> : s.value >= 18 ? <span>{s.short}</span> : null}{s.shown}</button>)}
  </div>{pop && slices[pop.i] && <Pop slice={slices[pop.i]} values={values} at={pop} />}</div>;
}
/** סיכום הגושים: עוגה במחשב, פס צמוד לתחתית בטלפון. בלי כותרת ובלי מסגרת. */
export function BlocChart({ values, missing = 0, logo = null }: { values: Record<string, number | null | undefined>; missing?: number; logo?: string | null }) {
  const slices = blocSlices(values, missing);
  return <><div className="f-pie-wrap">{logo && <img src={logo} alt="הגזרה" className="f-glogo" />}<Pie slices={slices} values={values} /></div><Stack slices={slices} values={values} /></>;
}
/** פס הגושים בתוך התוכן (למשל במסך הנעול) */
export function InlineBlocBar({ values, missing = 0 }: { values: Record<string, number | null | undefined>; missing?: number }) {
  const slices = blocSlices(values, missing);
  return <div className="f-stack" role="img" aria-label={slices.map(s => `${s.name} ${s.shown}`).join(", ")}>{slices.map(s => <button key={s.id} type="button" className={s.id === "missing" ? "f-miss" : undefined} tabIndex={-1} style={{ flex: s.value, background: s.color }}>{s.value >= 18 && <span>{s.short}</span>}{s.shown}</button>)}</div>;
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

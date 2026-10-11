import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import ChartLegend, { rangeLine, type LegendEntry } from "./ChartLegend";
import { ProfileCandleV } from "./marks";
import type { TrendPoint } from "./charts";
import { candleProfiles, smoothPath, valueSegs, type Seg } from "../lib/chartLanguage";
import { dateRange, rng, seatsFmt } from "../lib/format";
import { dayMonth } from "../lib/home";
import { POINT_WINDOW } from "../lib/data";
import { labelIndexes, thinCandles, trendAxis } from "../lib/trendAxis";

/**
 * גרף המגמה האחיד של האתר (הכרעת בעלים 11.10.2026) — ברירת המחדל לכל גרף מגמה של סדרה אחת, חוץ מחריגים:
 * 1. נר כל 3 ימים (`POINT_DAYS`);
 * 2. כל נקודה: 14 הימים שמסתיימים בה, הסקר האחרון של כל מכון (`POINT_WINDOW`);
 * 3. נר בשלוש דרגות עובי לפי אחוזונים (`candleProfiles`);
 * 4. קווים מקווקווים כל 5 מנדטים, ובגרפים של גושים — 61 במקום 60 (`trendAxis`);
 * 5. חלון קטן במעבר עכבר, בלחיצה ובחצים: טווח התאריכים, הממוצע, הטווח בסקרים ומספר המכונים;
 * 6. כפתור "מקרא" בפינה הימנית העליונה.
 * הנתונים כ-`TrendPoint` (t, ממוצע v, lo, hi, n ו-xs = הערך בכל סקר). ציר הזמן משמאל (עבר) לימין (היום), והתאריך האחרון צמוד לימין.
 * חריגים (נשארים ב-`TrendChart`): כמה סדרות בגרף אחד, וגרפים בלי נתוני סקרים (הממוצע של המודל).
 */
const X0 = 10, X1 = 95, YT = 6, YB = 84;
const DAY = 86_400_000;

export interface CandleTrendProps {
  title: string;
  points: TrendPoint[];
  /** ממוצע יומי לקו החלק; בלעדיו הקו עובר דרך ממוצעי הנרות */
  line?: { t: number; v: number }[];
  /** קו הרוב (61) בגרפים של גושים: מחליף את קו 60 */
  majority?: number;
  /** כל כמה יחידות קו מקווקו (ברירת מחדל 5) */
  step?: number;
  windowDays?: number;
  /** "מנדטים" (ברירת מחדל) או "אחוזים" וכו' */
  unit?: string;
  /** התוצאה בפועל: עיגול ריק */
  markers?: { t: number; v: number }[];
  /** גובה בפיקסלים */
  height?: number;
}

const segsOf = (p: TrendPoint): Seg[] => (p.xs && p.xs.length ? valueSegs(p.xs) : p.lo !== undefined && p.hi !== undefined ? [{ from: p.lo, to: p.hi, count: 1 }] : []);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function CandleTrend({ title, points, line, majority, step = 5, windowDays = POINT_WINDOW, unit = "מנדטים", markers = [], height = 160 }: CandleTrendProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const calc = () => setWidth(el.clientWidth || 640);
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // לחיצה מחוץ לגרף סוגרת את החלון (במגע אין יציאה של מצביע)
  useEffect(() => {
    const off = (e: globalThis.PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setActive(null); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, []);

  const lineData = line && line.length ? line : points.map((p) => ({ t: p.t, v: p.v }));
  const shown = useMemo(() => thinCandles(points, (width * (X1 - X0)) / 100), [points, width]);
  const axis = useMemo(
    () => trendAxis([...points.flatMap((p) => [p.v, p.lo ?? p.v, p.hi ?? p.v, ...(p.xs ?? [])]), ...lineData.map((l) => l.v), ...markers.map((m) => m.v)], { step, majority }),
    [points, lineData, markers, step, majority],
  );
  const profiles = useMemo(() => candleProfiles(shown.map(segsOf)), [shown]);
  if (!lineData.length) return null;

  const tA = Math.min(lineData[0].t, shown[0]?.t ?? Infinity, ...markers.map((m) => m.t));
  const tB = Math.max(lineData[lineData.length - 1].t, shown[shown.length - 1]?.t ?? -Infinity, ...markers.map((m) => m.t));
  const X = (t: number) => (tB === tA ? X0 : X0 + ((X1 - X0) * (t - tA)) / (tB - tA));
  const Y = (v: number) => YB - ((YB - YT) * (v - axis.lo)) / (axis.hi - axis.lo);
  const lineD = smoothPath(lineData.map((l) => ({ x: X(l.t), y: Y(l.v) })));
  const ln = { vectorEffect: "non-scaling-stroke" as const };
  const lab = labelIndexes(shown.length, Math.max(2, Math.floor((width * (X1 - X0)) / 100 / 70)));
  const act = active !== null ? shown[active] : null;

  // הסמן: הנר הקרוב ביותר לאורך הציר
  const at = (clientX: number) => {
    const el = wrap.current;
    if (!el || !shown.length) return null;
    const r = el.getBoundingClientRect();
    const pct = ((clientX - r.left) / r.width) * 100;
    if (pct < X0 - 4 || pct > 100) return null;
    return shown.reduce((best, p, i) => (Math.abs(X(p.t) - pct) < Math.abs(X(shown[best].t) - pct) ? i : best), 0);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (e.pointerType !== "touch") setActive(at(e.clientX)); };
  const onDown = (e: PointerEvent<HTMLDivElement>) => setActive(at(e.clientX));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!shown.length) return;
    if (e.key === "Escape") return setActive(null);
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -999 : e.key === "End" ? 999 : 0;
    if (!step) return;
    e.preventDefault();
    setActive((cur) => Math.max(0, Math.min(shown.length - 1, cur === null ? shown.length - 1 : cur + step)));
  };

  const legend: LegendEntry[] = [
    { kind: "candle", text: rangeLine("full", "הסקרים", `ב-${windowDays} הימים של כל נקודה (הסקר האחרון של כל מכון)`) },
    { kind: "dot", text: "הממוצע בכל נקודה (נקודה כל 3 ימים)" },
    { kind: "line", text: "הממוצע בכל יום" },
    { kind: "dash", text: `קווים מקווקווים כל ${step} ${unit}${majority !== undefined && axis.lines.some((l) => l.major) ? `; ${majority} = הרוב` : ""}` },
    ...(markers.length ? [{ kind: "result" as const, text: "התוצאה בפועל" }] : []),
  ];

  const last = shown[shown.length - 1];
  return (
    <div>
      {/* הפינה הימנית העליונה */}
      <ChartLegend side="start" entries={legend} className="mb-1" />
      <div
        ref={wrap}
        dir="ltr"
        className="relative mt-1 outline-offset-2 touch-pan-y select-none"
        style={{ height: height + 28 }}
        tabIndex={0}
        role="group"
        aria-label={`${title}. חצים ימינה ושמאלה בין הנרות`}
        aria-describedby={`${id}-sr`}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") setActive(null); }}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute left-0 top-0 w-full" style={{ height }} aria-hidden="true">
          {axis.lines.map(({ v, major }) => (
            <line key={v} x1={X0} x2={100} y1={Y(v)} y2={Y(v)} className={major ? "stroke-ink" : "stroke-ink-faint"} strokeWidth={major ? 1.5 : 1} strokeDasharray="5 4" {...ln} />
          ))}
          <path d={lineD} className="fill-none stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" {...ln} />
        </svg>
        <div className="absolute left-0 top-0 w-full" style={{ height }}>
          {axis.lines.map(({ v, major }) => (
            <span key={v} aria-hidden="true" className={`absolute -translate-y-1/2 leading-none whitespace-nowrap text-end font-num ${major ? "text-sm font-extrabold" : "text-xs text-ink-faint"}`} style={{ right: `calc(${100 - X0}% + 6px)`, top: `${Y(v)}%` }}>{seatsFmt(v)}</span>
          ))}
          {act && <span aria-hidden="true" className="absolute top-0 bottom-0 -translate-x-1/2 w-8 bg-ink/[.07] rounded-[4px]" style={{ left: `${X(act.t)}%` }} />}
          {shown.map((p, i) => (p.lo === undefined && !p.xs ? null : <ProfileCandleV key={`c${p.t}`} segs={profiles[i]} y={Y} left={`${X(p.t)}%`} />))}
          {shown.map((p, i) => (
            <span key={`d${p.t}`} aria-hidden="true" className="mk mk-dot" style={{ left: `${X(p.t)}%`, top: `${Y(p.v)}%`, ...(i === active ? { borderColor: "rgb(var(--mk-mean))" } : null) }} />
          ))}
          {markers.map((m, i) => <span key={`m${i}`} aria-hidden="true" className="mk mk-ring" style={{ left: `${X(m.t)}%`, top: `${Y(m.v)}%` }} />)}
          {act && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-10 w-[140px] rounded-[9px] bg-ink px-[9px] py-[7px] text-[.72rem] leading-[1.3] text-paper shadow-[0_6px_22px_rgb(var(--ink)/.25)]"
              dir="rtl"
              style={{ top: `${(YT + YB) / 2}%`, transform: "translateY(-50%)", ...(X(act.t) > 55 ? { right: `calc(${100 - X(act.t)}% + 14px)` } : { left: `calc(${X(act.t)}% + 14px)` }) }}
            >
              <div className="mb-1 text-[.7rem] font-bold text-paper/65">חישוב: <bdi dir="ltr">{dateRange(iso(act.t - (windowDays - 1) * DAY), iso(act.t))}</bdi></div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold tabular text-[.95rem] leading-none">{act.estimated ? "כ-" : ""}{seatsFmt(Math.round(act.v * 10) / 10)}</span>
                <small className="text-[.7rem] text-paper/65">ממוצע {unit}</small>
              </div>
              {act.lo !== undefined && act.hi !== undefined && (
                <>
                  <div dir="ltr" className="relative mx-0.5 mt-1.5 h-4">
                    <span className="absolute inset-x-0 top-[7px] h-0.5 bg-paper/25" />
                    <span className="absolute top-1 h-2 rounded-[4px]" style={{ left: `${((act.lo - axis.lo) / (axis.hi - axis.lo)) * 100}%`, width: `${((act.hi - act.lo) / (axis.hi - axis.lo)) * 100}%`, background: "rgb(var(--mk-range))" }} />
                    <span className="absolute top-0.5 size-3 -ml-1.5 rounded-full border-2 border-ink" style={{ left: `${((act.v - axis.lo) / (axis.hi - axis.lo)) * 100}%`, background: "rgb(var(--mk-mean))" }} />
                  </div>
                  <div dir="ltr" className="flex justify-between text-[.66rem] text-paper/65 font-num"><span>{axis.lo}</span><span>{axis.hi}</span></div>
                  <div className="mt-1.5 flex justify-between gap-2 border-t border-paper/20 pt-1 text-[.7rem] text-paper/65">
                    <span>טווח <b className="tabular text-paper" dir="ltr">{rng(seatsFmt(act.lo), seatsFmt(act.hi))}</b></span>
                    {act.n !== undefined && <span><b className="tabular text-paper">{act.n}</b> {act.n === 1 ? "מכון" : "מכונים"}</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* תאריכים: הראשון משמאל, האחרון צמוד לימין */}
        <div aria-hidden="true" className="absolute left-0 w-full text-xs text-ink-soft font-num" style={{ top: height + 6 }}>
          {lab.map((i) => {
            const isLast = i === shown.length - 1;
            return (
              <span key={shown[i].t} className="absolute whitespace-nowrap" style={isLast ? { right: 0 } : { left: `${X(shown[i].t)}%`, transform: "translateX(-50%)" }}>{dayMonth(iso(shown[i].t))}</span>
            );
          })}
        </div>
        <span id={`${id}-sr`} className="sr-only">
          {last ? `${title}: ${seatsFmt(Math.round(last.v * 10) / 10)} ${unit} בממוצע ב-${dayMonth(iso(last.t))}${last.lo !== undefined && last.hi !== undefined ? `, בין ${seatsFmt(last.lo)} ל-${seatsFmt(last.hi)} בסקרים` : ""}.` : title}
        </span>
      </div>
    </div>
  );
}

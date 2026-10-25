import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import ChartLegend, { pollCandleLine, type LegendEntry } from "./ChartLegend";
import { CapsuleMarksV, ProfileCandleV } from "./marks";
import type { Series, TrendPoint } from "./charts";
import { colorOf } from "../lib/colors";
import { candleProfiles, smoothPath, sparseIndices, valueSegs, type Seg } from "../lib/chartLanguage";
import { dateRange, pctValue, rng, seatsFmt } from "../lib/format";
import { dayMonth } from "../lib/home";
import { POINT_DAYS, POINT_WINDOW } from "../lib/data";
import { labelIndexes, thinCandles, trendAxis, visibleLines } from "../lib/trendAxis";
import { useSeen, whenVisible } from "../lib/useSeen";

/**
 * גרף המגמה האחיד של האתר (הכרעת בעלים 11.10.2026) — ברירת המחדל לכל גרף מגמה:
 * 1. נר כל 3 ימים (`POINT_DAYS`); 2. כל נקודה: 14 הימים שמסתיימים בה, הסקר האחרון של כל מכון (`POINT_WINDOW`);
 * 3. קפסולה במילוי רך לפי אחוזונים (`candleProfiles`); 4. קווים מקווקווים כל 5, רק היכן שיש נתונים בין הקו לסמוך לו,
 *    ובגושים 61 (רק אם הגוש עבר 55) במקום 60 (`trendAxis`, `visibleLines`); 5. חלון קטן במעבר, בלחיצה ובחצים: טווח התאריכים של החישוב,
 *    הממוצע, הטווח בסקרים ומספר המכונים; 6. כפתור "מקרא" תמיד בפינה השמאלית העליונה. 7. בפתיחת המסך הקו נמתח מהקצה השמאלי (תחילת הזמן) והנרות והעיגולים מופיעים כשהקו מגיע אליהם.
 * **סדרה אחת:** נרות (כאן) וקו שעובר דרך הממוצעים של הנקודות. **כמה סדרות (השוואת רשימות):** אותו רכיב בדיוק, בלי ציור נרות: קו לכל סדרה, ולחיצה על נקודה בקו
 * מציגה את אותו חלון על הרשימה הספציפית. סדרה מקווקווה (`dashed`) היא קו מקווקו בלי נרות.
 * הנתונים כ-`Series` של `TrendPoint` (t, ממוצע v, lo, hi, n ו-xs = הערך בכל סקר). ציר הזמן משמאל (עבר) לימין (היום); התאריך האחרון צמוד לימין.
 * גרף שאינו מסקרים (הממוצע של המודל בתרחישים): אותו רכיב, ובמקום חלון הסקרים — חלון משלו (`popup`) ומקרא משלו (`legendEntries`).
 */
const YT = 13, YB = 82;
const DAY = 86_400_000;

export interface CandleTrendProps {
  title: string;
  /** סדרה אחת (גרף נרות), או כמה סדרות (השוואה, בלי נרות) */
  series: Series[];
  /** קו הרוב (61) בגרפים של גושים: מחליף את קו 60, רק אם הגוש עבר 55 */
  majority?: number;
  /** כל כמה יחידות קו מקווקו (ברירת מחדל 5) */
  step?: number;
  windowDays?: number;
  /** "מנדטים" (ברירת מחדל) או "אחוזים" וכו' */
  unit?: string;
  /** התוצאה בפועל: קו חוצה מקווקו ותג, וקו מקווקו אליו מהנקודה האחרונה של הסדרה (`id` = מזהה הסדרה; בסדרה אחת אפשר בלעדיו) */
  markers?: { t: number; v: number; id?: string }[];
  /** גובה בפיקסלים */
  height?: number;
  /** כותרת הגרף, בשורה אחת עם כפתור "מקרא" (כותרת מימין, מקרא משמאל) */
  heading?: ReactNode;
  /** חלון משלו במקום חלון הסקרים (למשל תרחישים וממוצע המודל); מקבל את הסדרה, הנקודה וצבע הסדרה */
  popup?: (info: { series: Series; point: TrendPoint; color: string }) => ReactNode;
  /** מקרא משלו במקום מקרא הסקרים */
  legendEntries?: LegendEntry[];
  /** הנקודות והקו הם נתון מודל (למשל ממוצע המודל במגמת הממשלה): ההסבר נכתב בשורות המקרא שלהם, במקום אייקון מידע (הכרעת בעלים 12.10.2026) */
  meanNote?: string;
  /** רוחב החלון בפיקסלים (ברירת מחדל 140) */
  popupWidth?: number;
}

const segsOf = (p: TrendPoint): Seg[] => (p.xs && p.xs.length ? valueSegs(p.xs) : p.lo !== undefined && p.hi !== undefined ? [{ from: p.lo, to: p.hi, count: 1 }] : []);
/** תווית קצה: השם נקטע ב-… כשהוא ארוך, והמספרים שאחריו (ממוצע, ובדיוק: גם התוצאה) נשארים תמיד */
const endText = (label: string): ReactNode => {
  const m = /^(.+?)\s((?:כ-)?\d.*)$/.exec(label);
  return m ? <><span className="min-w-0 overflow-hidden text-ellipsis">{m[1]}</span><span className="shrink-0">{m[2]}</span></> : <span className="min-w-0 overflow-hidden text-ellipsis">{label}</span>;
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Target { si: number; i: number; p: TrendPoint }

export default function CandleTrend({ title, series, majority, step = 5, windowDays = POINT_WINDOW, unit = "מנדטים", markers = [], height = 160, popup, legendEntries, popupWidth = 140, heading, meanNote }: CandleTrendProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<Target | null>(null);
  const id = useId();
  const candleMode = series.length === 1 && !series[0].dashed;
  const multi = series.length > 1;
  const labelPx = (width < 600 ? 92 : 124) + (markers.length ? (width < 600 ? 10 : 34) : 0);
  // בהשוואה נשמר מקום לתוויות הקצה; בנרות אין תגי ערך והגרף מגיע כמעט עד הקצה
  const X1 = multi ? 100 - (labelPx / Math.max(width, 1)) * 100 : 95;
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

  // לדילול נרות ולתוויות תאריך: רוחב הציור המשוער (הקצה השמאלי מחושב בהמשך, לפי רוחב המספרים)
  const plotPx = (width * (X1 - 10)) / 100;
  const colors = series.map((s, i) => s.color ?? colorOf(s.colorId ?? s.id, i));
  // נקודות לנר ולבחירה: בנרות — הנקודות של הסדרה (מדוללות); בהשוואה — כל הנקודות של כל הסדרות
  const candleSeries = candleMode ? series[0] : undefined;
  const shown = useMemo(() => (candleSeries ? thinCandles(candleSeries.points, plotPx, 24) : []), [candleSeries, plotPx]);
  const targets: Target[] = useMemo(() => {
    if (candleSeries) { const si = series.indexOf(candleSeries); return shown.map((p, i) => ({ si, i, p })); }
    return series.flatMap((s, si) => (s.dashed ? [] : s.points.map((p, i) => ({ si, i, p }))));
  }, [series, candleSeries, shown]);
  // הקו עובר דרך הממוצעים של הנקודות עצמן, כך שכל עיגול יושב על הקו (אין קו יומי נפרד בעל חישוב אחר)
  const lineMain = candleSeries ? candleSeries.points.map((p) => ({ t: p.t, v: p.v })) : [];

  const allV = useMemo(() => {
    const vs: number[] = [];
    series.forEach((s) => s.points.forEach((p) => { vs.push(p.v); if (candleMode && !s.dashed) vs.push(p.lo ?? p.v, p.hi ?? p.v, ...(p.xs ?? [])); }));
    lineMain.forEach((l) => vs.push(l.v));
    markers.forEach((m) => vs.push(m.v));
    return vs;
  }, [series, candleMode, lineMain, markers]);
  const axis = useMemo(() => {
    const a = trendAxis(allV, { step, majority });
    // רק קווים שיש ביניהם לסמוך להם נתונים: נר = טווח, נקודה בקו = ערך
    const spans: [number, number][] = [];
    series.forEach((s) => s.points.forEach((p) => spans.push(candleMode && !s.dashed ? [p.lo ?? p.v, p.hi ?? p.v] : [p.v, p.v])));
    lineMain.forEach((l) => spans.push([l.v, l.v]));
    return { ...a, lines: visibleLines(a.lines, spans) };
  }, [allV, step, majority, series, candleMode, lineMain]);
  // המספרים צמודים לקצה השמאלי, כמו הקווים לקצה הימני: אותו רווח משני הצדדים (הכרעת בעלים 11.10.2026)
  const numPx = Math.max(...axis.lines.map((l) => seatsFmt(l.v).length), 1) * 9 + 12;
  const X0 = (numPx / Math.max(width, 1)) * 100;
  const profiles = useMemo(() => candleProfiles(shown.map(segsOf)), [shown]);
  const hasData = series.some((s) => s.points.length) || lineMain.length;
  if (!hasData) return null;

  const valueText = (v: number) => unit === "אחוזים" ? pctValue(v) : seatsFmt(Math.round(v * 10) / 10);

  const ts = [...series.flatMap((s) => s.points.map((p) => p.t)), ...lineMain.map((l) => l.t), ...markers.map((m) => m.t)];
  const tA = Math.min(...ts), tB = Math.max(...ts);
  const X = (t: number) => (tB === tA ? X0 : X0 + ((X1 - X0) * (t - tA)) / (tB - tA));
  // הנרות והעיגולים מופיעים כשהקו (0.9 שנייה, בקצב אחיד) מגיע אליהם
  const delayOf = (t: number) => Math.round(((X(t) - X0) / Math.max(X1 - X0, 1)) * 900);
  // תאריכים צמודים לתחתית הציור (הקו התחתון), לא לתחתית השוליים
  const dateTop = Math.round((height * YB) / 100) + 8;
  const Y = (v: number) => YB - ((YB - YT) * (v - axis.lo)) / (axis.hi - axis.lo);
  // קו מקווקו מהסקר האחרון אל התוצאה בפועל: מתחיל בקצה העיגול הקטן ונגמר בקצה העיגול הריק (בפיקסלים, ואז חזרה לאחוזים)
  const links = markers.flatMap((m) => {
    const si = m.id !== undefined ? series.findIndex((x) => x.id === m.id) : series.length === 1 ? 0 : -1;
    const last = si >= 0 ? series[si].points[series[si].points.length - 1] : undefined;
    if (!last) return [];
    const [ax, ay, bx, by] = [(X(last.t) / 100) * width, (Y(last.v) / 100) * height, (X(m.t) / 100) * width, (Y(m.v) / 100) * height];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 16) return [];
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    const [r1, r2] = [6, 11];
    return [{ si, x1: ((ax + ux * r1) / width) * 100, y1: ((ay + uy * r1) / height) * 100, x2: ((bx - ux * r2) / width) * 100, y2: ((by - uy * r2) / height) * 100 }];
  });
  const ln = { vectorEffect: "non-scaling-stroke" as const };
  const dateTicks = candleMode ? shown.map((p) => p.t) : [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
  const lab = labelIndexes(dateTicks.length, Math.max(2, Math.floor(plotPx / 46)));
  const lastT = dateTicks[dateTicks.length - 1];

  // הסמן: בנרות — הנר הקרוב לאורך הציר; בהשוואה — הנקודה הקרובה ביותר בקו (עד 28px)
  const at = (clientX: number, clientY: number): Target | null => {
    const el = wrap.current;
    if (!el || !targets.length) return null;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    const xp = (t: number) => (X(t) / 100) * r.width;
    const yp = (v: number) => (Y(v) / 100) * height;
    if (px < (X0 / 100) * r.width - 14 || px > r.width) return null;
    let best: Target | null = null, bd = Infinity;
    for (const tg of targets) {
      const d = candleMode ? Math.abs(xp(tg.p.t) - px) : Math.hypot(xp(tg.p.t) - px, yp(tg.p.v) - py);
      if (d < bd) { bd = d; best = tg; }
    }
    return candleMode || bd <= 28 ? best : null;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (e.pointerType !== "touch") setActive(at(e.clientX, e.clientY)); };
  const onDown = (e: PointerEvent<HTMLDivElement>) => setActive(at(e.clientX, e.clientY));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!targets.length) return;
    if (e.key === "Escape") return setActive(null);
    const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -999 : e.key === "End" ? 999 : 0;
    const vert = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!dir && !vert) return;
    e.preventDefault();
    const cur = active ?? targets[targets.length - 1];
    const same = targets.filter((tg) => tg.si === cur.si);
    if (dir) {
      const k = same.findIndex((tg) => tg.p.t === cur.p.t);
      return setActive(same[Math.max(0, Math.min(same.length - 1, active ? k + dir : same.length - 1))]);
    }
    // בהשוואה: חצים למעלה ולמטה עוברים לסדרה אחרת, באותו תאריך (הקרוב ביותר)
    const order = [...new Set(targets.map((tg) => tg.si))];
    const nsi = order[(order.indexOf(cur.si) + vert + order.length) % order.length];
    const pool = targets.filter((tg) => tg.si === nsi);
    setActive(pool.reduce((b, tg) => (Math.abs(tg.p.t - cur.p.t) < Math.abs(b.p.t - cur.p.t) ? tg : b), pool[0]));
  };

  const legend: LegendEntry[] = legendEntries ?? [
    ...(candleMode ? [{ kind: "candle" as const, text: pollCandleLine(windowDays, POINT_DAYS) }] : []),
    { kind: candleMode ? "mean" : "dot", text: `${candleMode ? "הממוצע בכל נקודה (נקודה כל 3 ימים)" : "נקודה על הקו, כל 3 ימים. לחיצה עליה מציגה את נתוני הרשימה"}${meanNote ? ` — ${meanNote}` : ""}` },
    { kind: multi ? "lineList" : "line", text: multi ? "הממוצע בכל נקודה, בצבע הרשימה (קו מקווקו = מרכיבי רשימה שאוחדה)" : "הקו מחבר את הממוצעים של הנקודות" },
    { kind: "dash", text: `קווים מקווקווים כל ${step} ${unit}, רק היכן שיש נתונים${majority !== undefined && axis.lines.some((l) => l.major) ? `; ${majority} = הרוב` : ""}` },
    ...(markers.length ? [{ kind: "result" as const, text: "התוצאה בפועל" }] : []),
    ...(links.length ? [{ kind: "dash" as const, text: "קו מקווקו: מהסקר האחרון אל התוצאה בפועל" }] : []),
  ];

  // תוויות קצה לקווים (בהשוואה), מפוזרות כדי שלא יעלו זו על זו
  const ends = multi
    ? series
        .map((s, si) => ({ s, si, last: s.points[s.points.length - 1] }))
        .filter((e) => e.last && !e.s.dashed)
        .map((e) => ({ ...e, y: (Y(e.last.v) / 100) * height }))
        .sort((a, b) => a.y - b.y)
    : [];
  // מרווח בין תוויות, בתוך גובה הגרף: קודם מורידים את החופפות, ואם התחתונה יצאה החוצה — מרימים בחזרה
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
  const endBottom = ends.length * 14 <= (height * YB) / 100 - 6 ? (height * YB) / 100 + 2 : height - 4;
  if (ends.length && ends[ends.length - 1].y > endBottom) {
    ends[ends.length - 1].y = endBottom;
    for (let k = ends.length - 2; k >= 0; k--) if (ends[k + 1].y - ends[k].y < 14) ends[k].y = ends[k + 1].y - 14;
  }

  const act = active;
  const actColor = act ? colors[act.si] : "";
  const lastShown = candleMode ? shown[shown.length - 1] : undefined;
  const Inner = (
    <div
      ref={(el) => { wrap.current = el; seenRef(el); }}
      dir="ltr"
      className={`relative mt-1 outline-offset-2 touch-pan-y select-none ${whenVisible(seen)}`}
      style={{ height: dateTop + 22 }}
      tabIndex={0}
      role="group"
      aria-label={`${title}. חצים ימינה ושמאלה בין הנקודות${multi ? ", ולמעלה ולמטה בין הרשימות" : ""}`}
      aria-describedby={`${id}-sr`}
      onPointerMove={onMove}
      onPointerDown={onDown}
      onPointerLeave={(e) => { if (e.pointerType !== "touch") setActive(null); }}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute left-0 top-0 w-full" style={{ height }} aria-hidden="true">
        {axis.lines.map(({ v, major }) => (
          <line key={v} x1={X0} x2={candleMode ? 100 : X1 + 2} y1={Y(v)} y2={Y(v)} className={major ? "stroke-ink" : "stroke-ink-faint"} strokeWidth={major ? 1.5 : 1} strokeDasharray="5 4" {...ln} />
        ))}
        {candleSeries && <path d={smoothPath(lineMain.map((l) => ({ x: X(l.t), y: Y(l.v) })))} className="trend-line fill-none stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" {...ln} />}
        {multi && series.map((s, si) => (
          <path key={s.id} className="trend-line" d={smoothPath(s.points.map((p) => ({ x: X(p.t), y: Y(p.v) })))} fill="none" stroke={colors[si]} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} {...ln} />
        ))}
        {links.map((l, i) => <line key={`k${i}`} className={`trend-pop ${candleMode ? "stroke-accent" : ""}`} style={{ animationDelay: "900ms" }} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={candleMode ? undefined : colors[l.si]} strokeWidth={2} strokeDasharray="4 3" {...ln} />)}
      </svg>
      <div className="absolute left-0 top-0 w-full" style={{ height }}>
        {axis.lines.map(({ v, major }) => (
          <span key={v} aria-hidden="true" className={`absolute -translate-y-1/2 leading-none whitespace-nowrap text-end font-num ${major ? "text-sm font-extrabold" : "text-xs text-ink-faint"}`} style={{ right: `calc(${100 - X0}% + 12px)`, top: `${Y(v)}%` }}>{seatsFmt(v)}</span>
        ))}
        {candleMode && act && <span aria-hidden="true" className="absolute top-0 bottom-0 -translate-x-1/2 w-8 bg-ink/[.07] rounded-[4px]" style={{ left: `${X(act.p.t)}%` }} />}
        {candleMode && shown.map((p, i) => (p.lo === undefined && !p.xs ? null : <ProfileCandleV key={`c${p.t}`} segs={profiles[i]} y={Y} left={`${X(p.t)}%`} delay={delayOf(p.t)} base={Math.max(0, axis.lo)} />))}
        {candleMode && shown.map((p) => <CapsuleMarksV showLabels={false} key={`d${p.t}`} left={`${X(p.t)}%`} primary={{ value: p.v, label: 'ממוצע' }} secondary={markers.find(m => m.t === p.t && (!m.id || m.id === candleSeries!.id)) ? { value: markers.find(m => m.t === p.t && (!m.id || m.id === candleSeries!.id))!.v, label: 'תוצאה בפועל' } : undefined} y={Y} format={valueText} delay={delayOf(p.t)} />)}
        {multi && series.map((s, si) => !s.dashed && sparseIndices(s.points.map((p) => (X(p.t) / 100) * width), 46).map((k) => (
          <span key={`${s.id}-${k}`} aria-hidden="true" className="mk mk-dot trend-pop" style={{ left: `${X(s.points[k].t)}%`, top: `${Y(s.points[k].v)}%`, borderColor: colors[si], animationDelay: `${delayOf(s.points[k].t)}ms` }} />
        )))}
        {multi && act && <span aria-hidden="true" className="mk mk-dot" style={{ left: `${X(act.p.t)}%`, top: `${Y(act.p.v)}%`, borderColor: actColor, background: actColor, width: 13, height: 13 }} />}
        {markers.filter(m => !candleMode || !shown.some(p => p.t === m.t && (!m.id || m.id === candleSeries!.id))).map((m, i) => <CapsuleMarksV showLabels={false} key={`m${i}`} left={`${X(m.t)}%`} secondary={{ value: m.v, label: "תוצאה בפועל" }} y={Y} format={valueText} />)}
        {ends.map((e) => (
          <span key={e.s.id} aria-hidden="true" className="absolute flex -translate-y-1/2 gap-1 whitespace-nowrap text-[11px] font-bold leading-none" dir="rtl" style={{ left: `calc(${X1}% + ${markers.length ? 20 : 10}px)`, maxWidth: labelPx - (markers.length ? 22 : 12), top: e.y, color: colors[e.si] }}>
            {endText(e.s.endLabel ?? `${e.s.name} ${valueText(e.last.v)}`)}
          </span>
        ))}
        {act && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 rounded-[9px] bg-ink px-[9px] py-[7px] text-[.72rem] leading-[1.3] text-paper shadow-[0_6px_22px_rgb(var(--ink)/.25)]"
            dir="rtl"
            style={{ width: popupWidth, top: candleMode ? `${(YT + YB) / 2}%` : `${Math.max(24, Math.min(76, Y(act.p.v)))}%`, transform: "translateY(-50%)", ...(X(act.p.t) > 55 ? { right: `calc(${100 - X(act.p.t)}% + 14px)` } : { left: `calc(${X(act.p.t)}% + 14px)` }) }}
          >
            {popup ? popup({ series: series[act.si], point: act.p, color: actColor }) : (
              <>
            {multi && <div className="mb-0.5 flex items-center gap-1.5 text-[.76rem] font-bold"><i className="size-2.5 shrink-0 rounded-full" style={{ background: actColor }} />{series[act.si].name}</div>}
            <div className="mb-1 text-[.7rem] font-bold text-paper/65">חישוב: <bdi dir="ltr">{dateRange(iso(act.p.t - (windowDays - 1) * DAY), iso(act.p.t))}</bdi></div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold tabular text-[.95rem] leading-none">{valueText(act.p.v)}</span>
              <small className="text-[.7rem] text-paper/65">ממוצע {unit}</small>
            </div>
            {act.p.lo !== undefined && act.p.hi !== undefined && (
              <>
                <div dir="ltr" className="relative mx-0.5 mt-1.5 h-4">
                  <span className="absolute inset-x-0 top-[7px] h-0.5 bg-paper/25" />
                  <span className="absolute top-1 h-2 rounded-[4px]" style={{ left: `${((act.p.lo - axis.lo) / (axis.hi - axis.lo)) * 100}%`, width: `${((act.p.hi - act.p.lo) / (axis.hi - axis.lo)) * 100}%`, background: "rgb(var(--mk-range))" }} />
                  <span className="absolute top-0 h-4 w-0 border-l-2 border-paper" style={{ left: `${((act.p.v - axis.lo) / (axis.hi - axis.lo)) * 100}%`, background: "transparent" }} />
                </div>
                <div dir="ltr" className="flex justify-between text-[.66rem] text-paper/65 font-num"><span>{axis.lo}</span><span>{axis.hi}</span></div>
                <div className="mt-1.5 flex justify-between gap-2 border-t border-paper/20 pt-1 text-[.7rem] text-paper/65">
                  <span>טווח <b className="tabular text-paper" dir="ltr">{rng(valueText(act.p.lo), valueText(act.p.hi))}</b></span>
                  {act.p.n !== undefined && <span><b className="tabular text-paper">{act.p.n}</b> {act.p.n === 1 ? "מכון" : "מכונים"}</span>}
                </div>
                {act.p.raw !== undefined && <div className="mt-1.5 border-t border-paper/20 pt-1 text-[.7rem] text-paper/65">ממוצע, בלי שקלול המפלגות שלא עברו: <b className="tabular text-paper">{valueText(act.p.raw)}</b></div>}
              </>
            )}
              </>
            )}
          </div>
        )}
      </div>
      {/* תאריכים: הראשון משמאל, והאחרון צמוד לימין של שטח הציור */}
      <div aria-hidden="true" className="absolute left-0 w-full text-xs text-ink-soft font-num" style={{ top: dateTop }}>
        {lab.map((i) => {
          const isLast = dateTicks[i] === lastT;
          return (
            <span key={dateTicks[i]} className="absolute whitespace-nowrap" style={isLast && !multi && X(dateTicks[i]) >= X1 - 0.5 ? { right: 0 } : { left: `${X(dateTicks[i])}%`, transform: "translateX(-50%)" }}>{dayMonth(iso(dateTicks[i]))}</span>
          );
        })}
      </div>
      <span id={`${id}-sr`} className="sr-only">
        {lastShown
          ? `${title}: ${valueText(lastShown.v)} ${unit} בממוצע ב-${dayMonth(iso(lastShown.t))}${lastShown.lo !== undefined && lastShown.hi !== undefined ? `, בין ${valueText(lastShown.lo)} ל-${valueText(lastShown.hi)} בסקרים` : ""}.`
          : `${title}: ${series.filter((s) => !s.dashed).map((s) => `${s.name} ${valueText(s.points[s.points.length - 1]?.v ?? 0)}`).join(", ")}.`}
      </span>
    </div>
  );
  return (
    <div>
      {/* תמיד בפינה השמאלית העליונה של הגרף */}
      <ChartLegend entries={legend} heading={heading} className="mb-1" />
      {Inner}
    </div>
  );
}

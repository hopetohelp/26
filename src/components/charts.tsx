import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { colorOf } from "../lib/colors";
import { CANDLE_PX, levelSegs, profilePath, profilePoints, smoothPath, sparseIndices, SVG_MARKS, valueSegs, type Seg } from "../lib/chartLanguage";
import { date, rng, seatsFmt } from "../lib/format";
import { Segmented } from "./Choice";
import ChartLegend, { rangeLine, type LegendEntry } from "./ChartLegend";

export interface TrendPoint {
  t: number;
  /** ממוצע החלון */
  v: number;
  estimated?: boolean;
  breakBefore?: boolean;
  /** הנמוך והגבוה בין הסקרים בחלון (טווח מלא), `n` = כמה סקרים בחלון, ו-`xs` = הערך בכל סקר: מזה נבנה הנר ועוביו בכל קטע */
  lo?: number;
  hi?: number;
  n?: number;
  xs?: number[];
}

export interface Series {
  id: string;
  name: string;
  points: TrendPoint[];
  dashed?: boolean;
  /** מזהה הצבע (ברירת מחדל: id) — לקו "מרכיבים" באותו צבע של הרשימה */
  colorId?: string;
  /** צבע מפורש (גובר על colorId): כך הצבע במקרא ובבחירה זהה לצבע בגרף */
  color?: string;
  /** תווית הקצה (ברירת מחדל: השם והערך האחרון) */
  endLabel?: string;
}

export type TrendMode = "line" | "candles";

const DAY = 86_400_000;
const colorFor = (s: Series, i: number) => s.color ?? colorOf(s.colorId ?? s.id, i);
const W = 900;
const M = { top: 12, right: 150, bottom: 30, left: 34 };

/** נקודות החלונות שאינם חופפים, מהסוף אחורה: נר לכל חלון (כמו נר שבועי בגרף מניות) */
function windows(points: TrendPoint[], windowMs: number): TrendPoint[] {
  const out: TrendPoint[] = [];
  let last = Infinity;
  for (let i = points.length - 1; i >= 0; i--) {
    if (last - points[i].t >= windowMs - 1 || last === Infinity) {
      out.unshift(points[i]);
      last = points[i].t;
    }
  }
  return out;
}

/**
 * גרף מגמה ב-SVG בשפת הציור האחידה (`src/lib/chartLanguage.ts`, הכרעת בעלים 9.10.2026). ציר הזמן משמאל (עבר) לימין (היום).
 * שתי תצוגות במתג קטן: **קו** (קו חלק עם פינות עגולות, סמנים קטנים ריקים שחורים, ובסופו עיגול מלא כתום = הממוצע היום ונר כחול של הטווח בחלון האחרון)
 * ו**נרות** (כל הגרף נרות: נר לכל חלון, מהנמוך אל הגבוה בין הסקרים, עיגול מלא כתום = הממוצע).
 * עובי הנר משתנה לאורכו: עבה היכן שהרבה סקרים נתנו אותו ערך, דק בקצוות, ביחס לאותו נר. הקו נשאר בצבע הרשימה, כדי לזהות אותה.
 * `markers` = התוצאה בפועל: עיגול ריק שחור. מעבר עכבר או מקלדת מציגים את הערכים בכל תאריך. תוויות ישירות בקצה כל קו.
 */
export function TrendChart({
  series, markers = [], from, to, yMax, title, height = 360, windowText, defaultMode = "line", lineLabel = "ממוצע הסקרים בכל תאריך",
}: {
  series: Series[];
  /** התוצאה בפועל ביום הבחירות: עיגול ריק */
  markers?: { t: number; v: number; id: string }[];
  from: number;
  to: number;
  yMax: number;
  title: string;
  height?: number;
  /** משך החלון בטקסט, למקרא ("14 הימים"); גם קובע את רוחב הנר */
  windowText?: { days: number; label: string };
  defaultMode?: TrendMode;
  /** מה הקו מראה, למקרא ("ממוצע הסקרים בכל תאריך") */
  lineLabel?: string;
}) {
  const tid = useId();
  const H = height;
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<TrendMode>(defaultMode);
  const [hover, setHover] = useState<number | null>(null);
  const hasRange = series.some((s) => s.points.some((p) => p.lo !== undefined && p.hi !== undefined));
  const canCandle = hasRange && !!windowText;
  const view: TrendMode = canCandle ? mode : "line";

  const x = (t: number) => M.left + ((t - from) / Math.max(1, to - from)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - v / yMax) * (H - M.top - M.bottom);
  const yStep = yMax <= 40 ? 5 : yMax <= 80 ? 10 : 20;
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => i * yStep);
  // תוויות ציר הזמן: בטווח קצר (עד כ-10 שבועות) — כל שבוע, "יום.חודש"; בטווח ארוך — תחילת כל חודש, "חודש.שנה"
  const short = to - from <= 70 * DAY;
  const months: number[] = [];
  const d0 = new Date(from);
  if (short) {
    for (let t = from + 3 * DAY; t <= to - 2 * DAY; t += 7 * DAY) months.push(t);
  } else {
    for (let d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); d.getTime() <= to; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime());
  }
  const monthStep = Math.max(1, Math.ceil(months.length / 8));
  const tick = (t: number) => {
    const d = new Date(t);
    return short ? `${d.getUTCDate()}.${d.getUTCMonth() + 1}` : `${d.getUTCMonth() + 1}.${String(d.getUTCFullYear()).slice(2)}`;
  };

  // נקודות הנרות: חלונות שאינם חופפים, ועובי הנר ביחס למקסימום בכל נר
  const candles = useMemo(
    () => (canCandle ? series.map((s) => ({ s, pts: windows(s.points.filter((p) => p.lo !== undefined && p.hi !== undefined), windowText!.days * DAY) })) : []),
    [series, canCandle, windowText],
  );
  // נר של חלון: קטעים לפי כמה סקרים נתנו כל ערך, ועובי כל קטע ביחס לקטע העמוס ביותר באותו נר
  const segsOf = (p: TrendPoint): Seg[] => (p.xs && p.xs.length ? valueSegs(p.xs) : p.lo !== undefined && p.hi !== undefined ? [{ from: p.lo, to: p.hi, count: 1 }] : []);
  const profiles = useMemo(() => {
    const items: { key: string; segs: Seg[] }[] = [];
    if (view === "line") series.forEach((s) => { const last = s.points[s.points.length - 1]; if (last && !s.dashed) items.push({ key: `${s.id}|${last.t}`, segs: segsOf(last) }); });
    else candles.forEach(({ s, pts }) => pts.forEach((p) => items.push({ key: `${s.id}|${p.t}`, segs: segsOf(p) })));
    const lv = levelSegs(items.map((it) => it.segs));
    return new Map(items.map((it, k) => [it.key, lv[k]] as const));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, series, candles]);
  const spacing = (() => {
    if (!windowText) return 20;
    return Math.max(2, (windowText.days * DAY / Math.max(1, to - from)) * (W - M.left - M.right));
  })();
  // בנרות צפופים כל העוביים מוקטנים יחד, כך שנר לא יגע בשכן שלו
  const candleScale = view === "line" ? 1 : Math.min(1, (spacing * 0.85) / CANDLE_PX[5]);
  const profileShape = (key: string, cx: number, opacity: number) => {
    const segs = profiles.get(key) ?? [];
    if (!segs.length) return null;
    return <path d={profilePath(profilePoints(segs, y, candleScale), cx, "x")} fill="rgb(var(--mk-range))" opacity={opacity} />;
  };
  const meanR = Math.max(2.5, Math.min(SVG_MARKS.meanR, spacing * 0.35));

  // פיזור תוויות הקצה כדי שלא יעלו זו על זו
  const labels = series
    .filter((s) => s.points.length && !s.dashed)
    .map((s, i) => ({ s, i, yy: y(s.points[s.points.length - 1].v) }))
    .sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < labels.length; k++) if (labels[k].yy - labels[k - 1].yy < 14) labels[k].yy = labels[k - 1].yy + 14;
  const labelX = W - M.right + (markers.length ? 20 : 8);

  // הסמן (עכבר, מגע, מקלדת): הצמדה לתאריך הקרוב ביותר
  const times = useMemo(() => {
    const src = view === "candles" ? candles.flatMap((c) => c.pts) : series.flatMap((s) => s.points);
    return [...new Set(src.map((p) => p.t))].sort((a, b) => a - b);
  }, [view, candles, series]);
  const snap = (t: number) => times.reduce<number | null>((best, c) => (best === null || Math.abs(c - t) < Math.abs(best - t) ? c : best), null);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    if (sx < M.left - 8 || sx > W - M.right + 8) return setHover(null);
    setHover(snap(from + ((sx - M.left) / (W - M.left - M.right)) * (to - from)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!times.length) return;
    const at = hover === null ? -1 : times.indexOf(hover);
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (e.key === "Escape") return setHover(null);
    if (e.key === "Home") return setHover(times[0]);
    if (e.key === "End") return setHover(times[times.length - 1]);
    if (!step) return;
    e.preventDefault();
    setHover(times[Math.max(0, Math.min(times.length - 1, at < 0 ? times.length - 1 : at + step))]);
  };
  const near = (s: Series, t: number): TrendPoint | undefined => {
    const src = view === "candles" ? candles.find((c) => c.s === s)?.pts ?? [] : s.points;
    const p = src.find((q) => q.t === t);
    return p;
  };
  const tipRows = hover === null ? [] : series.map((s, i) => ({ s, i, p: near(s, hover) })).filter((r): r is { s: Series; i: number; p: TrendPoint } => !!r.p && !r.s.dashed);
  const tipPct = hover === null ? 0 : (x(hover) / W) * 100;

  // קטעי קו: ברצף אחד, קטע מקווקו כשהוא כולל אומדן; כל רצף עם קו חלק משלו
  const pieces = (s: Series) => {
    const out: { pts: TrendPoint[]; dashed: boolean }[] = [];
    s.points.forEach((p, k) => {
      const prev = s.points[k - 1];
      if (!prev || p.breakBefore) return;
      const dashed = !!(s.dashed || p.estimated || prev.estimated);
      const last = out[out.length - 1];
      if (last && last.dashed === dashed && last.pts[last.pts.length - 1] === prev) last.pts.push(p);
      else out.push({ pts: [prev, p], dashed });
    });
    return out;
  };

  const legend: LegendEntry[] =
    view === "line"
      ? [
          { kind: "lineList", text: `${lineLabel}, בצבע הרשימה (קטע מקווקו = אומדן)` },
          { kind: "dot", text: "נקודה על הקו" },
          { kind: "mean", text: "הממוצע היום" },
          ...(canCandle ? [{ kind: "candle" as const, text: rangeLine("full", "הסקרים", `ב-${windowText!.label} האחרונים`) }] : []),
          ...(markers.length > 0 ? [{ kind: "result" as const, text: "התוצאה בפועל" }] : []),
        ]
      : [
          { kind: "candle", text: rangeLine("full", "הסקרים", `ב-${windowText?.label ?? "החלון"}`) },
          { kind: "mean", text: "ממוצע החלון" },
          ...(markers.length > 0 ? [{ kind: "result" as const, text: "התוצאה בפועל" }] : []),
        ];
  const markFill = { fill: "rgb(var(--mk-bg, var(--paper)))" };
  const ink = "rgb(var(--ink))";
  return (
    <div>
      <ChartLegend
        className="mb-2"
        entries={legend}
        action={canCandle ? <Segmented size="sm" label="צורת הגרף" value={mode} onChange={setMode} className="w-44" options={[{ id: "line", label: "קו" }, { id: "candles", label: "נרות" }]} /> : undefined}
      />
      {/* בטלפון הגרף נגלל לרוחב במקום להתכווץ לגופן בלתי קריא */}
      <div className="overflow-x-auto">
        <div
          className="relative min-w-[640px] outline-offset-2"
          tabIndex={0}
          role="group"
          aria-label={`${title}. חצים ימינה ושמאלה מזיזים את הסמן בין התאריכים`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-labelledby={tid} direction="ltr">
            <title id={tid}>{title}</title>
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--grid))" />
                <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--ink-faint))">
                  {v}
                </text>
              </g>
            ))}
            {months.map((t, i) =>
              i % monthStep === 0 ? (
                <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize="11" fill="rgb(var(--ink-faint))">
                  {tick(t)}
                </text>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} stroke="rgb(var(--ink-faint))" strokeDasharray="3 3" />}

            {view === "line" && series.map((s, i) => {
              const c = colorFor(s, i);
              const pts = s.points.map((p) => ({ x: x(p.t), y: y(p.v) }));
              const last = s.points[s.points.length - 1];
              const dots = s.dashed ? [] : sparseIndices(pts.map((p) => p.x), 46).filter((k) => k !== pts.length - 1);
              return (
                <g key={s.id}>
                  {pieces(s).map((pc, k) => (
                    <path key={k} d={smoothPath(pc.pts.map((p) => ({ x: x(p.t), y: y(p.v) })))} fill="none" stroke={c} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={pc.dashed ? "5 4" : undefined} />
                  ))}
                  {dots.map((k) => (
                    <circle key={k} cx={pts[k].x} cy={pts[k].y} r={SVG_MARKS.smallR} strokeWidth={SVG_MARKS.smallStroke} stroke={ink} style={markFill} />
                  ))}
                  {!s.dashed && last && profileShape(`${s.id}|${last.t}`, x(last.t), last.estimated ? 0.45 : 0.9)}
                  {!s.dashed && last && <circle cx={x(last.t)} cy={y(last.v)} r={SVG_MARKS.meanR} fill="rgb(var(--mk-mean))" />}
                  {last && last.estimated && <circle cx={x(last.t)} cy={y(last.v)} r={SVG_MARKS.meanR + 3} fill="none" stroke="rgb(var(--mk-mean))" strokeDasharray="3 3" />}
                </g>
              );
            })}

            {view === "candles" && candles.map(({ s, pts }) => (
              <g key={s.id}>
                {pts.map((p) => (
                  <g key={p.t}>
                    {profileShape(`${s.id}|${p.t}`, x(p.t), p.estimated ? 0.45 : 0.85)}
                    <circle cx={x(p.t)} cy={y(p.v)} r={meanR} fill="rgb(var(--mk-mean))" />
                  </g>
                ))}
              </g>
            ))}

            {hover !== null && tipRows.map(({ s, i, p }) => (
              <circle key={s.id} cx={x(p.t)} cy={y(p.v)} r={SVG_MARKS.meanR + 2} fill="none" stroke={colorFor(s, i)} strokeWidth={2} />
            ))}

            {markers.map((mk, i) => {
              return (
                <circle key={`m${i}`} cx={x(mk.t)} cy={y(mk.v)} r={SVG_MARKS.ringR} fill="none" stroke="rgb(var(--mk-result))" strokeWidth={SVG_MARKS.ringStroke}>
                  <title>{`התוצאה בפועל: ${mk.v}`}</title>
                </circle>
              );
            })}
            {labels.map(({ s, i, yy }) => (
              <text key={s.id} x={labelX} y={yy + 4} fontSize="12" fill={colorFor(s, i)} fontWeight={700} direction="rtl" textAnchor="end">
                {s.endLabel ?? `${s.name} ${seatsFmt(s.points[s.points.length - 1].v)}`}
              </text>
            ))}
          </svg>
          {hover !== null && tipRows.length > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-2 z-10 w-max max-w-[16rem] rounded-theme border border-paper-line bg-paper-card p-2.5 text-sm shadow-[0_2px_10px_rgb(var(--ink)/.15)]"
              style={{ left: `${tipPct}%`, transform: `translateX(${tipPct > 62 ? "calc(-100% - 12px)" : "12px"})` }}
            >
              <b className="block mb-1 font-num">{date(new Date(hover).toISOString())}{view === "candles" && windowText ? ` · ${windowText.label}` : ""}</b>
              <ul className="space-y-0.5">
                {tipRows.slice().sort((a, b) => b.p.v - a.p.v).map(({ s, i, p }) => (
                  <li key={s.id} className="flex items-baseline gap-2">
                    <i className="size-2.5 rounded-full shrink-0 self-center" style={{ background: colorFor(s, i) }} />
                    <span className="grow">{s.name}</span>
                    <b className="font-num tabular">{p.estimated ? "כ-" : ""}{seatsFmt(p.v)}</b>
                    {p.lo !== undefined && p.hi !== undefined && p.lo !== p.hi && <span className="text-xs text-ink-soft tabular">{rng(seatsFmt(p.lo), seatsFmt(p.hi))}</span>}
                    {p.n !== undefined && <span className="text-xs text-ink-soft">({p.n})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

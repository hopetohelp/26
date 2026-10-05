import { useId } from "react";
import { colorOf } from "../lib/colors";
import { seatsFmt, signed } from "../lib/format";

export interface RangeRow {
  id: string;
  name: string;
  median: number;
  min: number;
  max: number;
  note?: string;
}

/** פסים אופקיים: אורך = חציון, קו דק = הטווח (מינימום–מקסימום). HTML רגיל — נקרא היטב בקורא מסך ומתיישר ל-RTL */
export function SeatRangeBars({ rows, maxSeats = 40, caption }: { rows: RangeRow[]; maxSeats?: number; caption: string }) {
  const w = (x: number) => `${Math.max(0, Math.min(100, (x / maxSeats) * 100))}%`;
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.id} className="grid grid-cols-[7.5rem_1fr_6rem] md:grid-cols-[11rem_1fr_7rem] items-center gap-2">
            <span className="font-medium truncate" title={r.name}>
              {r.name}
            </span>
            <span className="relative h-6 bg-paper rounded" aria-hidden="true">
              <span className="absolute inset-y-0 right-0 rounded" style={{ width: w(r.median), background: colorOf(r.id, i) }} />
              {r.max > r.min && (
                <span className="absolute top-1/2 h-0.5 bg-ink/70" style={{ right: w(r.min), width: `calc(${w(r.max)} - ${w(r.min)})` }} />
              )}
            </span>
            <span className="text-sm tabular-nums whitespace-nowrap">
              <strong>{seatsFmt(r.median)}</strong>
              {r.max > r.min && <span className="text-ink-soft"> ({r.min}–{r.max})</span>}
              <span className="sr-only">
                {` מנדטים בחציון, טווח ${r.min} עד ${r.max}`}
                {r.note ? `. ${r.note}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export interface Series {
  id: string;
  name: string;
  points: { t: number; v: number }[];
  dashed?: boolean;
  /** מזהה הצבע (ברירת מחדל: id) — לקו "מרכיבים" באותו צבע של הרשימה */
  colorId?: string;
  /** תווית הקצה (ברירת מחדל: השם והערך האחרון) */
  endLabel?: string;
}

/** גרף מגמה ב-SVG. ציר הזמן משמאל (עבר) לימין (היום), כמוסכמה הגרפית. תוויות ישירות בקצה כל קו. */
export function TrendChart({
  series, dots = [], markers = [], from, to, yMax, title, height = 360,
}: {
  series: Series[];
  dots?: { t: number; v: number; id: string }[];
  /** סימון מעוין — למשל התוצאה בפועל ביום הבחירות */
  markers?: { t: number; v: number; id: string }[];
  from: number;
  to: number;
  yMax: number;
  title: string;
  height?: number;
}) {
  const tid = useId();
  const W = 900;
  const H = height;
  const m = { top: 12, right: 150, bottom: 30, left: 34 };
  const x = (t: number) => m.left + ((t - from) / Math.max(1, to - from)) * (W - m.left - m.right);
  const y = (v: number) => m.top + (1 - v / yMax) * (H - m.top - m.bottom);
  const yTicks = Array.from({ length: Math.floor(yMax / 5) + 1 }, (_, i) => i * 5);
  // תוויות ציר הזמן: בטווח קצר (עד כ-10 שבועות) — כל שבוע, "יום.חודש"; בטווח ארוך — תחילת כל חודש, "חודש.שנה"
  const short = to - from <= 70 * 86_400_000;
  const months: number[] = [];
  const d0 = new Date(from);
  if (short) {
    for (let t = from + 3 * 86_400_000; t <= to - 2 * 86_400_000; t += 7 * 86_400_000) months.push(t);
  } else {
    for (let d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); d.getTime() <= to; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime());
  }
  const monthStep = Math.max(1, Math.ceil(months.length / 8));
  const tick = (t: number) => {
    const d = new Date(t);
    return short ? `${d.getUTCDate()}.${d.getUTCMonth() + 1}` : `${d.getUTCMonth() + 1}.${String(d.getUTCFullYear()).slice(2)}`;
  };
  // פיזור תוויות הקצה כדי שלא יעלו זו על זו
  const labels = series
    .filter((s) => s.points.length && !s.dashed)
    .map((s, i) => ({ s, i, yy: y(s.points[s.points.length - 1].v) }))
    .sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < labels.length; k++) if (labels[k].yy - labels[k - 1].yy < 14) labels[k].yy = labels[k - 1].yy + 14;

  const labelX = W - m.right + (markers.length ? 14 : 6);
  return (
    // בטלפון הגרף נגלל לרוחב במקום להתכווץ לגופן בלתי קריא
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] h-auto" role="img" aria-labelledby={tid} direction="ltr">
      <title id={tid}>{title}</title>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={m.left} x2={W - m.right} y1={y(v)} y2={y(v)} stroke="#e3e1da" />
          <text x={m.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#7a8496">
            {v}
          </text>
        </g>
      ))}
      {months.map((t, i) =>
        i % monthStep === 0 ? (
          <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize="11" fill="#7a8496">
            {tick(t)}
          </text>
        ) : null,
      )}
      {dots.map((d, i) => (
        <circle key={i} cx={x(d.t)} cy={y(d.v)} r={2.2} fill={colorOf(d.id)} opacity={0.28} />
      ))}
      {series.map((s, i) => (
        <polyline
          key={s.id}
          fill="none"
          stroke={colorOf(s.colorId ?? s.id, i)}
          strokeWidth={2.4}
          strokeDasharray={s.dashed ? "5 4" : undefined}
          points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")}
        />
      ))}
      {markers.map((mk, i) => {
        const si = series.findIndex((x) => x.id === mk.id);
        return (
          <rect
            key={`m${i}`}
            x={x(mk.t) - 5}
            y={y(mk.v) - 5}
            width={10}
            height={10}
            transform={`rotate(45 ${x(mk.t)} ${y(mk.v)})`}
            fill="#fff"
            stroke={colorOf(mk.id, si < 0 ? i : si)}
            strokeWidth={2.4}
          />
        );
      })}
      {labels.map(({ s, i, yy }) => (
        <text key={s.id} x={labelX} y={yy + 4} fontSize="12" fill={colorOf(s.colorId ?? s.id, i)} fontWeight={700} direction="rtl" textAnchor="end">
          {s.endLabel ?? `${s.name} ${seatsFmt(s.points[s.points.length - 1].v)}`}
        </text>
      ))}
    </svg>
    </div>
  );
}

export interface GapRow {
  id: string;
  name: string;
  /** חציון הסקרים; NaN = אף סקר לא שאל עליה */
  estimate: number;
  min: number;
  max: number;
  actual: number;
}

/** הסקרים מול התוצאה: פס = חציון הסקרים, קו דק = הטווח בין המכונים, מעוין = התוצאה בפועל */
export function EstimateVsActual({ rows, maxSeats = 40, caption }: { rows: GapRow[]; maxSeats?: number; caption: string }) {
  const w = (x: number) => `${Math.max(0, Math.min(100, (x / maxSeats) * 100))}%`;
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2">
        {rows.map((r) => {
          const est = Number.isNaN(r.estimate) ? 0 : r.estimate;
          const diff = est - r.actual;
          return (
            <li
              key={r.id}
              className="grid grid-cols-[1fr_auto] md:grid-cols-[11rem_1fr_10rem] items-center gap-x-2 gap-y-1 [grid-template-areas:'name_nums'_'bar_bar'] md:[grid-template-areas:'name_bar_nums']"
            >
              <span className="font-medium truncate [grid-area:name]" title={r.name}>
                {r.name}
              </span>
              <span className="relative h-6 bg-paper rounded [grid-area:bar]" aria-hidden="true">
                <span className="absolute inset-y-1 right-0 rounded bg-[#9fb3c8]" style={{ width: w(est) }} />
                {r.max > r.min && (
                  <span className="absolute top-1/2 h-0.5 bg-ink/60" style={{ right: w(r.min), width: `calc(${w(r.max)} - ${w(r.min)})` }} />
                )}
                <span
                  className="absolute top-1/2 w-3 h-3 -mt-1.5 -mr-1.5 rotate-45 border-2 border-ink bg-white"
                  style={{ right: w(r.actual) }}
                />
              </span>
              <span className="text-sm tabular-nums whitespace-nowrap [grid-area:nums]">
                {seatsFmt(est)} <span className="text-ink-soft">⇐</span> <strong>{r.actual}</strong>{" "}
                <span className={diff === 0 ? "text-ink-soft" : "text-warn"}>
                  (<bdi dir="ltr">{signed(diff)}</bdi>)
                </span>
                <span className="sr-only">
                  {` — חציון הסקרים ${seatsFmt(est)}${r.max > r.min ? ` (טווח ${r.min} עד ${r.max})` : ""}, בפועל ${r.actual}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export interface ScenarioRow {
  id: string;
  name: string;
  /** המנדטים לפי הממוצע עצמו */
  central: number;
  /** טווח 80% של התרחישים */
  lo: number;
  hi: number;
  /** שיעור התרחישים שבהם הרשימה עוברת את אחוז החסימה (0–1) */
  pass: number;
}

/** תרחישים: רצועה = טווח 80% של התרחישים, קו = המנדטים לפי הממוצע. רצועה שמתחילה באפס = סיכון לא לעבור את הסף */
export function ScenarioRanges({ rows, maxSeats = 35, caption }: { rows: ScenarioRow[]; maxSeats?: number; caption: string }) {
  const w = (x: number) => `${Math.max(0, Math.min(100, (x / maxSeats) * 100))}%`;
  const pct = (x: number) => (x >= 0.995 ? "כמעט בכולם" : x < 0.005 ? "כמעט באף אחד" : `${Math.round(x * 100)}%`);
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className="grid grid-cols-[1fr_auto] md:grid-cols-[11rem_1fr_7rem_7rem] items-center gap-x-2 gap-y-1 [grid-template-areas:'name_nums'_'bar_bar'_'pass_pass'] md:[grid-template-areas:'name_bar_nums_pass']"
          >
            <span className="font-medium truncate [grid-area:name]" title={r.name}>
              {r.name}
            </span>
            <span className="relative h-6 bg-paper rounded [grid-area:bar]" aria-hidden="true">
              {r.hi > 0 && (
                <span className="absolute inset-y-1 rounded opacity-40" style={{ right: w(r.lo), width: `calc(${w(r.hi)} - ${w(r.lo)})`, background: colorOf(r.id, i), minWidth: "3px" }} />
              )}
              <span className="absolute inset-y-0 w-1 rounded" style={{ right: `calc(${w(r.central)} - 2px)`, background: colorOf(r.id, i) }} />
            </span>
            <span className="text-sm tabular-nums whitespace-nowrap [grid-area:nums]">
              <strong>{r.central}</strong>
              <span className="text-ink-soft"> ({r.lo}–{r.hi})</span>
            </span>
            <span className={`text-sm whitespace-nowrap [grid-area:pass] ${r.pass > 0.005 && r.pass < 0.995 ? "text-warn font-bold" : "text-ink-soft"}`}>
              עוברת: {pct(r.pass)}
            </span>
            <span className="sr-only">{`. לפי הממוצע ${r.central} מנדטים; ב-80% מהתרחישים בין ${r.lo} ל-${r.hi}; עוברת את אחוז החסימה ב-${pct(r.pass)} מהתרחישים`}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

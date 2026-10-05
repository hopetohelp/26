import { useId } from "react";
import { colorOf } from "../lib/colors";
import { seatsFmt } from "../lib/format";

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
}

/** גרף מגמה ב-SVG. ציר הזמן משמאל (עבר) לימין (היום), כמוסכמה הגרפית. תוויות ישירות בקצה כל קו. */
export function TrendChart({
  series, dots = [], from, to, yMax, title, height = 360,
}: {
  series: Series[];
  dots?: { t: number; v: number; id: string }[];
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
  const months: number[] = [];
  const d0 = new Date(from);
  for (let d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); d.getTime() <= to; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime());
  const monthStep = Math.max(1, Math.ceil(months.length / 8));
  // פיזור תוויות הקצה כדי שלא יעלו זו על זו
  const labels = series
    .filter((s) => s.points.length && !s.dashed)
    .map((s, i) => ({ s, i, yy: y(s.points[s.points.length - 1].v) }))
    .sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < labels.length; k++) if (labels[k].yy - labels[k - 1].yy < 14) labels[k].yy = labels[k - 1].yy + 14;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-labelledby={tid} direction="ltr">
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
            {`${new Date(t).getUTCMonth() + 1}.${String(new Date(t).getUTCFullYear()).slice(2)}`}
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
      {labels.map(({ s, i, yy }) => (
        <text key={s.id} x={W - m.right + 6} y={yy + 4} fontSize="12" fill={colorOf(s.colorId ?? s.id, i)} fontWeight={700} direction="rtl" textAnchor="end">
          {`${s.name} ${seatsFmt(s.points[s.points.length - 1].v)}`}
        </text>
      ))}
    </svg>
  );
}

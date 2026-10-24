import { useState } from "react";

/** נקודת זמן בסדרות הקבוצה: תחילת השעה או היום, והאם שעתית */
export type SeriesBucket = { t: string; hourly: boolean };

const TZ = "Asia/Jerusalem";
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** תאריך כמו בכל האתר (יום/חודש), ובנקודה שעתית גם השעה בשעון ישראל */
export const bucketLabel = (b: SeriesBucket) => {
  const p = Object.fromEntries(fmt.formatToParts(new Date(b.t)).map((x) => [x.type, x.value]));
  return b.hourly ? `${p.day}/${p.month} ${p.hour}:${p.minute}` : `${p.day}/${p.month}`;
};

/**
 * קו מצטבר לפי סדר הנקודות (לא לפי זמן אמיתי): הימים בחלק הימני, ו-72 השעות האחרונות משמאל, עם קו הפרדה.
 * כך גם השעות האחרונות נראות. צבע אחד (ink) — זה לא נתון מפלגתי. null = אין עדיין ערך (לפני הרישום הראשון).
 */
export default function GroupSeriesChart({ buckets, points, label }: { buckets: SeriesBucket[]; points: (number | null)[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = 72, P = 4;
  const n = points.length;
  const max = Math.max(1, ...points.map((v) => v ?? 0));
  // RTL: הזמן זורם מימין לשמאל, כמו הקריאה
  const x = (i: number) => (n <= 1 ? W / 2 : W - P - (i * (W - 2 * P)) / (n - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  let d = "";
  points.forEach((v, i) => { if (v !== null) d += `${d && points[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  const split = buckets.findIndex((b) => b.hourly);
  const h = hover ?? n - 1;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (r.right - e.clientX) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[72px] text-ink touch-none" role="img" aria-label={`${label}: ${points[n - 1] ?? "אין עדיין"} עכשיו`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="stroke-paper-line" strokeWidth="1" />
        {split > 0 && <line x1={x(split)} x2={x(split)} y1={P} y2={H - P} className="stroke-paper-line" strokeDasharray="3 3" />}
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points[h] !== null && <circle cx={x(h)} cy={y(points[h]!)} r="3.5" fill="currentColor" />}
      </svg>
      {/* התאריך והשעה רק בהצבעה על הגרף — לא בכל גרף כל הזמן (הכרעת בעלים 24.10.2026) */}
      <figcaption className={`text-xs text-ink-soft min-h-[1rem] ${hover === null ? "invisible" : ""}`}>
        <span className="font-num tabular text-ink">{bucketLabel(buckets[h])}: {points[h] ?? "—"}</span>
      </figcaption>
    </figure>
  );
}

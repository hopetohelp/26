import { useState } from "react";

/** נקודת זמן בסדרות הקבוצה: תחילת השעה או היום, והאם שעתית */
export type SeriesBucket = { t: string; hourly: boolean };

const TZ = "Asia/Jerusalem";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** תאריך כמו בכל האתר (יום/חודש), ובנקודה שעתית גם השעה בשעון ישראל */
export const bucketLabel = (b: SeriesBucket) => {
  const p = Object.fromEntries(fmt.formatToParts(new Date(b.t)).map((x) => [x.type, x.value]));
  return b.hourly ? `${p.day}/${p.month} ${p.hour}:${p.minute}` : `${p.day}/${p.month}`;
};

/**
 * קו מצטבר, נקודה לכל שעה מימין לשמאל. צבע אחד (ink) — זה לא נתון מפלגתי. null = אין עדיין ערך (לפני הרישום הראשון).
 */
export default function GroupSeriesChart({ buckets, points, label, height = 72 }: { buckets: SeriesBucket[]; points: (number | null)[]; label: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = height, P = 4;
  const n = points.length;
  const top = Math.max(1, ...points.map((v) => v ?? 0));
  // מדרגות בגובה (הכרעת בעלים 25.10.2026): קו בהיר בכל מדרגה עגולה (1, 2 או 5 כפול חזקת 10), כ-3–4 קווים
  const raw = top / (height > 100 ? 5 : 4), pow = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((m) => m * pow).find((x) => x >= raw) ?? pow * 10;
  const max = Math.max(top, step * Math.ceil(top / step));
  const levels = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step);
  // RTL: הזמן זורם מימין לשמאל, כמו הקריאה
  const x = (i: number) => (n <= 1 ? W / 2 : W - P - (i * (W - 2 * P)) / (n - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  // קו לגובה בסוף כל יום (הכרעת בעלים 28.10.2026): בין הנקודה האחרונה של יום (שעון ישראל) לראשונה של הבא
  const dayEnds = buckets.slice(1, n).flatMap((b, k) => (dayFmt.format(new Date(b.t)) !== dayFmt.format(new Date(buckets[k].t)) ? [(x(k) + x(k + 1)) / 2] : []));
  let d = "";
  points.forEach((v, i) => { if (v !== null) d += `${d && points[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  const h = hover ?? n - 1;
  // השינוי לעומת הנקודה הקודמת שיש בה ערך (הכרעת בעלים 25.10.2026: לכל נקודה — השעה או היום והשינוי)
  const prev = (i: number) => { for (let k = i - 1; k >= 0; k--) if (points[k] !== null) return points[k]; return null; };
  const delta = (i: number) => { const v = points[i], p = prev(i); return v === null || p === null ? null : v - p; };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = (r.right - e.clientX) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };
  return (
    <figure className="space-y-1">
      <div className="flex items-stretch gap-1">
      {/* המספר של כל קו גובה — טקסט רגיל בגודל קריא ליד הגרף, לא בתוך הציור המוקטן (הכרעת בעלים 25.10.2026) */}
      <div className="relative w-10 shrink-0" style={{ height }} aria-hidden="true">
        {levels.map((v) => <span key={v} className="absolute end-0 -translate-y-1/2 text-xs font-num tabular text-ink-soft leading-none" style={{ top: `${(y(v) / H) * 100}%` }}>{v.toLocaleString("he-IL")}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="flex-1 min-w-0 text-ink touch-none" style={{ height }} role="img" aria-label={`${label}: ${points[n - 1] ?? "אין עדיין"} עכשיו`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="stroke-paper-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {levels.map((v) => <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} className="stroke-paper-line" strokeWidth="1" opacity=".7" vectorEffect="non-scaling-stroke" />
        </g>)}
        {dayEnds.map((dx) => <line key={dx} x1={dx} x2={dx} y1={P} y2={H - P} className="stroke-paper-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* נקודה לכל שעה או יום; הנבחרת גדולה יותר */}
        {/* הגרף נמתח לרוחב (preserveAspectRatio none) — נקודה = קו באורך 0 עם קצה עגול ועובי קבוע, כדי שתישאר עגולה */}
        {points.map((v, i) => v !== null && i !== h && <line key={i} x1={x(i)} x2={x(i)} y1={y(v)} y2={y(v)} stroke="currentColor" strokeLinecap="round" strokeWidth={n > 60 ? 2.5 : 3.5} opacity=".55" vectorEffect="non-scaling-stroke" />)}
        {points[h] !== null && <line x1={x(h)} x2={x(h)} y1={y(points[h]!)} y2={y(points[h]!)} stroke="currentColor" strokeLinecap="round" strokeWidth="7" vectorEffect="non-scaling-stroke" />}
      </svg>
      </div>
      {/* התאריך או השעה והשינוי — רק במעבר או בלחיצה על נקודה, לא בכל גרף כל הזמן (הכרעת בעלים 24.10.2026, 25.10.2026) */}
      <figcaption className={`text-xs text-ink-soft min-h-[1rem] ${hover === null ? "invisible" : ""}`}>
        <span className="font-num tabular text-ink">{bucketLabel(buckets[h])}: {points[h] ?? "—"}</span>
        {delta(h) !== null && <span className="font-num tabular"> ({delta(h)! > 0 ? "+" : ""}{delta(h)} בשעה הזו)</span>}
      </figcaption>
    </figure>
  );
}

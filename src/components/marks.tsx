import type { ReactNode } from "react";
import { volumeLevel, type Level, type LSeg } from "../lib/chartLanguage";

/**
 * הסימנים של שפת הציור האחידה (`src/lib/chartLanguage.ts`, מחלקות `mk-*` ב-`src/index.css`), לגרפים של שורות ב-HTML.
 * כולם מוצבים באחוזים על מסלול `relative` ב-`dir="ltr"`, כך שהציר (0 משמאל) נשאר זהה בכל האתר.
 */

/**
 * נר = טווח, בעובי שמשתנה לאורכו: קטעים סמוכים, וכל קטע בעובי לפי כמות הנתונים בו (רמה 1 עד 5, ביחס לכל הגרף).
 * `x` ממפה ערך על הציר לאחוז מהמסלול. עבה היכן שרוב הנתונים, ודק בקצוות.
 */
export function ProfileCandle({ segs, x, title }: { segs: LSeg[]; x: (v: number) => number; title?: string }) {
  if (!segs.length) return null;
  const from = x(segs[0].from);
  const to = x(segs[segs.length - 1].to);
  return (
    <span aria-hidden="true" title={title} className="mk-prof" style={{ left: `${from}%`, width: `${Math.max(to - from, 0.8)}%` }}>
      {segs.map((g, k) => (
        <i key={k} className={`l${g.level}`} style={{ flexGrow: Math.max(g.to - g.from, 1e-6) }} />
      ))}
    </span>
  );
}

/** אותו נר בכיוון אנכי (גרף עם ציר זמן): `y` ממפה ערך לאחוז מגובה המסלול, מלמעלה. הערך הגבוה למעלה. */
export function ProfileCandleV({ segs, y, left }: { segs: LSeg[]; y: (v: number) => number; left: string }) {
  if (!segs.length) return null;
  const top = y(segs[segs.length - 1].to);
  const bottom = y(segs[0].from);
  return (
    <span aria-hidden="true" className="mk-pv" style={{ left, top: `${top}%`, height: `${Math.max(bottom - top, 0.8)}%` }}>
      {segs
        .slice()
        .reverse()
        .map((g, k) => (
          <i key={k} className={`l${g.level}`} style={{ flexGrow: Math.max(g.to - g.from, 1e-6) }} />
        ))}
    </span>
  );
}

/** ממוצע נוכחי = עיגול בינוני מלא */
export const MeanDot = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-mean" style={{ left: `${at}%` }} />;

/** תוצאת אמת = עיגול גדול ריק */
export const ResultRing = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-ring" style={{ left: `${at}%` }} />;

/** סמן על קו = עיגול קטן ריק */
export const SmallDot = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-dot" style={{ left: `${at}%` }} />;

/** ממוצע הגולשים בסקר האתר = מעוין ריק (אינו סקר) */
export const Diamond = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-dia" style={{ left: `${at}%` }} />;

export type MarkKind = "candle" | "mean" | "result" | "dot" | "diamond";

/** דוגמית סימן למקרא. הנר מצויר ברמה 3 (בינונית) אלא אם צוינה רמה */
export function Swatch({ kind }: { kind: MarkKind; level?: Level }) {
  if (kind === "candle")
    return (
      <i aria-hidden="true" className="mk mk-sw mk-prof" style={{ width: "2rem" }}>
        {[1, 3, 5, 4, 2, 1].map((l, k) => (
          <i key={k} className={`l${l}`} />
        ))}
      </i>
    );
  const cls = { mean: "mk-mean", result: "mk-ring", dot: "mk-dot", diamond: "mk-dia" }[kind];
  return <i aria-hidden="true" className={`mk mk-sw ${cls}`} />;
}

/** פריט מקרא: דוגמית וטקסט */
export function KeyItem({ kind, level: _level, children }: { kind: MarkKind; level?: Level; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Swatch kind={kind} />
      {children}
    </span>
  );
}

/** מסלול של שורה: `relative`, שמאל לימין, ורשת של קווים דקים כל `step` יחידות. 0 משמאל בכל האתר */
export function Track({ axisMax, step = 10, className = "h-5", title, children }: { axisMax: number; step?: number; className?: string; title?: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      title={title}
      dir="ltr"
      className={`relative block ${className}`}
      style={{ backgroundImage: "linear-gradient(to right, rgb(var(--line)) 1px, transparent 1px)", backgroundSize: `${(step / axisMax) * 100}% 100%`, backgroundRepeat: "repeat-x" }}
    >
      {children}
    </span>
  );
}

/** תוויות הציר מעל המסלולים (פעם אחת בראש הגרף) */
export function AxisLabels({ axisMax, step = 10, format = (v: number) => String(v) }: { axisMax: number; step?: number; format?: (v: number) => string }) {
  const ticks = Array.from({ length: Math.floor(axisMax / step) + 1 }, (_, i) => i * step);
  return (
    <div aria-hidden="true" dir="ltr" className="relative h-4">
      {ticks.map((v) => (
        <span key={v} className="absolute -translate-x-1/2" style={{ left: `${(v / axisMax) * 100}%` }}>{format(v)}</span>
      ))}
    </div>
  );
}

/** מקרא עובי הנר: מעט ... הרבה, בחמש רמות לפי כמות הנתונים בכל קטע, ביחס לקטע העמוס ביותר באותו נר */
export function ThicknessKey({ what }: { what: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`עובי הנר בכל קטע: ${what}, ביחס לקטע העמוס ביותר באותו נר. חמש רמות: מתחת ל-20%, מ-20%, מ-40%, מ-60%, מ-80%.`}>
      <span>עובי הנר: {what}</span>
      <span className="inline-flex items-center gap-1">
        <span>מעט</span>
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          {([1, 2, 3, 4, 5] as const).map((l) => (
            <i key={l} className={`mk mk-sw mk-candle mk-c${l}`} style={{ width: ".7rem" }} />
          ))}
        </span>
        <span>הרבה</span>
      </span>
    </span>
  );
}

export { volumeLevel };

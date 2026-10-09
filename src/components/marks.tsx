import type { CSSProperties, ReactNode } from "react";
import { volumeLevel, type Level } from "../lib/chartLanguage";

/**
 * הסימנים של שפת הציור האחידה (`src/lib/chartLanguage.ts`, מחלקות `mk-*` ב-`src/index.css`), לגרפים של שורות ב-HTML.
 * כולם מוצבים באחוזים על מסלול `relative` ב-`dir="ltr"`, כך שהציר (0 משמאל) נשאר זהה בכל האתר.
 */

/** נר = טווח. `from` ו-`to` באחוזים מהמסלול; `level` = עובי לפי כמות הנתונים ביחס לגרף */
export function Candle({ from, to, level, style }: { from: number; to: number; level: Level; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`mk mk-candle mk-c${level}`} style={{ left: `${from}%`, width: `${Math.max(to - from, 0.8)}%`, ...style }} />;
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
export function Swatch({ kind, level = 3 }: { kind: MarkKind; level?: Level }) {
  if (kind === "candle") return <i aria-hidden="true" className={`mk mk-sw mk-candle mk-c${level}`} style={{ width: "1.6rem" }} />;
  const cls = { mean: "mk-mean", result: "mk-ring", dot: "mk-dot", diamond: "mk-dia" }[kind];
  return <i aria-hidden="true" className={`mk mk-sw ${cls}`} />;
}

/** פריט מקרא: דוגמית וטקסט */
export function KeyItem({ kind, level, children }: { kind: MarkKind; level?: Level; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Swatch kind={kind} level={level} />
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

/** מקרא עובי הנר: מעט ... הרבה, בחמש רמות לפי כמות הנתונים הרלוונטית ביחס לגרף (עד 20%, 20 עד 40, 40 עד 60, 60 עד 80, 80 עד 100) */
export function ThicknessKey({ what }: { what: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`עובי הנר: ${what}, ביחס לשאר הגרף. חמש רמות: עד 20%, 20 עד 40, 40 עד 60, 60 עד 80, 80 עד 100.`}>
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

/** טקסט הרחפה לנר: מה נספר ובאיזו רמה (1 עד 5) */
export const candleTitle = (what: string, level: Level) => `${what} · עובי הנר: רמה ${level} מתוך 5`;

export { volumeLevel };

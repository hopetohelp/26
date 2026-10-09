import type { ReactNode } from "react";
import { CANDLE_PX, squarePath, squareRuns, type LSeg } from "../lib/chartLanguage";

/**
 * הסימנים של שפת הציור האחידה (`src/lib/chartLanguage.ts`, מחלקות `mk-*` ב-`src/index.css`), לגרפים של שורות ב-HTML.
 * כולם מוצבים באחוזים על מסלול `relative` ב-`dir="ltr"`, כך שהציר (0 משמאל) נשאר זהה בכל האתר.
 */

/** נר אופקי: קטעים סמוכים של קו מלא וקופסאות חלולות. הקואורדינטות המקומיות: 0 עד 1000 לאורך ו-0 עד 16 לרוחב (פיקסלים) */
const LOCAL = 1000;
const THICK = CANDLE_PX[5];

/**
 * נר = טווח, בעובי שמשתנה לאורכו לפי כמות הנתונים בכל קטע (רמה 1, 3 או 5): נר מרובע כמו נר יפני, שבו רמה 1 היא קו מלא
 * ורמות 3 ו-5 הן קופסה סגורה וחלולה (הכרעת בעלים 9.10.2026). `x` ממפה ערך על הציר לאחוז מהמסלול. עבה היכן שרוב הנתונים, ודק בקצוות.
 */
/** הקטעים כרכיבי path: קו מלא (`mk-sq-f`) או קופסה חלולה (`mk-sq`) */
export function SquarePaths({ runs, mid, across = "y" }: { runs: ReturnType<typeof squareRuns>; mid: number; across?: "x" | "y" }) {
  return <>{runs.map((r, i) => <path key={i} d={squarePath(r, mid, across)} className={r.filled ? "mk-sq mk-sq-f" : "mk-sq"} />)}</>;
}

export function ProfileCandle({ segs, x, title }: { segs: LSeg[]; x: (v: number) => number; title?: string }) {
  if (!segs.length) return null;
  const from = x(segs[0].from);
  const to = x(segs[segs.length - 1].to);
  const width = Math.max(to - from, 0.8);
  const left = from - (width - (to - from)) / 2;
  const runs = squareRuns(segs, (v) => ((x(v) - left) / width) * LOCAL);
  return (
    <svg aria-hidden="true" focusable="false" className="mk-prof" viewBox={`0 0 ${LOCAL} ${THICK}`} preserveAspectRatio="none" style={{ left: `${left}%`, width: `${width}%` }}>
      {title && <title>{title}</title>}
      <SquarePaths runs={runs} mid={THICK / 2} />
    </svg>
  );
}

/** אותו נר בכיוון אנכי (גרף עם ציר זמן): `y` ממפה ערך לאחוז מגובה המסלול, מלמעלה. הערך הגבוה למעלה. */
export function ProfileCandleV({ segs, y, left }: { segs: LSeg[]; y: (v: number) => number; left: string }) {
  if (!segs.length) return null;
  const top = y(segs[segs.length - 1].to);
  const bottom = y(segs[0].from);
  const height = Math.max(bottom - top, 0.8);
  const top0 = top - (height - (bottom - top)) / 2;
  const runs = squareRuns(segs, (v) => ((y(v) - top0) / height) * LOCAL);
  return (
    <svg aria-hidden="true" focusable="false" className="mk-pv" viewBox={`0 0 ${THICK} ${LOCAL}`} preserveAspectRatio="none" style={{ left, top: `${top0}%`, height: `${height}%` }}>
      <SquarePaths runs={runs} mid={THICK / 2} across="x" />
    </svg>
  );
}

/** ממוצע = עיגול מלא כתום בקוטר 22, גדול מהנר העבה */
export const MeanDot = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-mean" style={{ left: `${at}%` }} />;

/** תוצאה (מציאות) = עיגול ריק שחור בקוטר 22, גדול מהנר העבה (גם ממוצע הגולשים בסקר האתר, שאינו סקר) */
export const ResultRing = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-ring" style={{ left: `${at}%` }} />;

/** סמן על קו = עיגול קטן ריק */
export const SmallDot = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-dot" style={{ left: `${at}%` }} />;

export type MarkKind = "candle" | "mean" | "result" | "dot";

/** דוגמית סימן למקרא. הנר מצויר כפרופיל קטן: זנב דק, בינוני, עבה, בינוני, זנב דק */
export function Swatch({ kind }: { kind: MarkKind }) {
  if (kind === "candle") {
    const segs: LSeg[] = ([1, 1, 3, 5, 5, 3, 1, 1] as const).map((level, i) => ({ from: i, to: i + 1, level }));
    const runs = squareRuns(segs, (v) => (v / 8) * LOCAL);
    return (
      <svg aria-hidden="true" focusable="false" className="mk-sw mk-prof-sw" viewBox={`0 0 ${LOCAL} ${THICK}`} preserveAspectRatio="none">
        <SquarePaths runs={runs} mid={THICK / 2} />
      </svg>
    );
  }
  const cls = { mean: "mk-mean", result: "mk-ring", dot: "mk-dot" }[kind];
  return <i aria-hidden="true" className={`mk mk-sw ${cls}`} />;
}

/** מסלול של שורה: `relative`, שמאל לימין, ורשת של קווים דקים כל `step` יחידות. 0 משמאל בכל האתר. הסימנים והרשת בשטח פנימי (`mk-plot`) שמרוחק `MARK_PAD` מכל קצה, כדי שעיגול בקצה (למשל 0) לא יחרוג אל עמודת המספרים או הטקסט (הכרעת בעלים 9.10.2026) */
export function Track({ axisMax, step = 10, className = "h-5", title, children }: { axisMax: number; step?: number; className?: string; title?: string; children: ReactNode }) {
  return (
    <span aria-hidden="true" title={title} dir="ltr" className={`relative block ${className}`}>
      <span
        className="mk-plot"
        style={{ backgroundImage: "linear-gradient(to right, rgb(var(--line)) 1px, transparent 1px)", backgroundSize: `${(step / axisMax) * 100}% 100%`, backgroundRepeat: "repeat-x" }}
      >
        {children}
      </span>
    </span>
  );
}

/** תוויות הציר מעל המסלולים (פעם אחת בראש הגרף) */
export function AxisLabels({ axisMax, step = 10, format = (v: number) => String(v) }: { axisMax: number; step?: number; format?: (v: number) => string }) {
  const ticks = Array.from({ length: Math.floor(axisMax / step) + 1 }, (_, i) => i * step);
  return (
    <div aria-hidden="true" dir="ltr" className="relative h-4">
      <span className="mk-plot">
        {ticks.map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: `${(v / axisMax) * 100}%` }}>{format(v)}</span>
        ))}
      </span>
    </div>
  );
}

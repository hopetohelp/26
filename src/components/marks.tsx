import type { ReactNode } from "react";
import type { LSeg } from "../lib/chartLanguage";
import { capsuleGradient, verticalTagSides } from "../lib/capsule";
import { seatsFmt } from "../lib/format";

/** קפסולה אחת לכל טווח, באחוזונים הקיימים ובקצוות המקוריים. */
export function ProfileCandle({ segs, x, title }: { segs: LSeg[]; x: (v: number) => number; title?: string }) {
  if (!segs.length) return null;
  const from = Math.min(...segs.map(s => x(s.from))), to = Math.max(...segs.map(s => x(s.to)));
  return <span aria-hidden="true" title={title} className="mk-prof mk-capsule" data-candle-style="capsule" data-range-start={from} data-range-end={to} style={{ left: `${from}%`, width: `${to - from}%`, minWidth: 1, backgroundImage: capsuleGradient(segs, x) }} />;
}
export function ProfileCandleV({ segs, y, left, delay }: { segs: LSeg[]; y: (v: number) => number; left: string; delay?: number }) {
  if (!segs.length) return null;
  const top = Math.min(...segs.map(s => y(s.to))), bottom = Math.max(...segs.map(s => y(s.from)));
  return <span aria-hidden="true" className={delay === undefined ? "mk-pv mk-capsule" : "mk-pv mk-capsule trend-pop"} data-candle-style="capsule" data-range-start={top} data-range-end={bottom} style={{ left, top: `${top}%`, height: `${bottom - top}%`, minHeight: 1, backgroundImage: capsuleGradient(segs, y, true), ...(delay === undefined ? {} : { animationDelay: `${delay}ms` }) }} />;
}
export interface CapsuleDatum { at: number; value: number; label: string; text?: string }
/** בשורות אופקיות התגים מעל ומתחת לנר. הקו החוצה נשאר בדיוק על הערך בציר. */
export function CapsuleMarks({ primary, secondary }: { primary?: CapsuleDatum; secondary?: CapsuleDatum }) {
  return <>{([['primary', primary], ['secondary', secondary]] as const).map(([kind, datum]) => datum && <span key={kind} aria-hidden="true" className="mk-capsule-mark" data-kind={kind} style={{ left: `${datum.at}%` }} title={`${datum.label}: ${datum.text ?? seatsFmt(datum.value)}`}><i className="mk-capsule-cross" /><bdi className="mk-capsule-tag" dir="ltr">{datum.text ?? seatsFmt(Math.round(datum.value * 10) / 10)}</bdi></span>)}</>;
}
/** אנכי: קו ברוחב הקפסולה ותג צדדי צמוד מעליו או מתחתיו. */
export function CapsuleMarksV({ left, primary, secondary, y, format = seatsFmt, delay }: { left: string; primary?: { value: number; label: string }; secondary?: { value: number; label: string }; y: (v: number) => number; format?: (v: number) => string; delay?: number }) {
  if (!primary && !secondary) return null;
  const sides = verticalTagSides(primary?.value ?? secondary!.value, secondary?.value);
  return <>{([['primary', primary], ['secondary', secondary]] as const).map(([kind, datum]) => datum && <span key={kind} aria-hidden="true" className={`mk-capsule-mark-v${delay === undefined ? '' : ' trend-pop'}`} data-kind={kind} data-side={sides[kind]} style={{ left, top: `${y(datum.value)}%`, ...(delay === undefined ? {} : { animationDelay: `${delay}ms` }) }} title={`${datum.label}: ${format(datum.value)}`}><i className="mk-capsule-cross" /><bdi className="mk-capsule-tag" dir="ltr">{format(datum.value)}</bdi></span>)}</>;
}
/** ממוצעים מחוץ לנר הם קווים, וסמני קו מגמה רגילים נשארים נקודות. */
export const MeanDot = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-primary-line" style={{ left: `${at}%` }} />;
export const ResultRing = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-secondary-line" style={{ left: `${at}%` }} />;
export const SmallDot = ({ at }: { at: number }) => <span aria-hidden="true" className="mk mk-dot" style={{ left: `${at}%` }} />;
export type MarkKind = "candle" | "mean" | "result" | "dot";
export function Swatch({ kind }: { kind: MarkKind }) {
  if (kind === 'candle') return <span aria-hidden="true" className="mk-prof-sw mk-capsule" style={{ backgroundImage: capsuleGradient(([1, 3, 5, 3, 1] as const).map((level, i) => ({ from: [0, 1, 2, 8, 9][i], to: [1, 2, 8, 9, 10][i], level })), v => v) }} />;
  return <i aria-hidden="true" className={`mk mk-sw ${{ mean: 'mk-primary-line', result: 'mk-secondary-line', dot: 'mk-dot' }[kind]}`} />;
}

/** מסלול של שורה: `relative`, שמאל לימין, ורשת של קווים דקים כל `step` יחידות. 0 משמאל בכל האתר. הסימנים והרשת בשטח פנימי (`mk-plot`) שמרוחק `MARK_PAD` מכל קצה, כדי שעיגול בקצה (למשל 0) לא יחרוג אל עמודת המספרים או הטקסט (הכרעת בעלים 9.10.2026) */
export function Track({ axisMax, step = 10, className = "h-5", title, children }: { axisMax: number; step?: number; className?: string; title?: string; children: ReactNode }) {
  return (
    <span aria-hidden="true" title={title} dir="ltr" className={`mk-capsule-track relative block ${className}`}>
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

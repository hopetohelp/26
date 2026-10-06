import { useEffect, useMemo, useRef, useState } from "react";
import { colorOf } from "../../lib/colors";
import { largestRemainder, TOTAL } from "../../lib/fillAll";
import { useTheme } from "../../lib/theme";
import { IDS, nameOf } from "./model";

/** 120 מושבים בחצי עיגול: מיקום קבוע לכל מושב, מימין לשמאל ומהשורה הפנימית החוצה */
const ROWS = 6;
export const SEATS = (() => {
  const radii = Array.from({ length: ROWS }, (_, i) => 0.44 + (i * 0.56) / (ROWS - 1));
  const per = largestRemainder(TOTAL, Object.fromEntries(radii.map((r, i) => [String(i), r])));
  const out: { x: number; y: number; a: number; r: number }[] = [];
  radii.forEach((r, i) => {
    const n = per[String(i)];
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? Math.PI / 2 : (k / (n - 1)) * Math.PI;
      out.push({ x: 1.1 + r * Math.cos(a), y: 1.07 - r * Math.sin(a), a, r });
    }
  });
  return out.sort((p, q) => p.a - q.a || q.r - p.r);
})();

/** סדר הרשימות (מהגדולה) והצבע של כל מושב — משותף ללוח ולתמונת השיתוף */
export function seatFills(values: Record<string, number>) {
  const order = IDS.filter((id) => (values[id] ?? 0) > 0).sort((a, b) => values[b] - values[a]);
  const fills: { id: string; i: number }[] = [];
  order.forEach((id) => {
    for (let k = 0; k < values[id] && fills.length < TOTAL; k++) fills.push({ id, i: IDS.indexOf(id) });
  });
  return { order, fills };
}

export default function SeatBoard({ values }: { values: Record<string, number> }) {
  const [theme] = useTheme();
  const board = theme === "board";
  const { order, fills } = useMemo(() => seatFills(values), [values]);
  const total = IDS.reduce((a, id) => a + (values[id] ?? 0), 0);
  const left = TOTAL - total;

  // רגע אחד של "הכנסת מלאה" — רק כשהסכום מגיע ל-120 (מכובה ב-prefers-reduced-motion דרך index.css)
  const [pop, setPop] = useState(false);
  const prev = useRef(total);
  useEffect(() => {
    if (total === TOTAL && prev.current !== TOTAL) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 900);
      prev.current = total;
      return () => clearTimeout(t);
    }
    prev.current = total;
  }, [total]);

  const status = left === 0 ? "הכנסת שלך מלאה" : left > 0 ? `נותרו ${left} לחלוקה` : `${-left} יותר מדי`;
  return (
    <figure className={`rounded-theme p-3 md:p-4 ${board ? "bg-frame text-frame-ink" : "bg-paper-card border border-paper-line"}`}>
      <svg viewBox="0 0 2.2 1.12" className={`w-full h-auto block ${pop ? "seat-pop" : ""}`} role="img" aria-label={`${total} מתוך 120 מנדטים חולקו`}>
        {SEATS.map((s, k) => {
          const f = fills[k];
          return (
            <circle
              key={k}
              cx={s.x}
              cy={s.y}
              r={0.038}
              className={f ? "" : board ? "fill-frame-line" : "fill-paper-line"}
              style={f ? { fill: colorOf(f.id, f.i) } : undefined}
            />
          );
        })}
      </svg>
      <div className="flex items-baseline justify-center gap-3 -mt-8 md:-mt-12 relative" aria-hidden="true">
        <span dir="ltr" className="inline-flex items-baseline">
          <span className={`font-num tabular leading-none text-6xl md:text-7xl ${board ? "text-signal" : "text-ink"}`}>{total}</span>
          <span className={`font-num text-2xl md:text-3xl ${board ? "text-frame-soft" : "text-ink-soft"}`}>/120</span>
        </span>
      </div>
      <p className={`text-center text-sm font-bold ${left < 0 ? (board ? "text-signal" : "text-warn") : board ? "text-frame-soft" : "text-ink-soft"}`} aria-hidden="true">
        {status}
      </p>
      <p className="sr-only" aria-live="polite">
        {status}. {order.map((id) => `${nameOf(id)} ${values[id]}`).join(", ")}
      </p>
      {order.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-hidden="true">
          {order.map((id) => (
            <li key={id} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(id, IDS.indexOf(id)) }} />
              <span className={board ? "text-frame-ink" : "text-ink"}>{nameOf(id)}</span>
              <span className={`tabular font-bold ${board ? "text-signal" : "text-ink"}`}>{values[id]}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

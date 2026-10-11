import { useEffect, useMemo, useRef, useState } from "react";
import { colorOf } from "../../lib/colors";
import { TOTAL } from "../../lib/fillAll";
import { hemicycleSeats } from "../../lib/hemicycle";
import { IDS, nameOf } from "./model";

/** 120 מושבים בחצי עיגול: המיקומים ב-`src/lib/hemicycle.ts` (משותפים גם לבית) */
export const SEATS = hemicycleSeats(1.1, 1.07);

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
    <figure className="rounded-theme p-3 md:p-4 bg-paper-card border border-paper-line">
      <svg viewBox="0 0 2.2 1.12" className={`w-full h-auto block ${pop ? "seat-pop" : ""}`} role="img" aria-label={`${total} מתוך 120 מנדטים חולקו`}>
        {SEATS.map((s, k) => {
          const f = fills[k];
          return (
            <circle
              key={k}
              cx={s.x}
              cy={s.y}
              r={0.038}
              className={f ? "" : "fill-paper-line"}
              style={f ? { fill: colorOf(f.id, f.i) } : undefined}
            />
          );
        })}
      </svg>
      <div className="flex items-baseline justify-center gap-3 -mt-8 md:-mt-12 relative" aria-hidden="true">
        <span dir="ltr" className="inline-flex items-baseline">
          <span className="font-num tabular leading-none text-5xl md:text-6xl text-ink">{total}</span>
          <span className="font-num leading-none text-5xl md:text-6xl text-ink-soft">/120</span>
        </span>
      </div>
      <p className={`text-center text-sm font-bold ${left < 0 ? "text-warn" : "text-ink-soft"}`} aria-hidden="true">
        {status}
      </p>
      <p className="sr-only" aria-live="polite">
        {status}. {order.map((id) => `${nameOf(id)} ${values[id]}`).join(", ")}
      </p>
      {order.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5" aria-hidden="true">
          {order.map((id) => (
            <li key={id} className="flex items-center gap-2 border-b border-paper-line pb-1">
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: colorOf(id, IDS.indexOf(id)) }} />
              <span className="flex-1 min-w-0 truncate text-base font-bold text-ink">{nameOf(id)}</span>
              <span className="tabular font-num text-2xl leading-none text-ink">{values[id]}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { colorOf } from "../../lib/colors";
import { TOTAL } from "../../lib/fillAll";
import { HALL, hemicycleSeats } from "../../lib/hemicycle";
import { useSeen, whenVisible } from "../../lib/useSeen";
import { IDS, nameOf } from "./model";

/** 120 מושבים בצורת פרסה: המיקומים ב-`src/lib/hemicycle.ts` (משותפים גם לבית ולתמונת השיתוף) */
export const SEATS = hemicycleSeats();

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

  const [seenRef, seen] = useSeen<HTMLElement>();
  const status = left === 0 ? "הכנסת שלך מלאה" : left > 0 ? `נותרו ${left} לחלוקה` : `${-left} יותר מדי`;
  return (
    <figure ref={seenRef} className={`rounded-theme p-3 md:p-4 bg-paper-card border border-paper-line ${whenVisible(seen)}`}>
      <svg viewBox={`0 0 ${HALL.w} ${HALL.h}`} className={`w-full h-auto block ${pop ? "seat-pop" : ""}`} role="img" aria-label={`${total} מתוך 120 מנדטים חולקו`}>
        {SEATS.map((s, k) => {
          const f = fills[k];
          return (
            <circle
              key={k}
              cx={s.x}
              cy={s.y}
              r={HALL.r}
              className={`seat-in ${f ? "" : "fill-paper-line"}`}
              style={{ animationDelay: `${k * 5}ms`, ...(f ? { fill: colorOf(f.id, f.i) } : {}) }}
            />
          );
        })}
        {/* המספר במרכז הפרסה: שניהם באותו גודל, והגודל נגזר מרוחב הלוח (viewBox) כדי שייכנס בחלל הפנימי גם כש"120/120" */}
        <text x={HALL.cx} y={HALL.cy + 0.058} textAnchor="middle" direction="ltr" className="font-num tabular" fontSize={0.16} fontWeight={700}>
          <tspan style={{ fill: "rgb(var(--ink))" }}>{total}</tspan>
          <tspan style={{ fill: "rgb(var(--ink-soft))" }}>/120</tspan>
        </text>
      </svg>
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

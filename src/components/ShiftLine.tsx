import type { SeatShift } from "../engine/seatChange";
import { num, pctValue } from "../lib/format";

const LTR = (t: string) => `\u2066${t}\u2069`;

/** שורה אחת של השינוי הקרוב: כיוון (חץ וסימן, לא רק צבע), קולות ואחוז ביחס לקולות שיש לרשימה (אחוז מתחת ל-0.1% לא מוצג) */
export default function ShiftLine({ shift, up }: { shift: SeatShift | null; up: boolean }) {
  if (!shift) return null;
  const sign = up ? "+" : "\u2212";
  return (
    <div className={`whitespace-nowrap ${up ? "text-pos" : "text-neg"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"} </span>
      <span className="sr-only">{up ? "מנדט נוסף:" : "איבוד מנדט:"} </span>
      {LTR(`${sign}${num(shift.votes)}`)}{shift.pct !== null && shift.pct >= 0.1 && <> ({LTR(`${sign}${shift.pct >= 100 ? num(shift.pct) : pctValue(shift.pct, 1)}%`)})</>}
    </div>
  );
}


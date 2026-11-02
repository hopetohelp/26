import DeviationChart from "../components/deviationChart";
import { Card } from "../components/ui";
import type { SeatShift } from "../engine/seatChange";
import { listName } from "../lib/data";
import { accuracyPct, correctSeats, exactLists } from "../lib/guessAccuracy";
import { finalPolls, pollMean, results2026 } from "../lib/guessAccuracyData";
import { partialLine } from "../lib/voterFlow";
import { num, pctValue } from "../lib/format";

const LTR = (t: string) => `\u2066${t}\u2069`;

/** כפתור 2026 בלשוניות "תוצאות אמת" ו"דיוק הסקרים" (הכרעת בעלים 28.10.2026): מאותם נתונים של מסך "תוצאות" — raw/results-2026.json והסקרים האחרונים */
export const K26 = { id: "k26", label: "2026" };
const pct = (results2026 as { pct?: Record<string, number> }).pct ?? {};
const actual = results2026.seats;
const ids = Object.keys(actual).sort((a, b) => (actual[b] ?? 0) - (actual[a] ?? 0) || (pct[b] ?? 0) - (pct[a] ?? 0));

/** שורה אחת של השינוי הקרוב: כיוון (חץ וסימן, לא רק צבע), קולות ואחוז ביחס לקולות שיש לרשימה (אחוז מתחת ל-0.1% לא מוצג) */
export function ShiftLine({ shift, up }: { shift: SeatShift | null; up: boolean }) {
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

/** "דיוק הסקרים" — 2026: הסקר האחרון של כל סדרה לפני הבחירות מול הספירה הנוכחית (בלי המדגמים) */
export function Accuracy2026({ chips }: { chips?: React.ReactNode }) {
  const rows = ids.filter((id) => (actual[id] ?? 0) > 0 || (pollMean[id] ?? 0) >= 1).map((id) => {
    const values = finalPolls.map((p) => p.values[id]).filter((v): v is number => v !== undefined);
    return { id, name: listName(id), estimate: pollMean[id] ?? 0, min: Math.min(...values), max: Math.max(...values), actual: actual[id] ?? 0, n: values.length, values };
  });
  const byPoll = finalPolls.map((p) => ({ label: p.label, end: p.end, acc: accuracyPct(p.values, actual), exact: exactLists(p.values, actual) })).sort((a, b) => b.acc - a.acc);
  return (
    <Card title="הסקרים מול התוצאות">
      {chips}
      <h3 className="text-xl font-display leading-tight mt-4 mb-1">2026 — הסקר האחרון של כל מכון מול הספירה</h3>
      <p className="text-sm text-ink-soft mb-3">{partialLine()} · {finalPolls.length} מכונים · מדגמי יום הבחירות אינם נכללים</p>
      <DeviationChart rows={rows} />
      <table className="w-full text-sm mt-4">
        <caption className="sr-only">המנדטים והמפלגות המדויקים של כל סדרת סקרים</caption>
        <thead><tr className="text-right border-b border-paper-line"><th scope="col" className="py-1 pe-3">מכון ומזמין</th><th scope="col" className="pe-3">הסקר האחרון</th><th scope="col" className="pe-3">מנדטים מדויקים</th><th scope="col">מפלגות מדויקות</th></tr></thead>
        <tbody>
          {byPoll.map((p) => (
            <tr key={p.label} className="border-b border-paper-line">
              <th scope="row" className="py-1 pe-3 text-start font-medium">{p.label}</th>
              <td className="pe-3 tabular-nums">{p.end.slice(8, 10)}/{Number(p.end.slice(5, 7))}</td>
              <td className="pe-3 tabular-nums">{correctSeats(p.acc)}</td><td className="tabular-nums">{p.exact}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

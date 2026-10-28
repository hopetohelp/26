import { Link } from "react-router-dom";
import DeviationChart from "../components/deviationChart";
import { Card } from "../components/ui";
import { listName, registry } from "../lib/data";
import { accuracyPct } from "../lib/guessAccuracy";
import { finalPolls, pollMean, results2026 } from "../lib/guessAccuracyData";
import { partialLine } from "../lib/voterFlow";
import { num, pctValue } from "../lib/format";

/** כפתור 2026 בלשוניות "תוצאות אמת" ו"דיוק הסקרים" (הכרעת בעלים 28.10.2026): מאותם נתונים של מסך "תוצאות" — raw/results-2026.json והסקרים האחרונים */
export const K26 = { id: "k26", label: "2026" };
const pct = (results2026 as { pct?: Record<string, number> }).pct ?? {};
const actual = results2026.seats;
const ids = Object.keys(actual).sort((a, b) => (actual[b] ?? 0) - (actual[a] ?? 0) || (pct[b] ?? 0) - (pct[a] ?? 0));

/** "תוצאות אמת" — 2026: הספירה הנוכחית, הקולות באחוזים והמנדטים לפי מנוע החוק */
export function Results2026({ chips }: { chips: React.ReactNode }) {
  const eligible = (registry as { k26?: { eligible: number } }).k26?.eligible;
  return (
    <Card>
      {chips}
      <h2 className="text-xl font-display leading-tight mt-4">הכנסת ה-26 · 2026</h2>
      <p className="text-sm text-ink-soft">{partialLine()}</p>
      {eligible && <dl className="c-result-stats grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 mt-4 text-sm">
        <div><dt className="text-ink-soft">בעלי זכות בחירה</dt><dd className="text-xl font-bold tabular-nums">{num(eligible)}</dd></div>
      </dl>}
      <table className="w-full text-sm mt-4">
        <caption className="sr-only">תוצאות 2026 — ספירה חלקית</caption>
        <thead><tr className="text-right border-b border-paper-line"><th scope="col" className="py-1 pe-3">רשימה</th><th scope="col" className="pe-3">אחוז מהקולות</th><th scope="col">מנדטים</th></tr></thead>
        <tbody>
          {ids.map((id) => (
            <tr key={id} className="border-b border-paper-line">
              <th scope="row" className="py-1 pe-3 text-start font-medium">{listName(id)}</th>
              <td className="pe-3 tabular-nums">{pct[id] !== undefined ? `${pctValue(pct[id], 1)}%` : "—"}</td>
              <td className="tabular-nums">{actual[id] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm mt-3"><Link to="/past?tab=changes" className="font-semibold">מאיפה הגיעו המצביעים של כל רשימה ⇐ מה השתנה</Link></p>
    </Card>
  );
}

/** "דיוק הסקרים" — 2026: הסקר האחרון של כל סדרה לפני הבחירות מול הספירה הנוכחית (בלי המדגמים) */
export function Accuracy2026({ chips }: { chips: React.ReactNode }) {
  const rows = ids.filter((id) => (actual[id] ?? 0) > 0 || (pollMean[id] ?? 0) >= 1).map((id) => {
    const values = finalPolls.map((p) => p.values[id]).filter((v): v is number => v !== undefined);
    return { id, name: listName(id), estimate: pollMean[id] ?? 0, min: Math.min(...values), max: Math.max(...values), actual: actual[id] ?? 0, n: values.length, values };
  });
  const byPoll = finalPolls.map((p) => ({ label: p.label, end: p.end, acc: accuracyPct(p.values, actual) })).sort((a, b) => b.acc - a.acc);
  return (
    <Card title="הסקרים מול התוצאות">
      {chips}
      <h3 className="text-xl font-display leading-tight mt-4 mb-1">2026 — הסקר האחרון של כל מכון מול הספירה</h3>
      <p className="text-sm text-ink-soft mb-3">{partialLine()} · {finalPolls.length} מכונים · מדגמי יום הבחירות אינם נכללים</p>
      <DeviationChart rows={rows} />
      <table className="w-full text-sm mt-4">
        <caption className="sr-only">אחוז הדיוק של כל סדרת סקרים</caption>
        <thead><tr className="text-right border-b border-paper-line"><th scope="col" className="py-1 pe-3">מכון ומזמין</th><th scope="col" className="pe-3">הסקר האחרון</th><th scope="col">אחוז דיוק</th></tr></thead>
        <tbody>
          {byPoll.map((p) => (
            <tr key={p.label} className="border-b border-paper-line">
              <th scope="row" className="py-1 pe-3 text-start font-medium">{p.label}</th>
              <td className="pe-3 tabular-nums">{p.end.slice(8, 10)}/{Number(p.end.slice(5, 7))}</td>
              <td className="tabular-nums">{Math.round(p.acc)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

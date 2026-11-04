/**
 * לא בשימוש (בדיקת סשן ה, 04.11.2026): "דיוק הסקרים 2026" הישן (גרף הסטייה), שהוסר מהתצוגה בהכרעת הבעלים מ־03.11.2026 —
 * הנתונים בטבלאות הארכיון. אינו זהה לרכיב קיים, ולכן נשאר לפי כלל "אין מחיקה" עד הכרעה. ShiftLine עבר ל־src/components/ShiftLine.tsx.
 */
import DeviationChart from "../components/deviationChart";
import { Card } from "../components/ui";
import { listName } from "../lib/data";
import { seatTags } from "../lib/guessAccuracy";
import { exitPolls } from "../lib/data";
import { SIMPLE_BLOCS } from "../lib/simpleSources";
import { finalPolls, pollMean, results2026 } from "../lib/guessAccuracyData";


/** כפתור 2026 בלשוניות "תוצאות אמת" ו"דיוק הסקרים" (הכרעת בעלים 28.10.2026): מאותם נתונים של מסך "תוצאות" — raw/results-2026.json והסקרים האחרונים */
export const K26 = { id: "k26", label: "2026" };
const pct = (results2026 as { pct?: Record<string, number> }).pct ?? {};
const actual = results2026.seats;
const ids = Object.keys(actual).sort((a, b) => (actual[b] ?? 0) - (actual[a] ?? 0) || (pct[b] ?? 0) - (pct[a] ?? 0));

/** "דיוק הסקרים" — 2026: הסקר האחרון של כל סדרה לפני הבחירות מול הספירה הנוכחית (בלי המדגמים) */
export function Accuracy2026({ chips }: { chips?: React.ReactNode }) {
  const rows = ids.filter((id) => (actual[id] ?? 0) > 0 || (pollMean[id] ?? 0) >= 1).map((id) => {
    const values = finalPolls.map((p) => p.values[id]).filter((v): v is number => v !== undefined);
    return { id, name: listName(id), estimate: pollMean[id] ?? 0, min: Math.min(...values), max: Math.max(...values), actual: actual[id] ?? 0, n: values.length, values };
  });
  // דירוג אחד לכל הסקרים האחרונים ולמדגמי 22:00 — המקום היחיד של הדיוק לכל מכון (הכרעת בעלים 03.11.2026)
  const byPoll = [
    ...finalPolls.map((p) => ({ label: p.label, kind: "סקר אחרון", end: p.end, ...seatTags(p.values, actual, SIMPLE_BLOCS) })),
    ...exitPolls.map((p) => ({ label: p.publisherHe, kind: "מדגם 22:00", end: p.publishedAt, ...seatTags(Object.fromEntries(Object.entries(p.values).map(([id, v]) => [id, v.s])), actual, SIMPLE_BLOCS) })),
  ].sort((a, b) => b.seats - a.seats || b.exact - a.exact);
  return (
    <Card title="הסקרים מול התוצאות">
      {chips}
      <h3 className="text-xl font-display leading-tight mt-4 mb-1">2026 — הסקר האחרון של כל מכון מול התוצאות</h3>
      <p className="text-sm text-ink-soft mb-3">{finalPolls.length} מכונים</p>
      <DeviationChart rows={rows} />
      <table className="w-full text-sm mt-4">
        <caption className="sr-only">דירוג הסקרים האחרונים ומדגמי 22:00 לפי הדיוק</caption>
        <thead><tr className="text-right border-b border-paper-line"><th scope="col" className="py-1 pe-3">מכון ומזמין</th><th scope="col" className="pe-3">הסקר האחרון</th><th scope="col" className="pe-3">מנדטים מדויקים</th><th scope="col" className="pe-3">מפלגות מדויקות</th><th scope="col">טעות בגושים</th></tr></thead>
        <tbody>
          {byPoll.map((p) => (
            <tr key={p.kind + p.label} className="border-b border-paper-line">
              <th scope="row" className="py-1 pe-3 text-start font-medium">{p.label} <span className="block text-xs text-ink-soft font-normal">{p.kind}</span></th>
              <td className="pe-3 tabular-nums">{p.end.slice(8, 10)}/{Number(p.end.slice(5, 7))}</td>
              <td className="pe-3 tabular-nums">{p.seats}</td><td className="pe-3 tabular-nums"><bdi dir="ltr">{p.exact}/{p.of}</bdi></td><td className="tabular-nums">{p.blocErr}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

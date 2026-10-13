import { useMemo } from "react";
import historyFile from "../data/history.json";
import backtestFile from "../data/backtest.json";
import { results } from "../lib/data";
import { compareMethods } from "../lib/methodComparison";
import type { Cycle } from "../lib/history";
import { seatsFmt, date } from "../lib/format";
export default function MethodComparison() {
  const rows = useMemo(() => compareMethods(historyFile.cycles as unknown as Cycle[], results, backtestFile.rows), []);
  return <div className="mt-4">
    <h4 className="font-semibold">בדיקת שלוש השיטות מול בחירות קודמות</h4>
    <p className="text-sm">ממוצע הפער המוחלט במנדטים לכל רשימה. הבדיקה המותאמת ללא הסכמי עודפים, כי תאריכי פרסומם אינם מתועדים. אין כאן הבטחה לדיוק בבחירות הבאות.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm tabular mt-2"><thead><tr><th className="text-start">מערכת ותאריך</th><th>ממוצע סקרים</th><th>ממוצע מותאם</th><th>ממוצע המודל</th></tr></thead><tbody>{rows.map(r => <tr className="border-t border-paper-line" key={`${r.cycle}-${r.asOf}`}><td className="py-2">{r.label} · {date(r.asOf)}</td>{(["polls.mean", "polls.adjusted", "model.mean"] as const).map(id => <td key={id} className="text-center">{r.products[id].meanAbsoluteSeatError === null ? "—" : seatsFmt(r.products[id].meanAbsoluteSeatError)}</td>)}</tr>)}</tbody></table></div>
  </div>;
}

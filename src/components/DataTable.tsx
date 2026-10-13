import { listName } from "../lib/data";
import { seatsFmt } from "../lib/format";
import { resolveDataset, type Selection } from "../lib/dataResolver";
/** אותה שליפה נחשפת בטבלת המילון ובקובץ הנתונים הפתוח; ללא העדפה גלובלית. */
export default function DataTable({ selection }: { selection: Selection }) {
  const dataset = resolveDataset(selection);
  return <div className="mt-2">

    <table className="w-full text-sm tabular mt-2"><caption className="sr-only">{dataset.rows[0].label}</caption>
      <thead><tr><th className="text-start py-2">רשימה</th><th>מנדטים</th></tr></thead>
      <tbody>{dataset.rows.map(r => <tr key={r.subject.ids[0]} className="border-t border-paper-line" data-evidence={r.evidenceId}><td className="py-2">{listName(r.subject.ids[0])}</td><td className="text-center">{r.value === null ? "—" : seatsFmt(r.value)}</td></tr>)}</tbody>
    </table>
  </div>;
}

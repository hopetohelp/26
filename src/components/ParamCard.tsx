import { ARROW_DOWN, ARROW_UP, changeOf, type Change } from "../lib/changeMark";

/** שמות הפרמטרים (הכרעת בעלים 29.10.2026) — אותם שמות במסך ובתמונות השיתוף */
export const PARAM_NAMES = { votes: "מצביעים", ofEligible: "מזכות בחירה", ofValid: "מהכשרים", seats: "מנדטים" } as const;

/** שינוי: חץ ומספר בלי סימן, או כלום כשאין שינוי (src/lib/changeMark.ts) */
export function Delta({ change }: { change: Change | null }) {
  if (!change) return null;
  return <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${change.up ? "text-pos" : "text-neg"}`}>
    <span aria-hidden="true" className="text-[0.7em]">{change.up ? ARROW_UP : ARROW_DOWN}</span>
    <span className="sr-only">{change.up ? "עלייה של" : "ירידה של"}</span>
    <bdi dir="ltr">{change.text}</bdi>
  </span>;
}

export interface ParamRow { key: string; label: string; v22: number | null; v26: number | null; fmt: (n: number) => string; kind: "count" | "pct" }

/**
 * כרטיס פרמטרים: שם הפרמטר פעם אחת מימין, אחריו 2022, 2026 והפער (מודגש). אין נתון — "—"; אין שינוי — לא מוצג כלום.
 * מקור אחד לכרטיס המפלגה במסך "מה השתנה" ולכרטיסי העיר והקלפי.
 */
export default function ParamCard({ rows, caption, compact = false, className = "" }: { rows: ParamRow[]; caption: string; compact?: boolean; className?: string }) {
  const text = compact ? "text-[11px]" : "text-xs";
  return <div className={`rounded-theme border border-paper-line bg-paper-card shadow-sm overflow-hidden ${className}`}>
    <table className={`w-full table-fixed border-collapse tabular-nums ${text}`}>
      <caption className="sr-only">{caption}</caption>
      <colgroup><col className={compact ? "w-[27%]" : "w-[26%]"} /><col /><col /><col className="w-[26%]" /></colgroup>
      <thead><tr className="text-accent font-bold">
        <td className="p-1" /><th scope="col" className="p-1 font-bold">2022</th><th scope="col" className="p-1 font-bold">2026</th>
        <th scope="col" className="p-1 font-bold bg-accent text-paper-card">הפער</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => {
          const change = r.v22 !== null && r.v26 !== null ? changeOf(r.v26 - r.v22, r.kind) : null;
          const show = (v: number | null) => v === null ? <span aria-label="אין נתון">—</span> : <bdi dir="ltr">{r.fmt(v)}</bdi>;
          return <tr key={r.key} className="border-t border-dashed border-paper-line text-center">
            <th scope="row" className="p-1 text-start font-bold text-ink-soft leading-tight whitespace-nowrap">{r.label}</th>
            <td className="p-1 font-semibold">{show(r.v22)}</td>
            <td className="p-1 font-semibold">{show(r.v26)}</td>
            <td className="p-1 bg-accent-soft font-bold"><Delta change={change} /></td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

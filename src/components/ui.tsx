import { useState, type ReactNode } from "react";

export function PageTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl md:text-3xl font-extrabold">{children}</h1>
      {lead && <p className="mt-2 text-ink-soft max-w-3xl">{lead}</p>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-paper-card border border-paper-line rounded-xl p-4 md:p-5 mb-5 ${className}`}>
      {title && <h2 className="text-lg font-bold mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-soft mt-2">{children}</p>;
}

/** גרף + "הצג כטבלה": כל גרף זמין גם כטבלת נתונים (נגישות, העתקה, נייד) */
export function ChartWithTable({ chart, table, summary }: { chart: ReactNode; table: ReactNode; summary: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div>
      <p className="text-sm text-ink-soft mb-2">{summary}</p>
      <button
        type="button"
        onClick={() => setAsTable((v) => !v)}
        aria-pressed={asTable}
        className="text-sm border border-paper-line rounded px-2 py-1 mb-3 hover:border-ink-faint"
      >
        {asTable ? "הצגה כגרף" : "הצגה כטבלה"}
      </button>
      {asTable ? <div className="overflow-x-auto">{table}</div> : chart}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn"; children: ReactNode }) {
  const cls =
    tone === "ok" ? "bg-green-50 text-green-800 border-green-200" : tone === "warn" ? "bg-warn-soft text-warn border-orange-200" : "bg-paper text-ink-soft border-paper-line";
  return <span className={`inline-block text-xs border rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}

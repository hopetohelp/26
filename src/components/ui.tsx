import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function PageTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-5xl md:text-6xl leading-[0.95]">{children}</h1>
      {lead && <p className="mt-3 text-ink-soft max-w-3xl leading-relaxed">{lead}</p>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-paper-card border border-paper-line rounded-theme p-4 md:p-5 mb-5 ${className}`}>
      {title && <h2 className="font-display text-3xl leading-none mb-3">{title}</h2>}
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

/** כרטיס מקופל: תוכן משני שנפתח בלחיצה (מבנה האתר — שכבה ראשונה קצרה, עומק במרחק לחיצה) */
export function Fold({ title, children, open = false }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group bg-paper-card border border-paper-line rounded-theme mb-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-4 md:p-5 min-h-[56px]">
        <h2 className="font-display text-3xl leading-none">{title}</h2>
        <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-4 md:px-5 pb-4 md:pb-5">{children}</div>
    </details>
  );
}

/**
 * עיקרי ומשני — שני טורים במחשב, כמו תבנית 3ב של "קרובים מתמיד" (מדריך 31 §20 שם):
 * העיקרי (פקדים, בחירה, תקציר) בטור הצר מימין ועומד במקום; המשני (התוצאות) בטור הרחב ונגלל.
 * 🔴 הסדר בקוד הוא סדר הטלפון — בטלפון ובמסך צר שום דבר אינו משתנה.
 * 🔴 שני טורים רק כשהשורש רחב מ-SPLIT_AT **וגם** העיקרי נכנס כולו בגובה המסך; אחרת טור אחד.
 * ההחלטה "לא נכנס" נזכרת עד שמידות החלון משתנות — בטור אחד העיקרי רחב ונמוך יותר, ומדידה תמימה הייתה מקפצת.
 */
const SPLIT_AT = 1024;
export function Split({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const prim = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [tooTall, setTooTall] = useState<string | null>(null);
  const viewport = () => `${window.innerWidth}x${window.innerHeight}`;
  useLayoutEffect(() => {
    const check = () => {
      const w = (root.current?.clientWidth ?? 0) >= SPLIT_AT;
      setWide(w);
      if (tooTall && tooTall !== viewport()) setTooTall(null);
      if (w && !tooTall && prim.current && prim.current.scrollHeight > window.innerHeight - 32) setTooTall(viewport());
    };
    check();
    const ro = new ResizeObserver(check);
    if (root.current) ro.observe(root.current);
    if (prim.current) ro.observe(prim.current);
    window.addEventListener("resize", check);
    return () => (ro.disconnect(), window.removeEventListener("resize", check));
  }, [tooTall]);
  const split = wide && !tooTall;
  return (
    <div ref={root} data-split={split || undefined} className={split ? "grid grid-cols-[minmax(22rem,1fr)_2fr] gap-6 items-start [&>*]:min-w-0" : ""}>
      <div ref={prim} className={split ? "sticky top-4" : ""}>{primary}</div>
      <div>{secondary}</div>
    </div>
  );
}

/**
 * שני טורים שווים לרצף של כרטיסים עצמאיים — כמו `CardColumns` של קרובים מתמיד: מרוחב 1024 הכרטיסים
 * זורמים לטור הימני ואז לשמאלי, באותו סדר כמו בטלפון, והאורכים מתאזנים לבד. כרטיס אינו נחתך בין טורים.
 */
export function Columns({ children }: { children: ReactNode }) {
  return <div className="lg:columns-2 lg:gap-6 [&>*]:break-inside-avoid">{children}</div>;
}

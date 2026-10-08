import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** inColumns: בתוך `Columns` — מהמחשב הכותרת לקורא מסך בלבד (היא כבר בלשונית הפעילה בסרגל), וההסבר בראש הטור הימני */
export function PageTitle({ children, lead, inColumns = false }: { children: ReactNode; lead?: ReactNode; inColumns?: boolean }) {
  return (
    <div className="mb-6">
      <h1 className={`font-display text-5xl md:text-6xl leading-[0.95] ${inColumns ? "lg:sr-only" : ""}`}>{children}</h1>
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
 * העיקרי (ההסבר, פקדים, בחירה) בטור הצר מימין; המשני (התוצאות) בטור הרחב. פס דק מפריד ביניהם.
 * 🔴 שני הטורים בכל גובה המסך, ולכל אחד גלילה משלו (הכרעת בעלים 8.10.2026). כותרת העמוד אינה
 *    מוצגת — היא כבר בלשונית הפעילה בסרגל הניווט — ונשארת לקורא מסך; ההסבר עובר לראש הטור הצר.
 * 🔴 העדיפות: הטור הצר בלי גלילה. שני טורים רק כשהשורש רחב מ-SPLIT_AT **וגם** הטור הצר נכנס כולו
 *    בגובה; אחרת טור אחד, כמו בטלפון. ההחלטה מתקבלת בטעינה ומחדש רק כשמידות החלון משתנות —
 *    לא כשלחיצה בטור הצר משנה את גובהו, כדי שהמסך לא יקפוץ פתאום מטורים לטור אחד.
 * 🔴 הסדר בקוד הוא סדר הטלפון — בטלפון ובמסך צר שום דבר אינו משתנה.
 */
const SPLIT_AT = 1024;
const SETTLE_MS = 2000;
export function Split({ primary, secondary, title, lead }: { primary: ReactNode; secondary: ReactNode; title?: ReactNode; lead?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const prim = useRef<HTMLDivElement>(null);
  // ניסיון: קודם מציגים בשני טורים ומודדים את הטור הצר בצורה האמיתית. נכנס ⇐ נשאר; לא נכנס ⇐ טור אחד.
  // מודדים אחרי שהגופנים נטענו ושוב אחרי SETTLE_MS (נתונים שנטענים), ואחר כך ההחלטה קפואה עד שינוי חלון.
  const [state, setState] = useState<{ split: boolean; top: number }>({ split: false, top: 0 });
  useLayoutEffect(() => {
    let timers: number[] = [];
    const measure = () => {
      if (!root.current?.dataset.split || !prim.current) return;
      if (prim.current.scrollHeight > prim.current.clientHeight + 1) setState((s) => ({ ...s, split: false }));
    };
    const start = () => {
      if (!root.current) return;
      timers.forEach(clearTimeout);
      const top = root.current.getBoundingClientRect().top + window.scrollY;
      setState({ split: root.current.clientWidth >= SPLIT_AT, top });
      document.fonts.ready.then(() => timers.push(window.setTimeout(measure, 50)));
      timers.push(window.setTimeout(measure, SETTLE_MS));
    };
    start();
    let last = `${window.innerWidth}x${window.innerHeight}`;
    const resize = () => {
      const at = `${window.innerWidth}x${window.innerHeight}`;
      if (at !== last) { last = at; start(); }
    };
    window.addEventListener("resize", resize);
    return () => (timers.forEach(clearTimeout), window.removeEventListener("resize", resize));
  }, []);
  const { split } = state;
  // הגובה נמדד מחדש בצורה המפוצלת: בטור אחד הכותרת יושבת מעל, ומיקום הטורים שונה
  useLayoutEffect(() => {
    if (!split || !root.current) return;
    const top = root.current.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(top - state.top) > 1) setState((s) => ({ ...s, top }));
  }, [split, state.top]);
  const hasHead = title !== undefined;
  return (
    <>
      {hasHead && !split && <PageTitle lead={lead}>{title}</PageTitle>}
      {hasHead && split && <h1 className="sr-only">{title}</h1>}
      <div
        ref={root}
        data-split={split || undefined}
        style={split ? { height: `calc(100dvh - ${state.top}px)` } : undefined}
        className={split ? "grid grid-cols-[minmax(22rem,1fr)_2fr] [&>*]:min-w-0" : ""}
      >
        <div ref={prim} className={split ? "overflow-y-auto pe-6 border-e border-paper-line" : ""}>
          {hasHead && split && lead && <p className="text-ink-soft leading-relaxed mb-5">{lead}</p>}
          {primary}
        </div>
        <div className={split ? "overflow-y-auto ps-6" : ""}>{secondary}</div>
      </div>
    </>
  );
}

/**
 * שני טורים שווים לרצף של כרטיסים עצמאיים — כמו `CardColumns` של קרובים מתמיד: מרוחב 1024 הכרטיסים
 * זורמים לטור הימני ואז לשמאלי, באותו סדר כמו בטלפון, והאורכים מתאזנים לבד. כרטיס אינו נחתך בין טורים.
 */
export function Columns({ children }: { children: ReactNode }) {
  return <div className="lg:columns-2 lg:gap-6 [&>*]:break-inside-avoid">{children}</div>;
}

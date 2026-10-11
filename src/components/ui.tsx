import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTabsSlot } from "./Tabbed";
import ChartLegend, { BAR, BarSlots, PILL, PILL_ON, PILL_RING, type LegendEntry } from "./ChartLegend";

/** inColumns: בתוך `Columns` — מהמחשב הכותרת לקורא מסך בלבד (היא כבר בלשונית הפעילה בסרגל), וההסבר בראש הטור הימני */
export function PageTitle({ children, lead, inColumns = false }: { children: ReactNode; lead?: ReactNode; inColumns?: boolean }) {
  return (
    <div className="mb-6">
      <h1 className={`font-display text-3xl md:text-5xl leading-[1.05] ${inColumns ? "lg:sr-only" : ""}`}>{children}</h1>
      {lead && <p className="mt-3 text-ink-soft max-w-3xl leading-relaxed">{lead}</p>}
    </div>
  );
}

/**
 * שלוש רמות (הכרעת בעלים 9.10.2026): משטח (ברירת המחדל, קו דק בלי קופסה), כרטיס (`boxed`: מסגרת, ליחידה
 * שאפשר לשתף או לפעול עליה, כמו טופס), ופאנל (כהה, פעולה ראשית אחת במסך). כותרת 20px. אין קופסה בתוך קופסה.
 */
export function Card({ title, children, className = "", boxed = false }: { title?: ReactNode; children: ReactNode; className?: string; boxed?: boolean }) {
  return (
    <section className={`${boxed ? "bg-paper-card [--mk-bg:var(--card)] border border-paper-line rounded-theme p-4 md:p-5 mb-5" : "border-t border-paper-line pt-4 mt-8 first:mt-0"} ${className}`}>
      {title && <h2 className="text-xl font-display leading-tight mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-soft mt-2">{children}</p>;
}

/** כפתור "הצגה כטבלה" / "הצגה כגרף": באותו עיצוב כמו כפתור "מקרא" (ChartLegend), כדי שהשורה תהיה אחידה בכל האתר */
export function TableToggle({ asTable, onChange }: { asTable: boolean; onChange: (asTable: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!asTable)} aria-pressed={asTable} className={`${PILL} ${asTable ? PILL_ON : PILL_RING}`}>
      {asTable ? "הצגה כגרף" : "הצגה כטבלה"}
    </button>
  );
}

/**
 * גרף + "הצגה כטבלה": כל גרף זמין גם כטבלת נתונים (נגישות, העתקה, נייד).
 * שורת בקרה אחת ממורכזת מעל הגרף (הכרעת בעלים 11.10.2026): "מקרא" של הגרף, פקד הגרף (קו/נרות, אם יש) ו"הצגה כטבלה" — באותה שורה ובאותו עיצוב.
 * `asTable` נשלט מבחוץ: מסך שיש בו כמה גרפים מחזיק מתג אחד (`ChartBar`) שמשפיע על כולם, ואז כאן אין שורת בקרה.
 */
export function ChartWithTable({ chart, table, summary, asTable }: { chart: ReactNode; table: ReactNode; summary?: string; asTable?: boolean }) {
  const [own, setOwn] = useState(false);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const controlled = asTable !== undefined;
  const showTable = controlled ? asTable : own;
  const slots = useMemo(() => ({ row, panel }), [row, panel]);
  return (
    <div>
      {!controlled && (
        <>
          <div className={`${BAR} mb-2`}>
            <span ref={setRow} className="contents" />
            <TableToggle asTable={own} onChange={setOwn} />
          </div>
          <div ref={setPanel} />
        </>
      )}
      {summary && <p className="text-sm text-ink-soft mb-2">{summary}</p>}
      <BarSlots.Provider value={controlled ? null : slots}>
        {showTable ? <div className="overflow-x-auto">{table}</div> : chart}
      </BarSlots.Provider>
    </div>
  );
}

/**
 * שורת בקרה אחת למסך שלם (הכרעת בעלים 11.10.2026): "מקרא" אחד, פקד יחידות (אחוזים/מנדטים) ו"הצגה כטבלה" — שניהם משפיעים על כל הגרפים והטבלאות במסך.
 * בתצוגת טבלה אין סימונים להסביר, ולכן "מקרא" לא מוצג.
 */
export function ChartBar({ legend, asTable, onAsTable, children }: { legend: LegendEntry[]; asTable: boolean; onAsTable: (asTable: boolean) => void; children?: ReactNode }) {
  const toggle = <TableToggle asTable={asTable} onChange={onAsTable} />;
  return asTable ? (
    <div className={`${BAR} my-1`}>{children}{toggle}</div>
  ) : (
    <ChartLegend entries={legend} action={<>{children}{toggle}</>} />
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn"; children: ReactNode }) {
  const cls =
    tone === "ok" ? "bg-accent-soft text-accent border-accent/30" : tone === "warn" ? "bg-warn-soft text-warn border-warn/30" : "bg-paper text-ink-soft border-paper-line";
  return <span className={`inline-block text-xs border rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}

/** שורת קיפול: קווים עליון ותחתון (בלי קופסה), כותרת 16px. קיפולים רצופים חולקים קו אחד. */
export function Fold({ title, children, open = false }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-y border-paper-line mt-8 [&+&]:mt-0 [&+&]:border-t-0 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 py-3 min-h-[56px]">
        <h2 className="text-base font-bold leading-tight">{title}</h2>
        <span aria-hidden="true" className="text-ink-soft text-xl transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/**
 * עיקרי ומשני — שני טורים במחשב, כמו תבנית 3ב של "קרובים מתמיד" (מדריך 31 §20 שם):
 * העיקרי (ההסבר, פקדים, בחירה) בטור הצר מימין; המשני (התוצאות) בטור הרחב. פס דק מפריד ביניהם.
 * 🔴 גלילה אחת בלבד במסך (הכרעת בעלים 8.10.2026): שני הטורים ממלאים את הגובה שמתחת לסרגל העליון,
 *    הקו המפריד לכל הגובה, ורק הטור הרחב נגלל. כותרת העמוד אינה מוצגת — היא כבר בלשונית הפעילה
 *    בסרגל הניווט — ונשארת לקורא מסך; שורת הלשוניות של המסך (Tabbed) וההסבר — בראש הטור הצר.
 * 🔴 בטור הצר רק מה שנכנס בלי גלילה. שני טורים רק כשהשורש רחב מ-SPLIT_AT **וגם** הטור הצר נכנס כולו
 *    בגובה; אחרת — וגם כשתוכן הטור הצר גדל אחר כך מעבר לגובה — טור אחד, כמו בטלפון, עם גלילת העמוד.
 * 🔴 הסדר בקוד הוא סדר הטלפון — בטלפון ובמסך צר שום דבר אינו משתנה.
 */
const SPLIT_AT = 1024;
/** true כשהמסך מוצג בשני טורים (מחשב). כרטיס הגושים נפתח אז מעצמו (הכרעת בעלים 11.10.2026) */
const SplitOn = createContext(false);
export const useSplitOn = () => useContext(SplitOn);
const SETTLE_MS = 2000;
/** secondaryFirst: בטור אחד (טלפון) הטור הרחב קודם — למשל שיחת התמיכה לפני הנתונים שלי */
export function Split({ primary, secondary, title, lead, secondaryFirst = false }: { primary: ReactNode; secondary: ReactNode; title?: ReactNode; lead?: ReactNode; secondaryFirst?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const prim = useRef<HTMLDivElement>(null);
  const tabs = useTabsSlot();
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
    // תוכן הטור הצר גדל (פתיחת פירוט, נתונים שנטענו) ⇐ אם כבר לא נכנס — טור אחד
    const grow = new ResizeObserver(measure);
    if (prim.current?.firstElementChild) grow.observe(prim.current.firstElementChild);
    return () => (timers.forEach(clearTimeout), window.removeEventListener("resize", resize), grow.disconnect());
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
    <SplitOn.Provider value={split}>
      {!split && tabs}
      {hasHead && !split && <PageTitle lead={lead}>{title}</PageTitle>}
      {hasHead && split && <h1 className="sr-only">{title}</h1>}
      <div
        ref={root}
        data-split={split || undefined}
        style={split ? { height: `calc(100dvh - ${state.top}px)` } : undefined}
        // ‎-mt-6 -mb-24: מבטלים את הריווח של <main> (py-6 md:pb-24 ב-Layout), כדי שהטורים והקו ימלאו את כל הגובה בלי גלילת עמוד
        className={split ? "-mt-6 -mb-24 grid grid-cols-[minmax(22rem,1fr)_2fr] [&>*]:min-w-0" : secondaryFirst ? "flex flex-col [&>*:last-child]:order-first [&>*:last-child]:mb-8" : ""}
      >
        <div ref={prim} className={split ? "relative overflow-hidden pt-6 pe-6 border-e border-paper-line" : ""}>
          <div>
            {split && tabs}
            {hasHead && split && lead && <p className="text-ink-soft leading-relaxed mb-5">{lead}</p>}
            {primary}
          </div>
        </div>
        {/* pb-24: הכפתור הצף "לבנות את הכנסת שלי" לא מסתיר את סוף הטור */}
        <div className={split ? "relative overflow-y-auto pt-6 ps-6 pb-24" : ""}>{secondary}</div>
      </div>
    </SplitOn.Provider>
  );
}

/**
 * שני טורים שווים לרצף של כרטיסים עצמאיים — כמו `CardColumns` של קרובים מתמיד: מרוחב 1024 הכרטיסים
 * זורמים לטור הימני ואז לשמאלי, באותו סדר כמו בטלפון, והאורכים מתאזנים לבד. כרטיס אינו נחתך בין טורים.
 */
export function Columns({ children }: { children: ReactNode }) {
  return <div className="lg:columns-2 lg:gap-6 [&>*]:break-inside-avoid">{children}</div>;
}

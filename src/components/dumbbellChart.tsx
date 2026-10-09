import { change, diffText, dumbbellAxis, r1, type DumbbellRow } from "../lib/dumbbell";

/**
 * "מה השתנה" (החלטה 8, 9.10.2026): לכל משפחה, טבעת = 2022 (תוצאה רשמית), נקודה = היום (ממוצע הסקרים), קו ביניהן,
 * ורקע דק = טווח 80% מהתרחישים. כיוון השינוי מסומן במיקום ובסימן בלבד — בלי צבע לעלייה ובלי צבע לירידה (ניטרליות).
 * הציר משמאל לימין, 0 משמאל, כמו בשאר הגרפים; הצורה (טבעת מול נקודה) נושאת את ההבחנה, לא הצבע.
 */
const COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem]";

function Row({ r, max, ticks }: { r: DumbbellRow; max: number; ticks: number[] }) {
  const x = (v: number) => (Math.min(v, max) / max) * 100;
  const d = change(r);
  const lo = Math.min(r.before, r.now);
  const hi = Math.max(r.before, r.now);
  return (
    <li className={`grid ${COLS} items-center gap-x-3 gap-y-1 py-2.5 border-t border-paper-line last:border-b`}>
      <span className="col-start-1 row-start-1 font-semibold leading-tight">{r.name}</span>
      <span className="col-start-2 row-start-1 md:col-start-3 md:row-span-2 flex items-baseline gap-1 md:block md:text-end md:leading-none">
        <b className="block font-num font-extrabold tabular text-lg"><bdi dir="ltr">{diffText(d)}</bdi></b>
        <span className="block text-xs text-ink-soft md:mt-0.5">נק'</span>
      </span>
      <span aria-hidden="true" dir="ltr" className="relative block h-7 col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-span-2">
        {ticks.map((v) => (
          <span key={v} className={`absolute inset-y-0 ${v === 0 ? "w-0.5 bg-ink-faint" : "w-px bg-paper-line"}`} style={{ left: `${x(v)}%` }} />
        ))}
        {r.range && (
          <span className="absolute top-1/2 h-[.45rem] -mt-[.225rem] rounded-full bg-accent/30" style={{ left: `${x(r.range[0])}%`, width: `${Math.max(x(r.range[1]) - x(r.range[0]), 1)}%` }} />
        )}
        <span className="absolute top-1/2 h-0.5 -mt-px bg-ink" style={{ left: `${x(lo)}%`, width: `${x(hi) - x(lo)}%` }} />
        <span className="absolute top-1/2 size-[1.1rem] -mt-[.55rem] -ml-[.55rem] rounded-full border-2 border-ink bg-paper" style={{ left: `${x(r.before)}%` }} />
        <span className="absolute top-1/2 size-[.7rem] -mt-[.35rem] -ml-[.35rem] rounded-full bg-accent" style={{ left: `${x(r.now)}%` }} />
      </span>
      <span className="col-span-2 row-start-3 md:col-span-1 md:col-start-1 md:row-start-2 text-sm text-ink-soft leading-snug">
        <span className="whitespace-nowrap">2022: <b className="font-num tabular text-ink">{r1(r.before)}%</b></span>
        {" · "}
        <span className="whitespace-nowrap">היום: <b className="font-num tabular text-ink">{r1(r.now)}%</b></span>
        <span className="block text-xs">ב-2022: {r.from}</span>
      </span>
      <span className="sr-only">
        ; 2022: {r1(r.before)}% מהקולות הכשרים, היום {r1(r.now)}% לפי הממוצע{r.range ? `, ובין ${r1(r.range[0])}% ל-${r1(r.range[1])}% ב-80% מהתרחישים` : ""}. שינוי נטו: {diffText(d)} נקודות אחוז
      </span>
    </li>
  );
}

export default function DumbbellChart({ rows }: { rows: DumbbellRow[] }) {
  const { max, ticks } = dumbbellAxis(rows);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft my-1">
        <span className="inline-flex items-center gap-2"><i className="size-[1rem] rounded-full border-2 border-ink bg-paper" />2022, תוצאות רשמיות</span>
        <span className="inline-flex items-center gap-2"><i className="size-[.7rem] rounded-full bg-accent" />היום, ממוצע הסקרים</span>
        <span className="inline-flex items-center gap-2"><i className="w-[1.4rem] h-[.4rem] rounded-full bg-accent/30" />טווח 80% מהתרחישים</span>
      </div>
      <div aria-hidden="true" className="md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem] gap-x-3 text-xs text-ink-soft mt-1.5">
        <div dir="ltr" className="md:col-start-2 relative h-5">
          {ticks.map((v) => (
            <span key={v} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${(v / max) * 100}%` }}>{v === 0 ? "0" : `${v}%`}</span>
          ))}
        </div>
      </div>
      <ul aria-label="משפחות הרשימות, 2022 מול היום">
        {rows.map((r) => <Row key={r.id} r={r} max={max} ticks={ticks} />)}
      </ul>
      <p className="text-xs text-ink-soft mt-2">הציר: אחוז מהקולות הכשרים. הטווח, כשהוא מוצג, הוא 80% מהתרחישים שהמודל מריץ ליום הבחירות.</p>
    </div>
  );
}

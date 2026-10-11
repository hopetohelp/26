import type { ReactNode } from "react";
import { candleProfiles, type LSeg } from "../lib/chartLanguage";
import { change, diffText, dumbbellAxis, dumbbellSegs, r1, type DumbbellRow, type DumbbellUnit } from "../lib/dumbbell";
import { seatsFmt, signed } from "../lib/format";
import ChartLegend, { rangeLine, type LegendEntry } from "./ChartLegend";
import { MeanDot, ProfileCandle, ResultRing } from "./marks";

/**
 * "מה השתנה" (החלטה 8, 9.10.2026) בשפת הציור האחידה: לכל משפחה, עיגול ריק שחור = 2022 (תוצאה רשמית), עיגול מלא כתום = היום (ממוצע המודל),
 * ונר כחול = טווח 80% מהתרחישים (מ-10% עד 90%), שעוביו משתנה לאורכו לפי כמה תרחישים נותנים כל אחוז (ביחס לשאר אותו נר). בלי קו בין העיגולים:
 * המרחק ביניהם ברור (הכרעת בעלים 9.10.2026). הנר מבוסס על תרחישים, ולכן הטווח הוא 80% (כלל הטווחים לפי מקור הנתון, `src/lib/home.ts`).
 * כיוון השינוי מסומן במיקום ובסימן בלבד — בלי צבע לעלייה ובלי צבע לירידה (ניטרליות). הציר משמאל לימין, 0 משמאל, כמו בשאר הגרפים.
 */
/** המקרא של הגרף: זהה באחוזים ובמנדטים. מסך שמציג כמה גרפים כאלה מציג אותו פעם אחת (`ChartBar`) ומעביר `legend={false}` */
export const DUMBBELL_LEGEND: LegendEntry[] = [
  { kind: "result", text: "2022, התוצאות הרשמיות" },
  { kind: "mean", text: "היום, ממוצע המודל" },
  { kind: "candle", text: rangeLine("p80", "התרחישים") },
];

const COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem]";

const Chevron = ({ open }: { open: boolean }) => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** שם מפלגה ככפתור: פותח את עריכת השיוך שלה מתחת לשורה (הכרעת בעלים 11.10.2026). בלי פעולה — טקסט רגיל. */
export function NameButton({ id, name, open, onToggle }: { id: string; name: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={`lineage-${id}`}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border text-sm font-bold leading-tight text-start ${open ? "bg-ink text-paper-card border-ink" : "border-paper-line hover:border-ink-faint"}`}
    >
      <span className="break-words min-w-0">{name}</span>
      <Chevron open={open} />
    </button>
  );
}

function Row({ r, min, max, ticks, lsegs, unit, open, onName, below }: { r: DumbbellRow; min: number; max: number; ticks: number[]; lsegs: LSeg[]; unit: DumbbellUnit; open: boolean; onName?: () => void; below?: ReactNode }) {
  const x = (v: number) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100;
  const d = change(r);
  const pct = unit === "pct";
  const fmt = (v: number) => (pct ? `${r1(v)}%` : seatsFmt(Math.round(v * 10) / 10));
  const sign = pct ? diffText : signed;
  const before = `${r.approx ? "~" : ""}${fmt(r.before)}`;
  return (
    <li className={`grid ${COLS} items-center gap-x-3 gap-y-1 py-2.5 border-t border-paper-line last:border-b`}>
      <span className="col-start-1 row-start-1 font-semibold leading-tight justify-self-start">
        {onName ? <NameButton id={r.id} name={r.name} open={open} onToggle={onName} /> : r.name}
      </span>
      <span className="col-start-2 row-start-1 md:col-start-3 md:row-span-2 flex items-baseline gap-1 md:block md:text-end md:leading-none">
        <b className="block font-num font-extrabold tabular text-lg"><bdi dir="ltr">{sign(d)}</bdi></b>
        <span className="block text-xs text-ink-soft md:mt-0.5">{pct ? "נק'" : "מנד'"}</span>
      </span>
      <span aria-hidden="true" dir="ltr" className="relative block h-8 col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-span-2">
        <span className="mk-plot">
          {ticks.map((v) => (
            <span key={v} className={`absolute inset-y-0 ${v === 0 ? "w-0.5 bg-ink-faint" : "w-px bg-paper-line"}`} style={{ left: `${x(v)}%` }} />
          ))}
          {lsegs.length > 0 && <ProfileCandle segs={lsegs} x={x} />}
          <ResultRing at={x(r.before)} />
          <MeanDot at={x(r.now)} />
        </span>
      </span>
      <span className="col-span-2 row-start-3 md:col-span-1 md:col-start-1 md:row-start-2 text-sm text-ink-soft leading-snug">
        <span className="whitespace-nowrap">2022: <b className="font-num tabular text-ink">{before}</b></span>
        {" · "}
        <span className="whitespace-nowrap">היום: <b className="font-num tabular text-ink">{fmt(r.now)}</b></span>
        <span className="block text-xs">ב-2022: {r.from}</span>
      </span>
      <span className="sr-only">
        {pct
          ? `; 2022: ${before} מהקולות הכשרים, היום ${fmt(r.now)} לפי הממוצע${r.range ? `, ובין ${fmt(r.range[0])} ל-${fmt(r.range[1])} ב-80% מהתרחישים` : ""}. שינוי נטו: ${sign(d)} נקודות אחוז`
          : `; 2022: ${before} מנדטים, היום ${fmt(r.now)} לפי הממוצע${r.range ? `, ובין ${fmt(r.range[0])} ל-${fmt(r.range[1])} ב-80% מהתרחישים` : ""}. שינוי נטו: ${sign(d)} מנדטים`}
      </span>
      {open && below && <div className="col-span-full row-start-4">{below}</div>}
    </li>
  );
}

/**
 * `legend={false}`: המקרא מוצג במקום אחר (שורת הבקרה של המסך). `onName` — שם הרשימה ככפתור; `openId` — מי פתוחה, ו-`below` — מה נפתח מתחת לשורה שלה.
 */
export default function DumbbellChart({ rows, unit = "pct", legend = true, onName, openId = null, below }: { rows: DumbbellRow[]; unit?: DumbbellUnit; legend?: boolean; onName?: (id: string) => void; openId?: string | null; below?: (id: string) => ReactNode }) {
  const { min, max, ticks } = dumbbellAxis(rows, unit);
  const levels = candleProfiles(rows.map(dumbbellSegs));
  return (
    <div>
      {legend && <ChartLegend entries={DUMBBELL_LEGEND} />}
      <div aria-hidden="true" className="md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem] gap-x-3 text-xs text-ink-soft mt-1.5">
        <div dir="ltr" className="md:col-start-2 relative h-5">
          <span className="mk-plot">
            {ticks.map((v) => (
              <span key={v} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${((v - min) / (max - min)) * 100}%` }}>{v === 0 || unit === "seats" ? v : `${v}%`}</span>
            ))}
          </span>
        </div>
      </div>
      <ul aria-label="משפחות הרשימות, 2022 מול היום">
        {rows.map((r, i) => <Row key={r.id} r={r} min={min} max={max} ticks={ticks} lsegs={levels[i]} unit={unit} open={openId === r.id} onName={onName ? () => onName(r.id) : undefined} below={below?.(r.id)} />)}
      </ul>
    </div>
  );
}

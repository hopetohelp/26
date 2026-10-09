import { binSegs, levelSegs, type LSeg } from "../lib/chartLanguage";
import { change, diffText, dumbbellAxis, histBounds, r1, type DumbbellRow } from "../lib/dumbbell";
import { KeyItem, MeanDot, ProfileCandle, ResultRing, ThicknessKey } from "./marks";

/**
 * "מה השתנה" (החלטה 8, 9.10.2026) בשפת הציור האחידה: לכל משפחה, עיגול גדול ריק כתום = 2022 (תוצאה רשמית), עיגול מלא אדום = היום (ממוצע המודל),
 * ונר כחול = הטווח המלא של כל התרחישים, שעוביו משתנה לאורכו לפי כמה תרחישים נותנים כל אחוז (ביחס לשאר הגרף). בלי קו בין העיגולים:
 * המרחק ביניהם ברור (הכרעת בעלים 9.10.2026). הטווח המלא בכל מקום חוץ ממסך "תחזית ותרחישים".
 * כיוון השינוי מסומן במיקום ובסימן בלבד — בלי צבע לעלייה ובלי צבע לירידה (ניטרליות). הציר משמאל לימין, 0 משמאל, כמו בשאר הגרפים.
 */
const COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem]";

function Row({ r, max, ticks, lsegs }: { r: DumbbellRow; max: number; ticks: number[]; lsegs: LSeg[] }) {
  const x = (v: number) => (Math.min(v, max) / max) * 100;
  const d = change(r);
  return (
    <li className={`grid ${COLS} items-center gap-x-3 gap-y-1 py-2.5 border-t border-paper-line last:border-b`}>
      <span className="col-start-1 row-start-1 font-semibold leading-tight">{r.name}</span>
      <span className="col-start-2 row-start-1 md:col-start-3 md:row-span-2 flex items-baseline gap-1 md:block md:text-end md:leading-none">
        <b className="block font-num font-extrabold tabular text-lg"><bdi dir="ltr">{diffText(d)}</bdi></b>
        <span className="block text-xs text-ink-soft md:mt-0.5">נק'</span>
      </span>
      <span aria-hidden="true" dir="ltr" className="relative block h-8 col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-span-2">
        {ticks.map((v) => (
          <span key={v} className={`absolute inset-y-0 ${v === 0 ? "w-0.5 bg-ink-faint" : "w-px bg-paper-line"}`} style={{ left: `${x(v)}%` }} />
        ))}
        {lsegs.length > 0 && <ProfileCandle segs={lsegs} x={x} />}
        <ResultRing at={x(r.before)} />
        <MeanDot at={x(r.now)} />
      </span>
      <span className="col-span-2 row-start-3 md:col-span-1 md:col-start-1 md:row-start-2 text-sm text-ink-soft leading-snug">
        <span className="whitespace-nowrap">2022: <b className="font-num tabular text-ink">{r1(r.before)}%</b></span>
        {" · "}
        <span className="whitespace-nowrap">היום: <b className="font-num tabular text-ink">{r1(r.now)}%</b></span>
        <span className="block text-xs">ב-2022: {r.from}</span>
      </span>
      <span className="sr-only">
        ; 2022: {r1(r.before)}% מהקולות הכשרים, היום {r1(r.now)}% לפי הממוצע{r.hist ? `, ובין ${r1(histBounds(r.hist)[0])}% ל-${r1(histBounds(r.hist)[1])}% בכל התרחישים` : ""}. שינוי נטו: {diffText(d)} נקודות אחוז
      </span>
    </li>
  );
}

export default function DumbbellChart({ rows }: { rows: DumbbellRow[] }) {
  const { max, ticks } = dumbbellAxis(rows);
  const levels = levelSegs(rows.map((r) => (r.hist ? binSegs(r.hist.start, r.hist.step, r.hist.counts) : [])));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft my-1">
        <KeyItem kind="result">2022, תוצאות רשמיות</KeyItem>
        <KeyItem kind="mean">היום, ממוצע המודל</KeyItem>
        <KeyItem kind="candle">טווח מלא: הנמוך והגבוה מכל התרחישים</KeyItem>
        <ThicknessKey what="כמה תרחישים נותנים כל אחוז" />
      </div>
      <div aria-hidden="true" className="md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem] gap-x-3 text-xs text-ink-soft mt-1.5">
        <div dir="ltr" className="md:col-start-2 relative h-5">
          {ticks.map((v) => (
            <span key={v} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${(v / max) * 100}%` }}>{v === 0 ? "0" : `${v}%`}</span>
          ))}
        </div>
      </div>
      <ul aria-label="משפחות הרשימות, 2022 מול היום">
        {rows.map((r, i) => <Row key={r.id} r={r} max={max} ticks={ticks} lsegs={levels[i]} />)}
      </ul>
      <p className="text-xs text-ink-soft mt-2">הציר: אחוז מהקולות הכשרים. הנר, כשהוא מוצג, הוא הטווח המלא של התרחישים שהמודל מריץ ליום הבחירות (הנמוך והגבוה), ועוביו לפי כמה תרחישים נותנים כל אחוז.</p>
    </div>
  );
}

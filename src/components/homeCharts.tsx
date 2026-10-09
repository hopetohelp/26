import { hemicycleSeats } from "../lib/hemicycle";
import { rng } from "../lib/format";
import { dayMonth, type HomeData, type HomeRow } from "../lib/home";

/** שורת טווח: הממוצע (נקודה) והטווח (פס). `pass` רק לרשימות על הסף */
export type RangeRowData = Pick<HomeRow, "id" | "name" | "central" | "lo" | "hi"> & { pass?: number };

/**
 * גרפי הבית (הכרעת בעלים 9.10.2026): לוח 120 המושבים בשני גוונים, דירוג הרשימות עם טווח 80%, ומגמת הממשלה היוצאת.
 * הכול בטוקנים בלבד (accent, ink, paper, line), בלי צבעי מפלגות. כל גרף מקבל מנדטים ממספר אחד: `buildHome` ב-`src/lib/home.ts`.
 */
const W = 2.2;
const H = 1.32;
const CX = 1.1;
const CY = 1.26;
const SEATS = hemicycleSeats(CX, CY);
export const MAJORITY = 61;

/** 120 מושבים בחצי עיגול: הממשלה היוצאת (מלא) מול כל השאר (מסגרת), וקו המושב ה-61 */
export function Hemicycle({ gov, other }: { gov: number; other: number }) {
  const t = (SEATS[MAJORITY - 1].a + SEATS[MAJORITY].a) / 2;
  const at = (r: number) => ({ x: CX + r * Math.cos(t), y: CY - r * Math.sin(t) });
  const a = at(1.045);
  const b = at(1.14);
  const label = at(1.22);
  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        role="img"
        aria-label={`120 המושבים בחצי עיגול: ${gov} למפלגות הממשלה היוצאת; ${other} לשאר הרשימות. הקו מסמן את המושב ה-${MAJORITY}, הרוב.`}
      >
        {SEATS.map((s, k) => (
          <circle key={k} cx={s.x} cy={s.y} r={0.038} className={`${k < gov ? "seat-a" : "seat-b"} seat-in`} style={{ animationDelay: `${k * 5}ms` }} />
        ))}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-ink" strokeWidth={0.012} />
      </svg>
      <span
        aria-hidden="true"
        className="absolute -translate-x-1/2 -translate-y-1/2 font-extrabold text-base leading-none"
        style={{ left: `${(label.x / W) * 100}%`, top: `${(label.y / H) * 100}%` }}
      >
        {MAJORITY}
      </span>
      <span
        aria-hidden="true"
        className="absolute -translate-x-1/2 -translate-y-1/2 text-sm leading-none text-ink-soft"
        style={{ left: "50%", top: `${((CY - 0.06) / H) * 100}%` }}
      >
        120 מושבים
      </span>
    </figure>
  );
}

const COLS = "grid-cols-[minmax(0,1fr)_2.1rem_minmax(5.5rem,38%)] md:grid-cols-[minmax(0,13rem)_2.6rem_minmax(0,1fr)_5rem]";

function Dots({ pass }: { pass: number }) {
  const k = Math.round(pass * 10);
  return (
    <span aria-hidden="true" className="inline-flex gap-[.22rem]">
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={`w-[.62rem] h-[.62rem] rounded-full ${i < k ? "bg-accent" : "shadow-[inset_0_0_0_1.5px_rgb(var(--ink-faint))]"}`} />
      ))}
    </span>
  );
}

function RankRow({ r, axisMax, withDots }: { r: RangeRowData; axisMax: number; withDots?: boolean }) {
  const left = (r.lo / axisMax) * 100;
  const width = Math.max(((r.hi - r.lo) / axisMax) * 100, 0.8);
  return (
    <li className={`grid ${COLS} items-center gap-x-3 min-h-12 py-1.5 border-t border-paper-line last:border-b`}>
      <span className="font-semibold leading-tight">{r.name}</span>
      <span className="font-num text-xl font-extrabold tabular">{r.central}</span>
      <span
        aria-hidden="true"
        dir="ltr"
        className="relative block h-5"
        style={{ backgroundImage: "linear-gradient(to right, rgb(var(--line)) 1px, transparent 1px)", backgroundSize: `${(1000 / axisMax)}% 100%`, backgroundRepeat: "repeat-x" }}
      >
        <span className="absolute top-1/2 h-[.3rem] -mt-[.15rem] rounded-full bg-accent/70" style={{ left: `${left}%`, width: `${width}%` }} />
        <span
          className="absolute top-1/2 size-[.8rem] -mt-[.4rem] -ml-[.4rem] rounded-full bg-ink shadow-[0_0_0_2px_rgb(var(--paper))]"
          style={{ left: `${(r.central / axisMax) * 100}%` }}
        />
      </span>
      <span className="hidden md:block text-sm text-ink-soft text-end">
        {rng(r.lo, r.hi)}
      </span>
      <span className="sr-only">; טווח {r.lo} עד {r.hi}</span>
      {withDots && r.pass !== undefined && (
        <span className="col-span-full flex items-center gap-2.5 text-sm text-ink-soft pb-1">
          <Dots pass={r.pass} />
          <span>עוברת ב-{Math.round(r.pass * 100)}% מהתרחישים</span>
        </span>
      )}
    </li>
  );
}

function Key({ dotLabel, barLabel }: { dotLabel: string; barLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft my-1">
      <span className="inline-flex items-center gap-2"><i className="size-[.8rem] rounded-full bg-ink" />{dotLabel}</span>
      <span className="inline-flex items-center gap-2"><i className="w-[1.4rem] h-[.3rem] rounded-full bg-accent/70" />{barLabel}</span>
    </div>
  );
}

/** ציר המנדטים פעם אחת בראש, 0 משמאל */
function Axis({ axisMax }: { axisMax: number }) {
  const ticks = Array.from({ length: axisMax / 10 + 1 }, (_, i) => i * 10);
  return (
    <div aria-hidden="true" className={`grid ${COLS} gap-x-3 text-xs text-ink-soft mt-1.5`}>
      <div dir="ltr" className="col-start-3 relative h-4">
        {ticks.map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: `${(v / axisMax) * 100}%` }}>{v}</span>
        ))}
      </div>
    </div>
  );
}

/** מקסימום ציר המנדטים: 30 לפחות, ומכפלה של 10 מעל הטווח הגבוה ביותר */
export const axisMaxOf = (rows: { hi: number }[]) => Math.max(30, Math.ceil(Math.max(...rows.map((r) => r.hi), 0) / 10) * 10);

/**
 * כל הרשימות: ציר פעם אחת בראש (0 משמאל), שורה לרשימה, וקו אחוז החסימה שמפריד את "על הסף".
 * רכיב אחד לבית, ל"המצב היום" ול"תרחישים" (החלטה 10, 9.10.2026).
 */
export function Ranking({ home, dotLabel = "ממוצע הסקרים", barLabel = "טווח 80% מהתרחישים" }: { home: HomeData; dotLabel?: string; barLabel?: string }) {
  const { safe, edge, below, axisMax } = home;
  return (
    <>
      <Key dotLabel={dotLabel} barLabel={barLabel} />
      <Axis axisMax={axisMax} />
      <ol className="mt-1">{safe.map((r) => <RankRow key={r.id} r={r} axisMax={axisMax} />)}</ol>
      {edge.length > 0 && (
        <>
          <div
            role="separator"
            aria-label="קו אחוז החסימה, 3.25%"
            className="flex items-center gap-3 my-2 text-sm font-bold text-ink-soft before:content-[''] before:flex-1 before:border-t-2 before:border-dashed before:border-ink-faint after:content-[''] after:flex-1 after:border-t-2 after:border-dashed after:border-ink-faint"
          >
            אחוז החסימה 3.25%
          </div>
          <ol>{edge.map((r) => <RankRow key={r.id} r={r} axisMax={axisMax} withDots />)}</ol>
        </>
      )}
      {below.length > 0 && <p className="mt-2 text-sm text-ink-soft">מתחת לסף: {below.map((r) => r.name).join(", ")}</p>}
    </>
  );
}

/** אותו רכיב לסיכום הסקרים בין המכונים: נקודה = החציון, פס = הנמוך והגבוה בין המכונים (בלי קו סף) */
export function PollRanges({ rows, dotLabel = "חציון הסקרים", barLabel = "הנמוך והגבוה בין המכונים" }: { rows: RangeRowData[]; dotLabel?: string; barLabel?: string }) {
  const axisMax = axisMaxOf(rows);
  return (
    <>
      <Key dotLabel={dotLabel} barLabel={barLabel} />
      <Axis axisMax={axisMax} />
      <ol className="mt-1">{rows.map((r) => <RankRow key={r.id} r={r} axisMax={axisMax} />)}</ol>
    </>
  );
}

/** הממשלה היוצאת לאורך זמן: קו, קו 61 מקווקו, ורצועת 80% ליום הבחירות. SVG בקנה מידה חופשי, תוויות ב-HTML בגודל קבוע. */
export function GovTrend({ home }: { home: HomeData }) {
  const { series, blocLo: lo, blocHi: hi } = home;
  if (series.length < 2) return null;
  const X0 = 3, X1 = 86, YT = 6, YB = 84;
  const vals = series.map((s) => s.v);
  const vmin = Math.floor((Math.min(...vals, lo) - 2) / 2) * 2;
  const vmax = Math.ceil((Math.max(...vals, hi, MAJORITY) + 3) / 2) * 2;
  const Y = (v: number) => YB - ((YB - YT) * (v - vmin)) / (vmax - vmin);
  const t0 = Date.parse(series[0].date);
  const t1 = Date.parse(series[series.length - 1].date);
  const X = (d: string) => (t1 === t0 ? X0 : X0 + ((X1 - X0) * (Date.parse(d) - t0)) / (t1 - t0));
  const pts = series.map((s) => `${X(s.date).toFixed(2)},${Y(s.v).toFixed(2)}`).join(" ");
  const grid = [50, 55].filter((v) => v > vmin && v < vmax);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const line = { vectorEffect: "non-scaling-stroke" as const };
  const label = "absolute -translate-x-1/2 -translate-y-1/2 text-sm font-bold leading-none whitespace-nowrap";
  return (
    <>
      <div className="relative mt-2" dir="ltr">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="block w-full h-40"
          role="img"
          aria-label={`הממשלה היוצאת: ${min === max ? min : `${min} עד ${max}`} מנדטים בממוצע מאז ${dayMonth(series[0].date)}; קו ${MAJORITY} מסמן את הרוב; בטווח 80% ליום הבחירות: ${lo} עד ${hi}`}
        >
          {grid.map((v) => <line key={v} x1={X0} x2={100} y1={Y(v)} y2={Y(v)} className="stroke-paper-line" strokeWidth={1} {...line} />)}
          <line x1={X0} x2={100} y1={Y(MAJORITY)} y2={Y(MAJORITY)} className="stroke-ink" strokeWidth={1.5} strokeDasharray="5 4" {...line} />
          <polyline points={pts} className="fill-none stroke-accent" strokeWidth={2.5} strokeLinejoin="round" {...line} />
          <line x1={X1} x2={X1} y1={Y(lo)} y2={Y(hi)} className="stroke-accent/70" strokeWidth={2} {...line} />
          <line x1={X1 - 2} x2={X1 + 2} y1={Y(hi)} y2={Y(hi)} className="stroke-accent/70" strokeWidth={2} {...line} />
          <line x1={X1 - 2} x2={X1 + 2} y1={Y(lo)} y2={Y(lo)} className="stroke-accent/70" strokeWidth={2} {...line} />
        </svg>
        <span aria-hidden="true" className={`${label} text-base font-extrabold`} style={{ left: "95%", top: `${Y(MAJORITY) - 7}%` }}>{MAJORITY}</span>
        <span aria-hidden="true" className={label} style={{ left: `${X1 + 6}%`, top: `${Y(hi)}%` }}>{hi}</span>
        <span aria-hidden="true" className={label} style={{ left: `${X1 + 6}%`, top: `${Y(lo)}%` }}>{lo}</span>
        <span aria-hidden="true" className={`${label} !translate-y-0 !font-normal text-xs text-ink-soft`} style={{ left: `${X0 + 2}%`, top: "88%" }}>{dayMonth(series[0].date)}</span>
        <span aria-hidden="true" className={`${label} !translate-y-0 !font-normal text-xs text-ink-soft`} style={{ left: `${X1}%`, top: "88%" }}>{dayMonth(series[series.length - 1].date)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft mt-1">
        <span className="inline-flex items-center gap-2"><i className="w-[1.4rem] h-[.3rem] rounded-full bg-accent/70" />טווח 80% ליום הבחירות</span>
      </div>
    </>
  );
}

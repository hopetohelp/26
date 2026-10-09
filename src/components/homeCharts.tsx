import { Link } from "react-router-dom";
import { hemicycleSeats } from "../lib/hemicycle";
import { rng, seatsFmt } from "../lib/format";
import { dayMonth, type HomeData, type HomeRow } from "../lib/home";
import { clipSegs, intSegs, levelSegs, smoothPath, sparseIndices, valueSegs, type LSeg, type Seg } from "../lib/chartLanguage";
import ChartLegend, { rangeLine, type LegendEntry } from "./ChartLegend";
import { AxisLabels, MeanDot, ProfileCandle, ProfileCandleV, Track } from "./marks";

/**
 * שורת טווח: הממוצע (עיגול מלא אדום) והטווח (נר כחול שעוביו משתנה לאורכו). `segs` = קטעי הנר וכמות הנתונים בכל אחד.
 * `pass` רק לרשימות על הסף.
 */
export interface RangeRowData {
  id: string;
  name: string;
  central: number;
  lo: number;
  hi: number;
  segs: Seg[];
  pass?: number;
}

/**
 * גרפי הבית (הכרעת בעלים 9.10.2026) בשפת הציור האחידה (`src/lib/chartLanguage.ts`): לוח 120 המושבים, דירוג הרשימות
 * (נר = טווח, שעוביו משתנה לפי כמה תרחישים נותנים כל ערך; עיגול מלא = ממוצע המודל) ומגמת הממשלה היוצאת (קו חלק עם סמנים ונר בסופו).
 * 🔴 הטווח לפי מקור הנתון (הכרעת בעלים 9.10.2026): נר שמבוסס על **תרחישים** (הדירוג, מגמת הממשלה) הוא טווח **80%** (מ-10% עד 90%);
 * נר שמבוסס על סקרים, השערות, נתונים או חוק הבחירות (סיכום המכונים) הוא **מלא** (הנמוך והגבוה). הצבעים בטוקנים (`--mk-*`, `pos`, `neg`).
 * כל גרף מקבל מנדטים ממספר אחד: `buildHome` ב-`src/lib/home.ts`.
 */
const W = 2.2;
const H = 1.32;
const CX = 1.1;
const CY = 1.26;
const SEATS = hemicycleSeats(CX, CY);
export const MAJORITY = 61;

/** כמה מושבים חסרים לממשלה היוצאת עד הרוב (0 כשיש רוב) */
export const missingToMajority = (gov: number) => Math.max(0, MAJORITY - gov);

/**
 * 120 מושבים בחצי עיגול: הממשלה היוצאת (מלא), המושבים שחסרים לה עד הרוב (עיגולים אדומים בהירים), וכל השאר (מסגרת).
 * במקום קו ה-61 (הכרעת בעלים 9.10.2026): המושבים החסרים הם עצמם הפער.
 */
export function Hemicycle({ gov, other }: { gov: number; other: number }) {
  const missing = Math.min(missingToMajority(gov), other);
  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full h-auto"
          role="img"
          aria-label={`120 המושבים בחצי עיגול: ${gov} למפלגות הממשלה היוצאת; ${missing > 0 ? `${missing} מושבים חסרים להן עד הרוב, ${MAJORITY}; ` : `יש להן רוב, ${MAJORITY} ומעלה; `}${other - missing} לשאר הרשימות.`}
        >
          {SEATS.map((s, k) => (
            <circle key={k} cx={s.x} cy={s.y} r={0.038} className={`${k < gov ? "seat-a" : k < gov + missing ? "seat-miss" : "seat-b"} seat-in`} style={{ animationDelay: `${k * 5}ms` }} />
          ))}
        </svg>
        <span
          aria-hidden="true"
          className="absolute -translate-x-1/2 -translate-y-1/2 text-sm leading-none text-ink-soft"
          style={{ left: "50%", top: `${((CY - 0.06) / H) * 100}%` }}
        >
          120 מושבים
        </span>
      </div>
      <ChartLegend
        entries={[
          { kind: "seatGov", text: `מפלגות הממשלה היוצאת (ממשלה 37): ${gov} מושבים, סכום הממוצעים שלהן` },
          ...(missing > 0 ? [{ kind: "seatMiss" as const, text: `מושבים שחסרים להן עד הרוב, ${MAJORITY}` }] : []),
          { kind: "seatOther", text: missing > 0 ? "שאר הכנסת" : "כל השאר" },
        ]}
      />
    </figure>
  );
}

const COLS = "grid-cols-[minmax(0,1fr)_2.1rem_minmax(5.5rem,38%)] md:grid-cols-[minmax(0,13rem)_2.6rem_minmax(0,1fr)_5rem]";

const PICK = "העובי בכל קטע: כמה נתונים נותנים ערך כזה";

/**
 * כמה מהתרחישים הרשימה עוברת את אחוז החסימה: פס אחד, אדום (לא עוברת) משמאל וירוק (עוברת) מימין.
 * הצבע לא לבדו: המספרים כתובים ליד הפס.
 */
export function PassBar({ pass }: { pass: number }) {
  const p = Math.round(pass * 100);
  return (
    <span aria-hidden="true" dir="ltr" className="inline-flex h-[.7rem] w-24 rounded-full overflow-hidden shadow-[inset_0_0_0_1.5px_rgb(var(--ink-faint)/.6)]">
      <i className="bg-neg" style={{ width: `${100 - p}%` }} />
      <i className="bg-pos" style={{ width: `${p}%` }} />
    </span>
  );
}

function RankRow({ r, lsegs, axisMax, withPass }: { r: RangeRowData; lsegs: LSeg[]; axisMax: number; withPass?: boolean }) {
  const x = (v: number) => (v / axisMax) * 100;
  return (
    <li className={`grid ${COLS} items-center gap-x-3 min-h-12 py-1.5 border-t border-paper-line last:border-b`}>
      <span className="font-semibold leading-tight">{r.name}</span>
      <span className="font-num text-xl font-extrabold tabular">{seatsFmt(r.central)}</span>
      <Track axisMax={axisMax} title={`${r.name}: ${PICK}`}>
        <ProfileCandle segs={lsegs} x={x} />
        <MeanDot at={x(r.central)} />
      </Track>
      <span className="hidden md:block text-sm text-ink-soft text-end">
        {rng(r.lo, r.hi)}
      </span>
      <span className="sr-only">; טווח {r.lo} עד {r.hi}</span>
      {withPass && r.pass !== undefined && (
        <span className="col-span-full flex items-center gap-2.5 text-sm text-ink-soft pb-1">
          <PassBar pass={r.pass} />
          <span className="flex flex-wrap gap-x-3">
            <span className="whitespace-nowrap">עוברת ב-{Math.round(r.pass * 100)}% מהתרחישים</span>
            <span className="whitespace-nowrap">לא עוברת ב-{100 - Math.round(r.pass * 100)}%</span>
          </span>
        </span>
      )}
    </li>
  );
}

/** מקרא הדירוג: ממוצע, נר הטווח (ועוביו) וקישור להסבר על ממוצע המודל מול ממוצע המכונים */
function RankLegend({ meanLabel, rangeText, withPass }: { meanLabel: string; rangeText: string; withPass?: boolean }) {
  const entries: LegendEntry[] = [
    { kind: "mean", text: meanLabel },
    { kind: "candle", text: rangeText },
    ...(withPass ? [{ kind: "pass" as const, text: "שיעור התרחישים שבהם הרשימה עוברת את אחוז החסימה: אדום = לא עוברת, ירוק = עוברת" }] : []),
  ];
  return (
    <ChartLegend entries={entries}>
      <Link to="/method#means" className="font-semibold">ממוצע המודל מול ממוצע המכונים</Link>
    </ChartLegend>
  );
}

/** ציר המנדטים פעם אחת בראש, 0 משמאל */
function Axis({ axisMax }: { axisMax: number }) {
  return (
    <div aria-hidden="true" className={`grid ${COLS} gap-x-3 text-xs text-ink-soft mt-1.5`}>
      <div className="col-start-3">
        <AxisLabels axisMax={axisMax} />
      </div>
    </div>
  );
}

/** מקסימום ציר המנדטים: 30 לפחות, ומכפלה של 10 מעל הטווח הגבוה ביותר */
export const axisMaxOf = (rows: { hi: number }[]) => Math.max(30, Math.ceil(Math.max(...rows.map((r) => r.hi), 0) / 10) * 10);

/** רשימה מהנתונים הביתיים ⇐ שורה בטווח 80% מהתרחישים, עם קטעי הנר מההתפלגות של כל התרחישים, חתוכה לטווח */
export function rangeRow(r: HomeRow): RangeRowData {
  const all = r.hist.length ? intSegs(r.hist) : [{ from: r.lo, to: r.hi, count: 1 }];
  return { id: r.id, name: r.name, central: r.central, lo: r.lo, hi: r.hi, pass: r.pass, segs: clipSegs(all, r.lo, r.hi) };
}

/**
 * כל הרשימות: ציר פעם אחת בראש (0 משמאל), שורה לרשימה, וקו אחוז החסימה שמפריד את "על הסף".
 * רכיב אחד לבית, ל"המצב היום" ול"תרחישים" (החלטה 10, 9.10.2026).
 * הטווח הוא תמיד 80% מהתרחישים (מ-10% עד 90%), כי כל הדירוג מבוסס על תרחישים (הכרעת בעלים 9.10.2026).
 * עובי הנר בכל קטע: כמה תרחישים נותנים לרשימה את הערך הזה, ביחס לקטע העמוס ביותר בכל הדירוג.
 */
export function Ranking({ home, meanLabel = "ממוצע המודל" }: { home: HomeData; meanLabel?: string }) {
  const safe = home.safe.map((r) => rangeRow(r));
  const edge = home.edge.map((r) => rangeRow(r));
  const below = home.below;
  const axisMax = axisMaxOf([...safe, ...edge]);
  const levels = levelSegs([...safe, ...edge].map((r) => r.segs));
  const lvOf = (i: number) => levels[i];
  const rangeText = rangeLine("p80", "התרחישים");
  return (
    <>
      <RankLegend meanLabel={meanLabel} rangeText={rangeText} withPass={edge.length > 0} />
      <Axis axisMax={axisMax} />
      <ol className="mt-1">{safe.map((r, i) => <RankRow key={r.id} r={r} lsegs={lvOf(i)} axisMax={axisMax} />)}</ol>
      {edge.length > 0 && (
        <>
          <div
            role="separator"
            aria-label="קו אחוז החסימה, 3.25%"
            className="flex items-center gap-3 my-2 text-sm font-bold text-ink-soft before:content-[''] before:flex-1 before:border-t-2 before:border-dashed before:border-ink-faint after:content-[''] after:flex-1 after:border-t-2 after:border-dashed after:border-ink-faint"
          >
            אחוז החסימה 3.25%
          </div>
          <ol>{edge.map((r, i) => <RankRow key={r.id} r={r} lsegs={lvOf(safe.length + i)} axisMax={axisMax} withPass />)}</ol>
        </>
      )}
      {below.length > 0 && <p className="mt-2 text-sm text-ink-soft">מתחת לסף: {below.map((r) => r.name).join(", ")}</p>}
    </>
  );
}

/** שורת סיכום מכונים: ממוצע, ערך כל מכון (מזה הנמוך, הגבוה ועובי הנר) */
export interface MachineRow {
  id: string;
  name: string;
  central: number;
  /** המנדטים שכל מכון נתן לרשימה (הסקר האחרון של כל מכון) */
  values: number[];
}

/** אותו רכיב לסיכום הסקרים בין המכונים: עיגול מלא = ממוצע המכונים, נר = הנמוך והגבוה בין המכונים (טווח מלא), עובי הנר לפי כמה מכונים נתנו כל ערך */
export function PollRanges({ rows, meanLabel = "ממוצע המכונים" }: { rows: MachineRow[]; meanLabel?: string }) {
  const data: RangeRowData[] = rows.map((r) => ({ id: r.id, name: r.name, central: r.central, lo: Math.min(...r.values), hi: Math.max(...r.values), segs: valueSegs(r.values) }));
  const axisMax = axisMaxOf(data);
  const levels = levelSegs(data.map((r) => r.segs));
  return (
    <>
      <RankLegend meanLabel={meanLabel} rangeText={rangeLine("full", "הסקרים")} />
      <Axis axisMax={axisMax} />
      <ol className="mt-1">{data.map((r, i) => <RankRow key={r.id} r={r} lsegs={levels[i]} axisMax={axisMax} />)}</ol>
    </>
  );
}

/** קטעי הנר של סכום הממשלה היוצאת: ההתפלגות בכל התרחישים, חתוכה לטווח 80% (תרחישים ⇐ 80%) */
export function blocRangeSegs(home: Pick<HomeData, "blocLo" | "blocHi" | "blocHist">): Seg[] {
  const { blocLo: lo, blocHi: hi, blocHist } = home;
  return clipSegs(blocHist.length ? intSegs(blocHist) : [{ from: lo, to: hi, count: 1 }], lo, hi);
}

/**
 * הממשלה היוצאת לאורך זמן: קו חלק עם סמנים קטנים (עיגולים ריקים שחורים), קו 61 מקווקו, ובסופו עיגול מלא אדום (הממוצע היום)
 * ונר של טווח 80% ליום הבחירות (שעוביו משתנה לפי כמה תרחישים נותנים כל סכום). SVG בקנה מידה חופשי לקו; הסמנים והנר ב-HTML כדי שיישארו עגולים.
 */
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
  const pts = series.map((s) => ({ x: X(s.date), y: Y(s.v) }));
  const markers = sparseIndices(pts.map((p) => p.x), 8).filter((i) => i !== pts.length - 1);
  const last = pts[pts.length - 1];
  const grid = [50, 55].filter((v) => v > vmin && v < vmax);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const profile = levelSegs([blocRangeSegs(home)])[0];
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
          <path d={smoothPath(pts)} className="fill-none stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" {...line} />
        </svg>
        {markers.map((i) => (
          <span key={i} aria-hidden="true" className="mk mk-dot" style={{ left: `${pts[i].x}%`, top: `${pts[i].y}%` }} />
        ))}
        <ProfileCandleV segs={profile} y={Y} left={`${X1}%`} />
        <span aria-hidden="true" className="mk mk-mean" style={{ left: `${last.x}%`, top: `${last.y}%` }} />
        <span aria-hidden="true" className={`${label} text-base font-extrabold`} style={{ left: "6%", top: `${Y(MAJORITY) - 7}%` }}>{MAJORITY}</span>
        <span aria-hidden="true" className={label} style={{ left: `${X1 + 6}%`, top: `${Y(hi)}%` }}>{hi}</span>
        <span aria-hidden="true" className={label} style={{ left: `${X1 + 6}%`, top: `${Y(lo)}%` }}>{lo}</span>
        <span aria-hidden="true" className={`${label} !translate-y-0 !font-normal text-xs text-ink-soft`} style={{ left: `${X0 + 2}%`, top: "88%" }}>{dayMonth(series[0].date)}</span>
        <span aria-hidden="true" className={`${label} !translate-y-0 !font-normal text-xs text-ink-soft`} style={{ left: `${X1}%`, top: "88%" }}>{dayMonth(series[series.length - 1].date)}</span>
      </div>
      <ChartLegend
        entries={[
          { kind: "line", text: "הממוצע של מנדטי הממשלה היוצאת בכל יום" },
          { kind: "dot", text: "נקודה על הקו" },
          { kind: "dash", text: `קו הרוב, ${MAJORITY} מנדטים` },
          { kind: "mean", text: "הממוצע היום" },
          { kind: "candle", text: rangeLine("p80", "התרחישים", "ליום הבחירות") },
        ]}
      />
    </>
  );
}

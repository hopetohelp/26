import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { HALL, hemicycleSeats } from "../lib/hemicycle";
import { rng, seatsFmt } from "../lib/format";
import { type HomeData, type HomeRow } from "../lib/home";
import { candleProfiles, clipSegs, intSegs, valueSegs, type LSeg, type Seg } from "../lib/chartLanguage";
import ChartLegend, { pollCandleLine, rangeLine, type LegendEntry } from "./ChartLegend";
import { POINT_WINDOW } from "../lib/data";
import { useSeen, whenVisible } from "../lib/useSeen";
import { PartyAvatar } from "./PartyAvatar";
import CandleTrend from "./CandleTrend";
import type { TrendPoint } from "./charts";
import { AxisLabels, MeanDot, ProfileCandle, Track } from "./marks";

/**
 * שורת טווח: הממוצע (עיגול מלא כתום) והטווח (נר כחול שעוביו משתנה לאורכו). `segs` = קטעי הנר וכמות הנתונים בכל אחד.
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
const SEATS = hemicycleSeats();
export const MAJORITY = 61;
/** כמה מושבים חסרים לממשלה היוצאת עד הרוב (0 כשיש רוב) */
export const missingToMajority = (gov: number) => Math.max(0, MAJORITY - gov);

/**
 * 120 מושבים בצורת פרסה (כמו אולם המליאה, `src/lib/hemicycle.ts`) בשלושה גוונים (הכרעת בעלים 11.10.2026), מהקצה הימני:
 * גוש נתניהו (מלא), המפלגות הערביות (גוון בינוני) וגוש אייזנקוט (מסגרת, בהיר). שלושתם מגושי ברירת המחדל (`defaultBlocs`).
 * במרכז: שורה לכל אחד משני הגושים ("53 גוש נתניהו" ו"53 גוש אייזנקוט") עם קו הפרדה ו"&" באלכסון. בלי כפתור "מקרא" (הכרעת בעלים 11.10.2026); המספרים לכל הגושים בתיאור לקורא מסך.
 */
export function Hemicycle({ coalition, arab, opposition, duel, footer, info }: { coalition: number; arab: number; opposition: number; duel?: [string, string]; footer?: ReactNode; info?: ReactNode }) {
  const [seenRef, seen] = useSeen<HTMLElement>();
  return (
    <figure ref={seenRef} className={`m-0 ${whenVisible(seen)}`}>
      <div className="relative [container-type:inline-size]">
        <svg
          viewBox={`0 0 ${HALL.w} ${HALL.h}`}
          className="block w-full h-auto"
          role="img"
          aria-label={`120 המושבים בצורת פרסה: ${coalition} לגוש נתניהו, ${arab} למפלגות הערביות, ${opposition} לגוש אייזנקוט.`}
        >
          {SEATS.map((s, k) => (
            <circle key={k} cx={s.x} cy={s.y} r={HALL.r} className={`${k < coalition ? "seat-a" : k < coalition + arab ? "seat-arab" : "seat-b"} seat-in`} style={{ animationDelay: `${k * 5}ms` }} />
          ))}
        </svg>
        {duel && (
          // מרכז החלל הפנימי של הפרסה (הכרעת בעלים 11.10.2026): שורה לכל גוש — המספר ושם הגוש, גוש נתניהו למעלה — עם קו הפרדה ו"&" באלכסון באמצעו
          // `info`: אייקון המידע של המספרים (ממוצע המודל), ממורכז מתחת לשתי השורות בלי להזיז אותן; הוא היחיד כאן שאינו מוסתר מקורא מסך
          <div className="absolute z-10 flex flex-col items-stretch whitespace-nowrap leading-none" style={{ left: "50%", top: `${(HALL.cy / HALL.h) * 100}%`, transform: "translate(-50%, -50%)" }}>
            <DuelRow n={coalition} label={duel[0]} />
            <span aria-hidden="true" className="relative my-1.5 md:my-2.5 h-0 border-t-2 border-ink-faint">
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] bg-paper px-1.5 font-display text-sm sm:text-xl md:text-3xl font-extrabold text-ink-soft">&amp;</span>
            </span>
            <DuelRow n={opposition} label={duel[1]} />
            {info && <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 md:mt-2">{info}</span>}
          </div>
        )}
        {footer && (
          // משלים את הריבוע (הכרעת בעלים 11.10.2026): בפתח התחתון של הפרסה, בין שני האגפים, והשורה התחתונה שלו בקו התחתון של עיגולי הלוח
          <div className="absolute" style={{ left: "50%", bottom: `${(HALL.pad / HALL.h) * 100}%`, transform: "translateX(-50%)", width: "54%" }}>{footer}</div>
        )}
      </div>
    </figure>
  );
}

/** שורת גוש במרכז הלוח: המספר מימין ושם הגוש משמאלו */
function DuelRow({ n, label }: { n: number; label: string }) {
  return (
    <span aria-hidden="true" dir="rtl" className="flex items-baseline justify-center gap-1.5 md:gap-3">
      <span className="font-num text-lg sm:text-2xl md:text-4xl font-extrabold tabular">{n}</span>
      <span className="font-display text-xs sm:text-base md:text-2xl">{label}</span>
    </span>
  );
}

const COLS = "grid-cols-[minmax(0,1fr)_2.1rem_minmax(4.5rem,32%)] md:grid-cols-[minmax(0,13rem)_2.6rem_minmax(0,1fr)_5rem]";

const PICK = "העובי בכל קטע: כמה נתונים נותנים ערך כזה";

/**
 * כמה מהתרחישים הרשימה עוברת את אחוז החסימה: פס אחד, אדום (לא עוברת) משמאל וירוק (עוברת) מימין.
 * הצבע לא לבדו: המספרים כתובים ליד הפס.
 * אנימציה (הכרעת בעלים 11.10.2026): כשהפס נגלל אל המסך הוא מתחיל כולו ירוק, והאדום מתפשט משמאל עד חלקו (`pass-red` ב-`index.css`).
 */
export function PassBar({ pass }: { pass: number }) {
  const p = Math.round(pass * 100);
  const [seenRef, seen] = useSeen<HTMLSpanElement>(0.6);
  return (
    <span ref={seenRef} aria-hidden="true" dir="ltr" className={`inline-flex h-[.7rem] w-24 rounded-full overflow-hidden bg-pos shadow-[inset_0_0_0_1.5px_rgb(var(--ink-faint)/.6)] ${whenVisible(seen)}`}>
      <i className="pass-red bg-neg" style={{ width: `${100 - p}%` }} />
    </span>
  );
}

function RankRow({ r, lsegs, axisMax, withPass }: { r: RangeRowData; lsegs: LSeg[]; axisMax: number; withPass?: boolean }) {
  const x = (v: number) => (v / axisMax) * 100;
  return (
    <li className={`grid ${COLS} items-center gap-x-3 min-h-12 py-1.5 border-t border-paper-line last:border-b`}>
      <span className="flex items-center gap-2 min-w-0">
        <PartyAvatar id={r.id} size={32} />
        <span className="min-w-0 font-semibold leading-tight text-[.95rem] md:text-base [overflow-wrap:anywhere]">{r.name}</span>
      </span>
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
          <span className="whitespace-nowrap">עוברת ב-{Math.round(r.pass * 100)}% מהתרחישים</span>
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
 * 🔴 מי מתחת לקו — לפי הסקרים האחרונים בלבד (`HOME.edge`, הכרעת בעלים 12.10.2026, הכרעה 4), כמו בכל האתר.
 * רכיב אחד לבית, ל"המצב היום" ול"תרחישים" (החלטה 10, 9.10.2026).
 * הטווח הוא תמיד 80% מהתרחישים (מ-10% עד 90%), כי כל הדירוג מבוסס על תרחישים (הכרעת בעלים 9.10.2026).
 * עובי הנר בכל קטע: כמה תרחישים נותנים לרשימה את הערך הזה, ביחס לקטע העמוס ביותר באותו נר.
 */
export function Ranking({ home, meanLabel = "ממוצע המודל", scenarioRisk = false }: { home: HomeData; meanLabel?: string; scenarioRisk?: boolean }) {
  // `scenarioRisk` (רק במסך התרחישים, הכרעה 4): גם רשימה מעל הקו שעוברת רק בחלק מהתרחישים מקבלת את פס התרחישים
  const scen = new Set(scenarioRisk ? home.scenarioEdge.map((r) => r.id) : []);
  const safe = home.safe.map((r) => rangeRow(r));
  const edge = home.edge.map((r) => rangeRow(r));
  const below = home.below;
  const axisMax = axisMaxOf([...safe, ...edge]);
  const levels = candleProfiles([...safe, ...edge].map((r) => r.segs));
  const lvOf = (i: number) => levels[i];
  const rangeText = rangeLine("p80", "התרחישים");
  return (
    <>
      <RankLegend meanLabel={meanLabel} rangeText={rangeText} withPass={edge.length > 0 || scen.size > 0} />
      <Axis axisMax={axisMax} />
      <ol className="mt-1">{safe.map((r, i) => <RankRow key={r.id} r={r} lsegs={lvOf(i)} axisMax={axisMax} withPass={scen.has(r.id)} />)}</ol>
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
  const levels = candleProfiles(data.map((r) => r.segs));
  return (
    <>
      <RankLegend meanLabel={meanLabel} rangeText={pollCandleLine(POINT_WINDOW)} />
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
 * מגמת הממשלה היוצאת: הגרף האחיד `CandleTrend` (נר כל 3 ימים, 14 יום אחורה, שלוש דרגות עובי, הקו עובר דרך הממוצעים של הנקודות, קווים כל 5 ו-61 במקום 60,
 * חלון במעבר על הנר, מקרא בפינה השמאלית העליונה). `points` = לכל נקודה: סכום המנדטים של הממשלה היוצאת בכל סקר בחלון (הנר), ו-`mean` = ממוצע המודל באותו יום (הנקודה והקו), כך שהנקודה האחרונה שווה למספר שבלוח המושבים.
 */
export function GovTrend({ home, points = [], heading }: { home: HomeData; points?: { t: number; values: number[]; mean?: number }[]; heading?: ReactNode }) {
  const { series } = home;
  if (series.length < 2) return null;
  const trend: TrendPoint[] = points
    .filter((p) => p.values.length)
    .map((p) => ({ t: p.t, v: p.mean ?? p.values.reduce((a, b) => a + b, 0) / p.values.length, lo: Math.min(...p.values), hi: Math.max(...p.values), n: p.values.length, xs: p.values, raw: p.values.reduce((a, b) => a + b, 0) / p.values.length }));
  return (
    <CandleTrend
      title="מגמת הממשלה היוצאת בסקרים"
      heading={heading}
      series={[{ id: "gov", name: "הממשלה היוצאת", points: trend }]}
      majority={MAJORITY}
    />
  );
}

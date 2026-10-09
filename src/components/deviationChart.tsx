import { rng, signed } from "../lib/format";
import { deviation, type DevInput, type DevRow } from "../lib/deviation";
import { volumeLevel } from "../lib/chartLanguage";
import { Candle, KeyItem, MeanDot, ResultRing, ThicknessKey } from "./marks";

/**
 * "הסקרים מול התוצאות" (החלטה 8, 9.10.2026) בשפת הציור האחידה: לכל רשימה, נר = הנמוך והגבוה בין הסקרים ערב הבחירות (טווח מלא;
 * עובי הנר לפי כמה מכונים שאלו עליה, ביחס לשאר הגרף), עיגול מלא ב-0 = ממוצע הסקרים, עיגול גדול ריק = התוצאה הרשמית.
 * הכול ביחס לממוצע הסקרים (0), כך שהבדלים קטנים נראים. הקבוצה ("מחוץ לטווח" / "בתוך הטווח") והטקסט נושאים את ההבחנה, לא צבע.
 * ציר 0 באמצע, "פחות" משמאל ו"יותר" מימין. הטווח הוא הנמוך והגבוה בין הסקרים, לא טווח טעות סטטיסטי.
 */
const COLS = "grid-cols-[minmax(0,1fr)_minmax(7rem,46%)_3.4rem] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem]";

/** סימוני הציר: 0 ומשני צידיו במרווח קבוע, עד שבעה סימונים (כדי שייכנסו בטלפון) */
export function devTicks(bound: number): number[] {
  const step = bound <= 3 ? 1 : bound <= 6 ? 2 : Math.ceil(bound / 3);
  const out = [0];
  for (let v = step; v <= bound; v += step) out.unshift(-v), out.push(v);
  return out;
}

function Row({ r, bound, maxN }: { r: DevRow; bound: number; maxN: number }) {
  const x = (v: number) => ((v + bound) / (2 * bound)) * 100;
  const ticks = devTicks(bound);
  return (
    <li className={`grid ${COLS} items-center gap-x-3 min-h-14 py-1.5 border-t border-paper-line last:border-b`}>
      <span className="leading-tight">
        <span className="block font-semibold">{r.name}</span>
        <span className="block text-sm text-ink-soft">
          <span className="whitespace-nowrap">בפועל <b className="font-num tabular text-ink">{r.actual}</b></span>
          {" · "}
          <span className="whitespace-nowrap">סקרים {r.min === r.max ? r.min : rng(r.min, r.max)}</span>
        </span>
      </span>
      <span aria-hidden="true" dir="ltr" className="relative block h-8">
        {ticks.map((v) => (
          <span key={v} className={`absolute inset-y-0 ${v === 0 ? "w-0.5 bg-ink-faint/60" : "w-px bg-paper-line"}`} style={{ left: `${x(v)}%` }} />
        ))}
        <Candle from={x(r.lo)} to={x(r.hi)} level={volumeLevel(r.n, maxN)} />
        <MeanDot at={x(0)} />
        <ResultRing at={x(r.dev)} />
      </span>
      <span className="text-end font-num font-extrabold tabular">
        <bdi dir="ltr">{signed(r.dev)}</bdi>
      </span>
      <span className="sr-only">
        ; בפועל {r.actual}, ממוצע הסקרים {r.estimate}, בסקרים בין {r.min} ל-{r.max}, {r.outside ? "מחוץ לטווח הסקרים" : "בתוך טווח הסקרים"}
      </span>
    </li>
  );
}

export default function DeviationChart({ rows }: { rows: DevInput[] }) {
  const { outside, inside, notAsked, bound } = deviation(rows);
  const maxN = Math.max(0, ...[...outside, ...inside].map((r) => r.n));
  const ticks = devTicks(bound);
  const x = (v: number) => ((v + bound) / (2 * bound)) * 100;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft my-1">
        <KeyItem kind="mean">0 = ממוצע הסקרים</KeyItem>
        <KeyItem kind="candle">הנמוך והגבוה בין הסקרים (לא טווח טעות סטטיסטי)</KeyItem>
        <KeyItem kind="result">התוצאה בפועל</KeyItem>
        <ThicknessKey what="כמה מכונים שאלו על הרשימה" />
      </div>
      <div aria-hidden="true" className={`grid ${COLS} gap-x-3 text-xs text-ink-soft mt-1.5`}>
        <div dir="ltr" className="col-start-2 relative h-8">
          <span className="absolute left-0 top-0">פחות מהסקרים</span>
          <span className="absolute right-0 top-0">יותר מהסקרים</span>
          {ticks.map((v) => (
            <span key={v} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${x(v)}%` }}>{v === 0 ? "0" : <bdi>{signed(v)}</bdi>}</span>
          ))}
        </div>
      </div>
      {outside.length > 0 && (
        <>
          <h4 className="mt-2 text-sm font-bold">מחוץ לטווח הסקרים ({outside.length})</h4>
          <ol>{outside.map((r) => <Row key={r.id} r={r} bound={bound} maxN={maxN} />)}</ol>
        </>
      )}
      {inside.length > 0 && (
        <>
          <h4 className="mt-3 text-sm font-bold">בתוך הטווח ({inside.length})</h4>
          <ol>{inside.map((r) => <Row key={r.id} r={r} bound={bound} maxN={maxN} />)}</ol>
        </>
      )}
      {notAsked.length > 0 && (
        <p className="mt-3 text-sm text-ink-soft">לא נשאלו בסקרים: {notAsked.map((r) => `${r.name} (בפועל ${r.actual})`).join(", ")}.</p>
      )}
    </div>
  );
}

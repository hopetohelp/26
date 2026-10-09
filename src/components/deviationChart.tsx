import { rng, signed } from "../lib/format";
import { deviation, type DevInput, type DevRow } from "../lib/deviation";

/**
 * "הסקרים מול התוצאות" (החלטה 8, 9.10.2026): לכל רשימה, פס = הנמוך והגבוה בין הסקרים ערב הבחירות, נקודה = התוצאה הרשמית,
 * הכול ביחס לממוצע הסקרים (0). כך הבדלים קטנים נראים. נקודה כהה = בתוך הטווח; נקודה בצבע ההדגשה עם טבעת = מחוץ לטווח
 * (וגם קבוצה וטקסט, לא צבע בלבד). ציר 0 באמצע, "פחות" משמאל ו"יותר" מימין. הטווח הוא הנמוך והגבוה בין הסקרים, לא טווח טעות סטטיסטי.
 */
const COLS = "grid-cols-[minmax(0,1fr)_minmax(7rem,46%)_3.4rem] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4rem]";

/** סימוני הציר: 0 ומשני צידיו במרווח קבוע, עד שבעה סימונים (כדי שייכנסו בטלפון) */
export function devTicks(bound: number): number[] {
  const step = bound <= 3 ? 1 : bound <= 6 ? 2 : Math.ceil(bound / 3);
  const out = [0];
  for (let v = step; v <= bound; v += step) out.unshift(-v), out.push(v);
  return out;
}

function Row({ r, bound }: { r: DevRow; bound: number }) {
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
      <span aria-hidden="true" dir="ltr" className="relative block h-6">
        {ticks.map((v) => (
          <span key={v} className={`absolute inset-y-0 ${v === 0 ? "w-0.5 bg-ink-faint" : "w-px bg-paper-line"}`} style={{ left: `${x(v)}%` }} />
        ))}
        <span className="absolute top-1/2 h-[.35rem] -mt-[.175rem] rounded-full bg-accent/70" style={{ left: `${x(r.lo)}%`, width: `${Math.max(x(r.hi) - x(r.lo), 1)}%` }} />
        <span
          className={`absolute top-1/2 size-[.9rem] -mt-[.45rem] -ml-[.45rem] rounded-full ${r.outside ? "bg-signal ring-2 ring-ink" : "bg-ink shadow-[0_0_0_2px_rgb(var(--paper))]"}`}
          style={{ left: `${x(r.dev)}%` }}
        />
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
  const ticks = devTicks(bound);
  const x = (v: number) => ((v + bound) / (2 * bound)) * 100;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft my-1">
        <span className="inline-flex items-center gap-2"><i className="size-[.8rem] rounded-full bg-ink" />התוצאה בתוך הטווח</span>
        <span className="inline-flex items-center gap-2"><i className="size-[.8rem] rounded-full bg-signal ring-2 ring-ink" />התוצאה מחוץ לטווח</span>
        <span className="inline-flex items-center gap-2"><i className="w-[1.4rem] h-[.3rem] rounded-full bg-accent/70" />הנמוך והגבוה בין הסקרים (לא טווח טעות סטטיסטי)</span>
        <span className="inline-flex items-center gap-2"><i className="w-0.5 h-[.9rem] bg-ink-faint" />0 = ממוצע הסקרים</span>
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
          <ol>{outside.map((r) => <Row key={r.id} r={r} bound={bound} />)}</ol>
        </>
      )}
      {inside.length > 0 && (
        <>
          <h4 className="mt-3 text-sm font-bold">בתוך הטווח ({inside.length})</h4>
          <ol>{inside.map((r) => <Row key={r.id} r={r} bound={bound} />)}</ol>
        </>
      )}
      {notAsked.length > 0 && (
        <p className="mt-3 text-sm text-ink-soft">לא נשאלו בסקרים: {notAsked.map((r) => `${r.name} (בפועל ${r.actual})`).join(", ")}.</p>
      )}
    </div>
  );
}

import Explained from "./Explained";
import { PassBar } from "./homeCharts";
import { seatsIn, summarize, type Poll } from "../lib/data";
import { rng, seatsFmt } from "../lib/format";
import type { HomeRow } from "../lib/home";

/**
 * דף הבית כ"דו-קרב" (הכרעת בעלים 11.10.2026): שתי הרשימות הגדולות פנים מול פנים. המספר הגדול = ממוצע המודל (אותו מספר כמו בתרחישים),
 * מתחתיו בקטן הטווח בסקרים האחרונים (הנמוך והגבוה בין המכונים). מתחת ל"מול": בכמה סקרים כל אחת גבוהה יותר.
 * ניטרלי: בלי צבע לרשימה, הגדולה מודגשת רק במשקל. בבית אין שורת סוג/תאריך/"איך זה חושב?" (`bare`).
 */
export function Duel({ a, b, polls, asOf }: { a: HomeRow; b: HomeRow; polls: Poll[]; asOf: string }) {
  const pairs = polls
    .map((p) => ({ va: seatsIn(p, a.id), vb: seatsIn(p, b.id) }))
    .filter((d): d is { va: number; vb: number } => typeof d.va === "number" && typeof d.vb === "number");
  const nA = pairs.filter((x) => x.va > x.vb).length;
  const nB = pairs.filter((x) => x.vb > x.va).length;
  const rangeOf = (id: string) => {
    const xs = polls.map((p) => seatsIn(p, id)).filter((v): v is number => typeof v === "number");
    return xs.length ? rng(Math.min(...xs), Math.max(...xs)) : "";
  };
  return (
    <section aria-labelledby="duel-h" className="w-full">
      <h2 id="duel-h" className="sr-only">
        שתי הרשימות הגדולות: {a.name} {seatsFmt(a.central)} מנדטים, {b.name} {seatsFmt(b.central)} מנדטים, לפי ממוצע המודל.
        {pairs.length > 0 && ` ${a.name} גבוהה יותר ב-${nA} סקרים, ${b.name} ב-${nB}$.`}
      </h2>
      <Explained
        bare
        kind="תרחיש"
        source="כל הסקרים, מנוע החוק והסקר האחרון של כל מכון"
        asOf={`הסקרים עד ${asOf}`}
        assumption="המספר הגדול: ממוצע המודל. הטווח: הנמוך והגבוה בין המכונים בסקר האחרון של כל אחד. הספירה: בכמה סקרים כל רשימה גבוהה יותר. לא סיכוי."
        methodAnchor="model"
      >
        <div aria-hidden="true" className="relative grid grid-cols-2 border-y-2 border-ink duel-in">
          <Side r={a} range={rangeOf(a.id)} lead={a.central >= b.central} align="start" />
          <Side r={b} range={rangeOf(b.id)} lead={b.central >= a.central} align="end" />
          <span className="absolute inset-y-4 left-1/2 border-s border-paper-line" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-16 h-16 rounded-full bg-ink text-paper leading-none text-center">
            <span className="font-display text-base">מול</span>
            {pairs.length > 0 && (
              <span className="flex items-center justify-center gap-0.5 font-num text-xs tabular" dir="rtl">
                <span>{nA}</span><span>:</span><span>{nB}</span>
              </span>
            )}
          </span>
        </div>
      </Explained>
    </section>
  );
}

function Side({ r, range, lead, align }: { r: HomeRow; range: string; lead: boolean; align: "start" | "end" }) {
  return (
    <div className={`py-5 md:py-8 ${align === "start" ? "pe-10 md:pe-16 text-start" : "ps-10 md:ps-16 text-end"}`}>
      <p className="font-display text-xl md:text-3xl leading-tight">{r.name}</p>
      <p className={`font-num tabular leading-none mt-2 text-[4.5rem] md:text-[8rem] ${lead ? "font-extrabold text-ink" : "font-semibold text-ink-soft"}`}>
        {seatsFmt(r.central)}
      </p>
      {range && <p className="mt-2 text-sm text-ink-soft"><bdi>{range}</bdi> בסקרים האחרונים</p>}
    </div>
  );
}

/** הרשימות שעל קו החסימה, זו לצד זו: כמה מהתרחישים עוברת, ובכמה מהמכונים עוברת בסקר האחרון */
export function ThresholdLine({ rows, polls, asOf }: { rows: HomeRow[]; polls: Poll[]; asOf: string }) {
  const counts = new Map(summarize(polls, rows.map((r) => r.id)).map((s) => [s.id, s]));
  return (
    <section aria-labelledby="edge-h" className="mt-10">
      <div className="flex items-center gap-3">
        <h2 id="edge-h" className="text-2xl font-display leading-tight shrink-0">על קו החסימה</h2>
        <span aria-hidden="true" className="flex-1 border-t-2 border-dashed border-ink-faint" />
        <span className="text-sm font-bold text-ink-soft shrink-0">3.25%</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-ink-soft">כרגע אין רשימה שעוברת רק בחלק מהתרחישים.</p>
      ) : (
        <Explained
          bare
          kind="תרחיש"
          source="כל הסקרים, מנוע החוק ו-20,000 תרחישים; והסקר האחרון של כל מכון"
          asOf={`הסקרים עד ${asOf}`}
          assumption="האחוז הגדול: בכמה מהתרחישים הרשימה עוברת את אחוז החסימה, לא סיכוי. מתחתיו: ספירת המכונים שנתנו לה מנדטים."
          methodAnchor="model"
        >
          <ul className="mt-4 grid grid-cols-2 gap-x-4 md:gap-x-8">
            {rows.map((r) => {
              const s = counts.get(r.id);
              return (
                <li key={r.id} className="border-s-4 border-ink ps-3 md:ps-4 min-w-0">
                  <p className="font-display text-base md:text-xl leading-tight break-words [overflow-wrap:anywhere]">{r.name}</p>
                  <p className="font-num text-4xl md:text-5xl font-extrabold tabular leading-none mt-1">{Math.round(r.pass * 100)}%</p>
                  <p className="text-xs md:text-sm text-ink-soft mt-1">מהתרחישים עוברת</p>
                  <span className="block mt-2"><PassBar pass={r.pass} /></span>
                  {s && <p className="mt-2 text-xs md:text-sm text-ink-soft">אצל {s.passing} מתוך {s.n} מכונים</p>}
                </li>
              );
            })}
          </ul>
        </Explained>
      )}
    </section>
  );
}

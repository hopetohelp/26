import Explained from "./Explained";
import { PassBar } from "./homeCharts";
import { pollsterLabel, seatsIn, summarize, type Poll } from "../lib/data";
import { num, rng, seatsFmt } from "../lib/format";
import type { HomeRow } from "../lib/home";

/**
 * דף הבית כ"דו-קרב" (הכרעת בעלים 11.10.2026): שתי הרשימות הגדולות פנים מול פנים, ומתחתן הרשימות שעל קו החסימה.
 * ניטרלי: בלי צבע לרשימה, הגדולה מודגשת רק במשקל. המספרים הגדולים = ממוצע המודל (אותו מספר כמו בתרחישים),
 * פס המכונים = הסקר האחרון של כל מכון, ספירה בלבד.
 */
export function Duel({ a, b, polls, asOf }: { a: HomeRow; b: HomeRow; polls: Poll[]; asOf: string }) {
  const diffs = polls
    .map((p) => ({ p, va: seatsIn(p, a.id), vb: seatsIn(p, b.id) }))
    .filter((d): d is { p: Poll; va: number; vb: number } => typeof d.va === "number" && typeof d.vb === "number")
    .map((d) => ({ ...d, d: d.va - d.vb }));
  const nA = diffs.filter((x) => x.d > 0).length;
  const nB = diffs.filter((x) => x.d < 0).length;
  const nT = diffs.length - nA - nB;
  return (
    <section aria-labelledby="duel-h" className="w-full">
      <h1 id="duel-h" className="sr-only">
        שתי הרשימות הגדולות: {a.name} {seatsFmt(a.central)} מנדטים, {b.name} {seatsFmt(b.central)} מנדטים, לפי ממוצע המודל.
      </h1>
      <Explained
        kind="תרחיש"
        source="כל הסקרים, מנוע החוק ו-20,000 תרחישים"
        asOf={`הסקרים עד ${asOf}`}
        assumption="המספר הגדול: ממוצע המודל. הטווח: 80% מהתרחישים ליום הבחירות. לא סיכוי."
        methodAnchor="model"
      >
        <div aria-hidden="true" className="relative grid grid-cols-2 border-y-2 border-ink duel-in">
          <Side r={a} lead={a.central >= b.central} align="start" />
          <Side r={b} lead={b.central >= a.central} align="end" />
          <span className="absolute inset-y-4 left-1/2 border-s border-paper-line" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-14 h-14 rounded-full bg-ink text-paper font-display text-lg">
            מול
          </span>
        </div>
      </Explained>

      {diffs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-display leading-tight">
            {a.name} מול {b.name} אצל כל מכון
          </h2>
          <Explained
            kind="סיכום סקרים"
            source="הסקר האחרון של כל מכון ב-14 הימים האחרונים"
            asOf={`הסקרים עד ${asOf}`}
            assumption="ספירה של מה שפורסם: בכל סקר, איזו מהשתיים קיבלה יותר מנדטים. כל מכון נספר פעם אחת."
            methodAnchor="current"
          >
            <p className="mt-1 text-ink-soft">
              {a.name} גבוהה יותר אצל <b className="text-ink">{num(nA)}</b> מכונים, {b.name} אצל <b className="text-ink">{num(nB)}</b>, שוויון אצל{" "}
              <b className="text-ink">{num(nT)}</b>.
            </p>
            <GapStrip a={a.name} b={b.name} diffs={diffs} />
          </Explained>
        </div>
      )}
    </section>
  );
}

function Side({ r, lead, align }: { r: HomeRow; lead: boolean; align: "start" | "end" }) {
  return (
    <div className={`py-5 md:py-8 ${align === "start" ? "pe-10 md:pe-16 text-start" : "ps-10 md:ps-16 text-end"}`}>
      <p className="font-display text-xl md:text-3xl leading-tight">{r.name}</p>
      <p className={`font-num tabular leading-none mt-2 text-[4.5rem] md:text-[8rem] ${lead ? "font-extrabold text-ink" : "font-semibold text-ink-soft"}`}>
        {seatsFmt(r.central)}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        מנדטים · בתרחישים <bdi>{rng(r.lo, r.hi)}</bdi>
      </p>
    </div>
  );
}

/** פס הפער: אמצע = שוויון; כל עיגול = מכון, מוזז לצד הרשימה שקיבלה אצלו יותר, לפי גודל הפער. מכונים עם אותו פער — זה מעל זה */
function GapStrip({ a, b, diffs }: { a: string; b: string; diffs: { p: Poll; d: number }[] }) {
  const max = Math.max(4, ...diffs.map((x) => Math.abs(x.d)));
  const seen = new Map<number, number>();
  const dots = diffs.map((x) => {
    const k = seen.get(x.d) ?? 0;
    seen.set(x.d, k + 1);
    return { ...x, k };
  });
  const rows = Math.max(...dots.map((x) => x.k)) + 1;
  // dir="ltr" כדי שהצד הימני של הפס יהיה הרשימה שמימין בכותרת (a)
  return (
    <figure className="m-0 mt-3">
      <div aria-hidden="true" dir="ltr" className="relative mx-3" style={{ height: `${rows * 16 + 12}px` }}>
        <span className="absolute inset-x-0 bottom-1.5 border-t border-paper-line" />
        <span className="absolute bottom-0 top-0 left-1/2 border-s-2 border-dashed border-ink-faint" />
        {dots.map(({ p, d, k }) => (
          <span
            key={p.id}
            title={`${pollsterLabel(p)}: ${d === 0 ? "שוויון" : `${d > 0 ? a : b} +${Math.abs(d)}`}`}
            className="absolute w-3.5 h-3.5 -translate-x-1/2 rounded-full bg-ink border-2 border-paper"
            style={{ left: `${50 + (d / max) * 50}%`, bottom: `${k * 16}px` }}
          />
        ))}
      </div>
      <div aria-hidden="true" dir="ltr" className="grid grid-cols-3 mt-1 text-xs text-ink-soft">
        <span className="text-left" dir="rtl">{b} גבוהה יותר</span>
        <span className="text-center">שוויון</span>
        <span className="text-right" dir="rtl">{a} גבוהה יותר</span>
      </div>
      <ul className="sr-only">
        {diffs.map(({ p, d }) => <li key={p.id}>{pollsterLabel(p)}: {d === 0 ? "שוויון" : `${d > 0 ? a : b} גבוהה ב-${Math.abs(d)}`}</li>)}
      </ul>
    </figure>
  );
}

/** הרשימות שעל קו החסימה: כמה מהתרחישים עוברת, ובכמה מהמכונים עוברת בסקר האחרון */
export function ThresholdLine({ rows, polls, asOf }: { rows: HomeRow[]; polls: Poll[]; asOf: string }) {
  const counts = new Map(summarize(polls, rows.map((r) => r.id)).map((s) => [s.id, s]));
  return (
    <section aria-labelledby="edge-h" className="mt-12">
      <div className="flex items-center gap-3">
        <h2 id="edge-h" className="text-2xl font-display leading-tight shrink-0">על קו החסימה</h2>
        <span aria-hidden="true" className="flex-1 border-t-2 border-dashed border-ink-faint" />
        <span className="text-sm font-bold text-ink-soft shrink-0">3.25%</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-ink-soft">כרגע אין רשימה שעוברת רק בחלק מהתרחישים.</p>
      ) : (
        <Explained
          kind="תרחיש"
          source="כל הסקרים, מנוע החוק ו-20,000 תרחישים; והסקר האחרון של כל מכון"
          asOf={`הסקרים עד ${asOf}`}
          assumption="האחוז הגדול: בכמה מהתרחישים הרשימה עוברת את אחוז החסימה, לא סיכוי. מתחתיו: ספירת המכונים שנתנו לה מנדטים."
          methodAnchor="model"
        >
          <ul className="mt-4 grid gap-x-8 gap-y-6 md:grid-cols-2">
            {rows.map((r) => {
              const s = counts.get(r.id);
              const pct = Math.round(r.pass * 100);
              return (
                <li key={r.id} className="border-s-4 border-ink ps-4">
                  <p className="font-display text-xl leading-tight">{r.name}</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="font-num text-5xl font-extrabold tabular leading-none">{pct}%</span>
                    <span className="text-sm text-ink-soft">מהתרחישים עוברת</span>
                  </p>
                  <span className="block mt-2"><PassBar pass={r.pass} /></span>
                  {s && <p className="mt-2 text-sm text-ink-soft">עוברת אצל {s.passing} מתוך {s.n} מכונים בסקר האחרון שלהם</p>}
                </li>
              );
            })}
          </ul>
        </Explained>
      )}
    </section>
  );
}

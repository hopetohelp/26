import { listName, mean, pollsterLabel, seatsIn, type Poll, type PartySummary } from "../lib/data";
import { seatsFmt, signed } from "../lib/format";
import { candleProfiles, valueSegs } from "../lib/chartLanguage";
import ChartLegend from "./ChartLegend";
import { axisMaxOf, PollRanges } from "./homeCharts";
import { AxisLabels, MeanDot, ProfileCandle, SmallDot, Track } from "./marks";

/**
 * גרפי "המצב היום" (הכרעת בעלים 11.10.2026): רק הסקר האחרון של כל מכון. ארבע תצוגות מאותם נתונים:
 * לפי מפלגה (כל המפלגות / מפלגה אחת) ולפי מכון (כל המכונים / מכון אחד). אין כאן מודל ואין תרחישים.
 */
const COLS = "grid-cols-[minmax(0,1fr)_2.1rem_minmax(5.5rem,40%)_2.4rem] md:grid-cols-[minmax(0,15rem)_2.6rem_minmax(0,1fr)_3rem]";

const diffText = (v: number, avg: number) => signed(Math.round((v - avg) * 10) / 10);

function Head({ axisMax }: { axisMax: number }) {
  return (
    <div aria-hidden="true" className={`grid ${COLS} gap-x-3 text-xs text-ink-soft mt-1.5`}>
      <div className="col-start-3"><AxisLabels axisMax={axisMax} /></div>
      <div className="text-end">מול הממוצע</div>
    </div>
  );
}

/** מפלגה אחת: שורה לכל מכון, עם ממוצע המכונים בראש */
export function PartyByPollster({ id, polls }: { id: string; polls: Poll[] }) {
  const rows = polls.map((p) => ({ p, v: seatsIn(p, id) }));
  const known = rows.filter((r): r is { p: Poll; v: number } => typeof r.v === "number").sort((a, b) => b.v - a.v);
  const missing = rows.filter((r) => r.v === undefined);
  if (!known.length) return <p className="text-ink-soft">אף מכון לא דיווח על {listName(id)} בסקר האחרון שלו.</p>;
  const avg = mean(known.map((r) => r.v));
  const axisMax = axisMaxOf([{ hi: Math.max(...known.map((r) => r.v)) }]);
  const x = (v: number) => (v / axisMax) * 100;
  return (
    <>
      <ChartLegend entries={[{ kind: "mean", text: "ממוצע המכונים" }, { kind: "dot", text: "הסקר האחרון של המכון" }]} />
      <Head axisMax={axisMax} />
      <ol className="mt-1">
        <li className={`grid ${COLS} items-center gap-x-3 min-h-12 py-1.5 border-t border-paper-line bg-paper-card/60`}>
          <span className="font-bold leading-tight">ממוצע המכונים</span>
          <span className="font-num text-xl font-extrabold tabular">{seatsFmt(Math.round(avg * 10) / 10)}</span>
          <Track axisMax={axisMax}><MeanDot at={x(avg)} /></Track>
          <span />
        </li>
        {known.map(({ p, v }) => (
          <li key={p.id} className={`grid ${COLS} items-center gap-x-3 min-h-12 py-1.5 border-t border-paper-line last:border-b`}>
            <span className="leading-tight">{pollsterLabel(p)}</span>
            <span className="font-num text-xl font-extrabold tabular">{v}</span>
            <Track axisMax={axisMax}><SmallDot at={x(v)} /></Track>
            <span className="font-num text-sm text-ink-soft text-end tabular" dir="ltr">{diffText(v, avg)}</span>
          </li>
        ))}
      </ol>
      {missing.length > 0 && <p className="mt-2 text-sm text-ink-soft">לא דיווחו על הרשימה: {missing.map((r) => pollsterLabel(r.p)).join(", ")}</p>}
    </>
  );
}

/** מכון אחד: שורה לכל מפלגה. הנר = הנמוך והגבוה בין כל המכונים, העיגול הקטן = המכון הנבחר */
export function PollsterByParty({ poll, polls, parties }: { poll: Poll; polls: Poll[]; parties: PartySummary[] }) {
  const data = parties.map((s) => {
    const values = polls.map((p) => seatsIn(p, s.id)).filter((v): v is number => typeof v === "number");
    return { id: s.id, avg: s.mean, lo: s.min, hi: s.max, segs: valueSegs(values), v: seatsIn(poll, s.id) };
  });
  const axisMax = axisMaxOf(data);
  const levels = candleProfiles(data.map((r) => r.segs));
  const x = (v: number) => (v / axisMax) * 100;
  return (
    <>
      <ChartLegend entries={[{ kind: "dot", text: `${pollsterLabel(poll)}` }, { kind: "candle", text: "הנמוך עד הגבוה בין כל המכונים" }]} />
      <Head axisMax={axisMax} />
      <ol className="mt-1">
        {data.map((r, i) => (
          <li key={r.id} className={`grid ${COLS} items-center gap-x-3 min-h-12 py-1.5 border-t border-paper-line last:border-b`}>
            <span className="font-semibold leading-tight">{listName(r.id)}</span>
            <span className="font-num text-xl font-extrabold tabular">{r.v ?? "—"}</span>
            <Track axisMax={axisMax}>
              <ProfileCandle segs={levels[i]} x={x} />
              {r.v !== undefined && <SmallDot at={x(r.v)} />}
            </Track>
            <span className="font-num text-sm text-ink-soft text-end tabular" dir="ltr">{r.v === undefined ? "" : diffText(r.v, r.avg)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-ink-soft">"—" = המכון לא דיווח על הרשימה. "מול הממוצע" = ההפרש ממוצע המכונים, במנדטים.</p>
    </>
  );
}

/** כל המכונים: טבלת חום. כל תא = המנדטים שהמכון נתן; הגוון = כמה מעל (ירוק) או מתחת (אדום) לממוצע המכונים. */
export function PollsterGrid({ polls, parties }: { polls: Poll[]; parties: PartySummary[] }) {
  const tint = (d: number) => {
    const a = Math.min(Math.abs(d) / 4, 1) * 0.45;
    return a < 0.04 ? undefined : { backgroundColor: `rgb(var(${d > 0 ? "--pos" : "--neg"}) / ${a.toFixed(2)})` };
  };
  return (
    <>
      <p className="text-sm text-ink-soft mb-2">
        כל תא: המנדטים שהמכון נתן ברשימה. <span className="font-semibold text-ink">גוון ירוק</span> = מעל ממוצע המכונים,{" "}
        <span className="font-semibold text-ink">גוון אדום</span> = מתחתיו; ככל שהגוון חזק יותר, הפער גדול יותר (4 מנדטים ומעלה = המלא).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">הסקר האחרון של כל מכון, מנדטים לכל רשימה</caption>
          <thead>
            <tr className="border-b border-paper-line">
              <th scope="col" className="text-start py-2 pe-3 min-w-[9rem]">מכון · מזמין</th>
              {parties.map((s) => <th key={s.id} scope="col" className="px-1.5 font-medium whitespace-nowrap">{listName(s.id)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-paper-line font-bold">
              <th scope="row" className="text-start py-2 pe-3">ממוצע המכונים</th>
              {parties.map((s) => <td key={s.id} className="px-1.5 text-center tabular">{seatsFmt(Math.round(s.mean * 10) / 10)}</td>)}
            </tr>
            {polls.map((p) => (
              <tr key={p.id} className="border-b border-paper-line/60">
                <th scope="row" className="text-start py-2 pe-3 font-normal whitespace-nowrap">{pollsterLabel(p)}</th>
                {parties.map((s) => {
                  const v = seatsIn(p, s.id);
                  return (
                    <td key={s.id} className="px-1.5 text-center tabular" style={v === undefined ? undefined : tint(v - s.mean)}>
                      {v ?? "—"}
                      {v !== undefined && <span className="sr-only"> ({diffText(v, s.mean)} מול הממוצע)</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-ink-soft">"—" = המכון לא דיווח על הרשימה.</p>
    </>
  );
}

/** כל המפלגות: הנר = הנמוך עד הגבוה בין המכונים, העיגול = ממוצע המכונים (הרכיב הקיים) */
export function AllParties({ polls, parties }: { polls: Poll[]; parties: PartySummary[] }) {
  return (
    <PollRanges
      rows={parties.map((s) => ({
        id: s.id,
        name: listName(s.id),
        central: Math.round(s.mean * 10) / 10,
        values: polls.map((p) => seatsIn(p, s.id)).filter((x): x is number => typeof x === "number"),
      }))}
    />
  );
}

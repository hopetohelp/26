import SourcePicker from "../components/SourcePicker";
import { useSourcePreference } from "../lib/sourcePreference";
import { SOURCE_OPTIONS, type Selection } from "../lib/dataResolver";
import PersonalBlocTrends from "../components/PersonalBlocTrends";
import { useMemo, useState } from "react";
import { type Series } from "../components/charts";
import CandleTrend from "../components/CandleTrend";
import { Segmented } from "../components/Choice";
import Explained from "../components/Explained";
import { MODEL_AVERAGE } from "../lib/sources";
import { Card, ChartWithTable, Note, Split } from "../components/ui";
import { colorOf } from "../lib/colors";
import { lists2026, listName, POINT_DAYS, POINT_WINDOW, pollsterKey, rollingMean, groupSeatsIn, seatsIn, toTime, usablePolls, type Poll } from "../lib/data";
import { date, dateRange, seatsFmt, signed } from "../lib/format";
import { electionMarkers } from "../lib/electionMarkers";

/** רשימות שנוצרו מאיחוד: לפני מועד האיחוד מוצג סכום המרכיבים בקו מקווקו */
const LINEAGE: Record<string, { parts: string[]; since: string; note: string }> = {
  together: { parts: ["yesh_atid", "bennett"], since: "2026-04-27", note: "לפני 27/4: יש עתיד + בנט 2026" },
  democrats: { parts: ["labor", "meretz"], since: "2024-06-30", note: "לפני 30/6/2024: העבודה + מרצ" },
  joint: { parts: ["hadash_taal", "balad"], since: "2026-06-10", note: 'לפני 10/6: חד"ש-תע"ל + בל"ד' },
};

function withLineage(ps: Poll[]): Poll[] {
  return ps.map((p) => {
    const values = { ...p.values };
    for (const [id, lin] of Object.entries(LINEAGE)) {
      if (values[id]) continue;
      const sum = groupSeatsIn(p, lin.parts);
      if (sum !== null) values[`${id}__lineage`] = { s: sum };
    }
    return { ...p, values };
  });
}

const PERIODS = [
  { id: "2026", label: "מינואר 2026", from: "2026-01-01" },
  { id: "cycle", label: "מאז בחירות 2022", from: "2022-11-15" },
  { id: "90", label: "3 חודשים", from: "" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

const DEFAULT_IDS = ["likud", "yashar", "together", "democrats", "yb", "shas", "utj", "otzma"];
const GOV_LISTS = lists2026.filter((l) => l.gov37).map((l) => l.id);

const withdrawnOf = (id: string) => lists2026.find((l) => l.id === id)?.withdrawn;
/** מועד סיום הסקר האחרון שבו נמדדה הרשימה (מנדטים או אחוז) */
const lastMeasuredTime = (id: string, ps: Poll[]) =>
  ps.reduce((acc, p) => (typeof seatsIn(p, id) === "number" ? Math.max(acc, toTime(p.end)) : acc), 0) || undefined;

/** צבע קבוע לכל רשימה (לפי מקומה ברשימת הרשימות), כך שהמתג, המקרא והקו תמיד באותו צבע */
const colorIndex = (id: string) => Math.max(0, lists2026.findIndex((l) => l.id === id));

export default function Trends() {
  const to = MODEL_AVERAGE.asOf;
  const [period, setPeriod] = useState<PeriodId>("2026");
  const preference = useSourcePreference("trends");
  const [temporary, setTemporary] = useState<Selection | null>(null);
  const selection = temporary ?? preference.selection;
  const option = SOURCE_OPTIONS.find(o => o.id === selection.source);
  const [ids, setIds] = useState<string[]>(DEFAULT_IDS);

  const p0 = PERIODS.find((p) => p.id === period)!;
  const from = p0.from || new Date(toTime(to) - 90 * 86_400_000).toISOString().slice(0, 10);
  const rawSource = useMemo(() => usablePolls.filter((p) => selection.product !== "poll.single" || !!option && p.firm === option.firmId && (!option.seriesId || pollsterKey(p) === option.seriesId)), [selection.product, option]);
  const source = useMemo(() => withLineage(rawSource), [rawSource]);
  // נקודה = 3 ימים בכל האתר, סקר אחד לכל מכון בנקודה (הכרעת בעלים 11.10.2026)
  const days = POINT_WINDOW;
  const minN = 1;

  const series: Series[] = [];
  for (const id of ids) {
    const color = colorOf(id, colorIndex(id));
    // רשימה שפרשה מהמרוץ: הקו נגמר בסקר האחרון שבו נמדדה, ומסומן בשם (הכרעת בעלים 20.10.2026)
    const lastMeasured = withdrawnOf(id) ? lastMeasuredTime(id, source) : undefined;
    const solid = rollingMean(id, from, to, days, POINT_DAYS, source).filter((x) => x.n >= minN && (lastMeasured === undefined || x.t <= lastMeasured));
    const lin = LINEAGE[id];
    if (lin && from < lin.since) {
      const dashed = rollingMean(`${id}__lineage`, from, lin.since, days, POINT_DAYS, source).filter((x) => x.n >= minN);
      if (dashed.length) series.push({ id: `${id}__lineage`, colorId: id, color, name: `${listName(id)} (מרכיבים)`, points: dashed, dashed: true });
    }
    if (solid.length) series.push({ id, color, name: lastMeasured === undefined ? listName(id) : `${listName(id)} (פרשה, הסקר האחרון ${date(new Date(lastMeasured).toISOString())})`, points: solid });
  }
  // תוויות קצה רק לקו המלא של כל רשימה
  const labeled = series.filter((s) => !s.dashed);

  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const rows = labeled
    .map((s) => ({ s, first: s.points[0], last: s.points[s.points.length - 1] }))
    .sort((a, b) => b.last.v - a.last.v);
  const nowOf = (id: string) => rows.find((r) => r.s.id === id)?.last.v;
  const who0 = selection.product === "poll.single" ? option?.label : undefined;

  const PRESETS: { label: string; ids: string[] }[] = [
    { label: "הגדולות", ids: DEFAULT_IDS },
    { label: "הממשלה היוצאת", ids: GOV_LISTS },
    { label: "כל הרשימות", ids: lists2026.map((l) => l.id) },
    { label: "ניקוי", ids: [] },
  ];
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  return (
    <>
      <Split
        title="איך השתנו הסקרים לאורך הזמן?"
        lead="בחרו תקופה ורשימות להשוואה. כל נקודה מסכמת את הסקר האחרון של כל מכון ומזמין ב-14 הימים שקדמו לה."
        primary={
          <Card>
            <div className="c-trend-controls space-y-4">
              <div>
                <div id="trend-period" className="text-sm font-bold mb-1.5">תקופה</div>
                <Segmented label="תקופה" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} />
              </div>
              <SourcePicker screen="trends" selection={selection} onChange={setTemporary} notice={preference.notice} />
              <details className="c-trend-parties"><summary>בחירת רשימות להשוואה · {ids.length} נבחרו</summary><fieldset>
                <legend className="text-sm font-bold mb-1.5">רשימות ({ids.length})</legend>
                <div className="flex flex-wrap gap-1.5 mb-2.5" role="group" aria-label="קיצורי בחירה">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setIds(p.ids)}
                      aria-pressed={sameSet(ids, p.ids) && p.ids.length > 0}
                      className={`min-h-[34px] px-3 rounded-full text-sm ${sameSet(ids, p.ids) && p.ids.length > 0 ? "bg-ink text-paper-card font-bold" : "ring-[1.5px] ring-inset ring-ink/[.35] font-semibold"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lists2026.map((l) => {
                    const on = ids.includes(l.id);
                    const now = nowOf(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => toggle(l.id)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-full text-sm ${on ? "bg-paper-card font-bold ring-2 ring-inset ring-ink" : "ring-[1.5px] ring-inset ring-ink/[.35] text-ink-soft"}`}
                      >
                        <i className="size-2.5 rounded-full" style={{ background: on ? colorOf(l.id, colorIndex(l.id)) : "transparent", boxShadow: on ? undefined : `inset 0 0 0 1.5px ${colorOf(l.id, colorIndex(l.id))}` }} />
                        {l.name}
                        {l.withdrawn && <span className="text-xs text-ink-soft">פרשה</span>}
                        {on && now !== undefined && <span className="font-num tabular text-xs text-ink-soft">{seatsFmt(now)}</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset></details>
            </div>
          </Card>
        }
        secondary={
          <>
            <Card>
              <Explained
                kind="סיכום סקרים"
                source="טבלאות הסקרים בוויקיפדיה האנגלית (עם קישור למקור של כל סקר)"
                asOf={`הסקרים עד ${date(to)}`}
                assumption={
                  who0
                    ? "מכון בודד: נקודה כל 3 ימים: ממוצע הסקר האחרון של כל מכון מ-14 הימים שמסתיימים בה. בלי סקר של המכון ב-14 הימים האלה — אין נקודה."
                    : "כל המכונים: נקודה כל 3 ימים: ממוצע הסקר האחרון של כל מכון מ-14 הימים שמסתיימים בה. הנר הוא הנמוך והגבוה בין הסקרים בנקודה (טווח מלא), והעובי לפי כמות הסקרים. ממוצע תיאורי . לא מודל."
                }
                methodAnchor="trends"
              >
                <ChartWithTable
                  summary={`${labeled.length} רשימות, ${dateRange(from, to)}${who0 ? `, ${who0}` : ", כל המכונים"}.`}
                  chart={
                    labeled.length ? (
                      // הגרף האחיד: רשימה אחת — נרות; כמה רשימות — אותו רכיב בלי נרות, ולחיצה על נקודה בקו מציגה את החלון של הרשימה
                      <CandleTrend title={labeled.length === 1 ? `מגמת המנדטים: ${labeled[0].name}` : "מגמת המנדטים לפי רשימה"} series={series} windowDays={days} markers={labeled.flatMap(x => electionMarkers([x.id], labeled.length === 1 ? undefined : x.id))} />
                    ) : (
                      <p className="text-ink-soft py-8 text-center">אין מספיק סקרים בתקופה ובמכון שנבחרו. בחרו תקופה ארוכה יותר או כל המכונים.</p>
                    )
                  }
                  table={
                    <table className="text-sm w-full">
                      <caption className="sr-only">ערך התחלה, סוף ושינוי לכל רשימה בתקופה</caption>
                      <thead>
                        <tr className="text-right border-b border-paper-line">
                          <th scope="col" className="py-1">רשימה</th>
                          <th scope="col">בתחילת התקופה</th>
                          <th scope="col">היום</th>
                          <th scope="col">הנמוך והגבוה בחלון האחרון</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ s, first, last }) => (
                          <tr key={s.id} className="border-b border-paper-line/60">
                            <th scope="row" className="text-right py-1 font-medium">{s.name}</th>
                            <td className="tabular-nums">{seatsFmt(first.v)} ({date(new Date(first.t).toISOString())})</td>
                            <td className="tabular-nums">{seatsFmt(last.v)} ({date(new Date(last.t).toISOString())})</td>
                            <td className="tabular-nums">{last.lo !== undefined && last.hi !== undefined ? (last.lo === last.hi ? seatsFmt(last.lo) : `${seatsFmt(last.lo)}–${seatsFmt(last.hi)}`) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                />
              </Explained>
              {rows.length > 0 && (
                <ul className="mt-4 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="היום ושינוי מתחילת התקופה">
                  {rows.map(({ s, first, last }) => {
                    const d = Math.round((last.v - first.v) * 10) / 10;
                    return (
                      <li key={s.id} className="flex items-baseline gap-2 border-t border-paper-line py-1.5 text-sm">
                        <i className="size-2.5 rounded-full shrink-0 self-center" style={{ background: s.color }} />
                        <span className="grow font-semibold">{s.name}</span>
                        <b className="font-num tabular text-lg">{seatsFmt(last.v)}</b>
                        <span className="font-num tabular text-ink-soft w-12 text-end"><bdi dir="ltr">{signed(d)}</bdi></span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Note>
                השינוי הוא מתחילת התקופה שנבחרה. קו מקווקו: לפני שהרשימה התאחדה — סכום המנדטים של מרכיביה ({Object.values(LINEAGE).map((l) => l.note).join(" · ")}). זה סכום של שתי
                רשימות נפרדות, לא תמיכה ברשימה המאוחדת.
              </Note>
            </Card>
            <PersonalBlocTrends source={rawSource} from={from} to={to} days={days} minN={minN} />
          </>
        }
      />
    </>
  );
}

import PersonalBlocTrends from "../components/PersonalBlocTrends";
import { useMemo, useState } from "react";
import { TrendChart, type Series } from "../components/charts";
import { Segmented } from "../components/Choice";
import Explained from "../components/Explained";
import { POLL_AVERAGE } from "../lib/sources";
import { Card, ChartWithTable, Note, Split } from "../components/ui";
import { colorOf } from "../lib/colors";
import { lists2026, listName, POINT_DAYS, pollsterKey, pollsterLabel, rollingMean, seatsIn, toTime, usablePolls, type Poll } from "../lib/data";
import { date, dateRange, seatsFmt, signed } from "../lib/format";

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
      const parts = lin.parts.map((x) => seatsIn(p, x));
      if (parts.every((x) => typeof x === "number")) values[`${id}__lineage`] = { s: parts.reduce((a, b) => a! + b!, 0) };
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

/** צבע קבוע לכל רשימה (לפי מקומה ברשימת הרשימות), כך שהמתג, המקרא והקו תמיד באותו צבע */
const colorIndex = (id: string) => Math.max(0, lists2026.findIndex((l) => l.id === id));

export default function Trends() {
  const to = POLL_AVERAGE.asOf;
  const [period, setPeriod] = useState<PeriodId>("2026");
  const [who, setWho] = useState("");
  const [ids, setIds] = useState<string[]>(DEFAULT_IDS);

  const pollsters = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of usablePolls) if (p.end >= "2026-01-01") m.set(pollsterKey(p), pollsterLabel(p));
    return [...m.entries()];
  }, []);

  const p0 = PERIODS.find((p) => p.id === period)!;
  const from = p0.from || new Date(toTime(to) - 90 * 86_400_000).toISOString().slice(0, 10);
  const rawSource = useMemo(() => usablePolls.filter((p) => !who || pollsterKey(p) === who), [who]);
  const source = useMemo(() => withLineage(rawSource), [rawSource]);
  // נקודה = 3 ימים בכל האתר, סקר אחד לכל מכון בנקודה (הכרעת בעלים 11.10.2026)
  const days = POINT_DAYS;
  const minN = 1;

  const series: Series[] = [];
  for (const id of ids) {
    const color = colorOf(id, colorIndex(id));
    const solid = rollingMean(id, from, to, days, days, source).filter((x) => x.n >= minN);
    const lin = LINEAGE[id];
    if (lin && from < lin.since) {
      const dashed = rollingMean(`${id}__lineage`, from, lin.since, days, days, source).filter((x) => x.n >= minN);
      if (dashed.length) series.push({ id: `${id}__lineage`, colorId: id, color, name: `${listName(id)} (מרכיבים)`, points: dashed, dashed: true });
    }
    if (solid.length) series.push({ id, color, name: listName(id), points: solid });
  }
  // תוויות קצה רק לקו המלא של כל רשימה
  const labeled = series.filter((s) => !s.dashed);
  const yMax = Math.max(10, Math.ceil(Math.max(...series.flatMap((s) => s.points.map((p) => p.v)), 0) / 5) * 5 + 5);

  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const rows = labeled
    .map((s) => ({ s, first: s.points[0], last: s.points[s.points.length - 1] }))
    .sort((a, b) => b.last.v - a.last.v);
  const nowOf = (id: string) => rows.find((r) => r.s.id === id)?.last.v;
  const who0 = who ? pollsters.find(([k]) => k === who)?.[1] : undefined;

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
        title="מגמות"
        lead="ממוצע מתגלגל של המנדטים בסקרים שפורסמו. בקו: בכל נקודה הממוצע של כל הסקרים מהחלון שקדם לה, ובסופו נר של הנמוך והגבוה. בנרות: נר לכל חלון."
        primary={
          <Card>
            <div className="space-y-4">
              <div>
                <div id="trend-period" className="text-sm font-bold mb-1.5">תקופה</div>
                <Segmented label="תקופה" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} />
              </div>
              <label className="block">
                <span className="block text-sm font-bold mb-1.5">מכון</span>
                <select className="w-full min-h-[44px] rounded-theme border border-ink/[.35] bg-paper-card px-3 text-sm" value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="">כל המכונים</option>
                  {pollsters.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
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
                        {on && now !== undefined && <span className="font-num tabular text-xs text-ink-soft">{seatsFmt(now)}</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
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
                  who
                    ? "מכון בודד: נקודה כל 3 ימים: ממוצע הסקרים של 3 הימים שמסתיימים בה, והסקר האחרון בלבד של כל מכון באותם ימים. בלי סקר של המכון באותם ימים — אין נקודה."
                    : "כל המכונים: נקודה כל 3 ימים: ממוצע הסקרים של 3 הימים שמסתיימים בה, והסקר האחרון בלבד של כל מכון באותם ימים. הנר הוא הנמוך והגבוה בין הסקרים בנקודה (טווח מלא), והעובי לפי כמות הסקרים. ממוצע תיאורי — לא מודל ולא תחזית."
                }
                methodAnchor="trends"
              >
                <ChartWithTable
                  summary={`${labeled.length} רשימות, ${dateRange(from, to)}${who0 ? `, ${who0}` : ", כל המכונים"}.`}
                  chart={
                    labeled.length ? (
                      <TrendChart series={series} from={toTime(from)} to={toTime(to)} yMax={yMax} title="מגמת המנדטים לפי רשימה" windowText={{ days, label: `${days} הימים` }} />
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

import PersonalBlocTrends from "../components/PersonalBlocTrends";
import { useMemo, useState } from "react";
import { TrendChart, type Series } from "../components/charts";
import Explained from "../components/Explained";
import { Card, ChartWithTable, Note, PageTitle } from "../components/ui";
import { lastPollDate, lists2026, listName, pollsterKey, pollsterLabel, rollingMedian, seatsIn, toTime, usablePolls, type Poll } from "../lib/data";
import { date, dateLong, seatsFmt } from "../lib/format";

/** רשימות שנוצרו מאיחוד: לפני מועד האיחוד מוצג סכום המרכיבים בקו מקווקו */
const LINEAGE: Record<string, { parts: string[]; since: string; note: string }> = {
  together: { parts: ["yesh_atid", "bennett"], since: "2026-04-27", note: "לפני 27.4.2026: יש עתיד + בנט 2026" },
  democrats: { parts: ["labor", "meretz"], since: "2024-06-30", note: "לפני 30.6.2024: העבודה + מרצ" },
  joint: { parts: ["hadash_taal", "balad"], since: "2026-06-10", note: 'לפני 10.6.2026: חד"ש-תע"ל + בל"ד' },
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
  { id: "90", label: "שלושת החודשים האחרונים", from: "" },
];

export default function Trends() {
  const to = lastPollDate();
  const [period, setPeriod] = useState("2026");
  const [who, setWho] = useState("");
  const defaultIds = ["likud", "yashar", "together", "democrats", "yb", "shas", "utj", "otzma"];
  const [ids, setIds] = useState<string[]>(defaultIds);

  const pollsters = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of usablePolls) if (p.end >= "2026-01-01") m.set(pollsterKey(p), pollsterLabel(p));
    return [...m.entries()];
  }, []);

  const p0 = PERIODS.find((p) => p.id === period)!;
  const from = p0.from || new Date(toTime(to) - 90 * 86_400_000).toISOString().slice(0, 10);
  const source = useMemo(() => withLineage(usablePolls.filter((p) => !who || pollsterKey(p) === who)), [who]);
  const days = who ? 45 : 14;
  const minN = who ? 1 : 3;

  const series: Series[] = [];
  for (const id of ids) {
    const solid = rollingMedian(id, from, to, days, 3, source).filter((x) => x.n >= minN);
    const lin = LINEAGE[id];
    if (lin && from < lin.since) {
      const dashed = rollingMedian(`${id}__lineage`, from, lin.since, days, 3, source).filter((x) => x.n >= minN);
      if (dashed.length) series.push({ id: `${id}__lineage`, colorId: id, name: `${listName(id)} (מרכיבים)`, points: dashed, dashed: true });
    }
    if (solid.length) series.push({ id, name: listName(id), points: solid });
  }
  // תוויות קצה רק לקו המלא של כל רשימה
  const labeled = series.filter((s) => !s.dashed);
  const dots = source
    .filter((p) => p.end >= from && p.end <= to)
    .flatMap((p) => ids.map((id) => ({ id, t: toTime(p.end), v: seatsIn(p, id) })).filter((d) => typeof d.v === "number")) as { id: string; t: number; v: number }[];
  const yMax = Math.max(10, Math.ceil(Math.max(...series.flatMap((s) => s.points.map((p) => p.v)), 0) / 5) * 5 + 5);

  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const tableRows = labeled.map((s) => ({ name: s.name, last: s.points[s.points.length - 1], first: s.points[0] }));

  return (
    <>
      <PageTitle lead="חציון מתגלגל של המנדטים בסקרים שפורסמו: בכל נקודה — החציון של כל הסקרים מ-14 הימים שקדמו לה. הנקודות הבהירות הן הסקרים עצמם.">
        מגמות
      </PageTitle>

      <Card>
        <div className="flex flex-wrap gap-4 items-end mb-3">
          <label className="flex flex-col text-sm">
            תקופה
            <select className="border border-paper-line rounded px-2 py-1 mt-1" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            מכון
            <select className="border border-paper-line rounded px-2 py-1 mt-1" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">כל המכונים</option>
              {pollsters.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="mb-4">
          <legend className="text-sm font-bold mb-1">רשימות</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {lists2026.map((l) => (
              <label key={l.id} className="text-sm flex items-center gap-1">
                <input type="checkbox" checked={ids.includes(l.id)} onChange={() => toggle(l.id)} />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>

        <Explained
          kind="סיכום סקרים"
          source="טבלאות הסקרים בוויקיפדיה האנגלית (עם קישור למקור של כל סקר)"
          asOf={`הסקרים עד ${dateLong(to)}`}
          assumption={who ? "מכון בודד: חלון של 45 יום, כדי שיהיו מספיק סקרים." : "כל המכונים: חציון של הסקרים ב-14 הימים האחרונים, לפחות 3 סקרים לנקודה. ממוצע תיאורי — לא מודל ולא תחזית."}
          methodAnchor="trends"
        >
          <ChartWithTable
            summary={`${labeled.length} רשימות, ${date(from)}–${date(to)}${who ? `, ${pollsters.find(([k]) => k === who)?.[1] ?? ""}` : ", כל המכונים"}.`}
            chart={<TrendChart series={series} dots={dots} from={toTime(from)} to={toTime(to)} yMax={yMax} title="מגמת המנדטים לפי רשימה" />}
            table={
              <table className="text-sm w-full">
                <caption className="sr-only">ערך התחלה וסוף לכל רשימה בתקופה</caption>
                <thead>
                  <tr className="text-right border-b border-paper-line">
                    <th scope="col" className="py-1">רשימה</th>
                    <th scope="col">בתחילת התקופה</th>
                    <th scope="col">היום</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.name} className="border-b border-paper-line/60">
                      <th scope="row" className="text-right py-1 font-medium">{r.name}</th>
                      <td className="tabular-nums">{seatsFmt(r.first.v)} ({date(new Date(r.first.t).toISOString())})</td>
                      <td className="tabular-nums">{seatsFmt(r.last.v)} ({date(new Date(r.last.t).toISOString())})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </Explained>
        <Note>
          קו מקווקו: לפני שהרשימה התאחדה — סכום המנדטים של מרכיביה ({Object.values(LINEAGE).map((l) => l.note).join(" · ")}). זה סכום של שתי
          רשימות נפרדות, לא תמיכה ברשימה המאוחדת.
        </Note>
      </Card>
      <PersonalBlocTrends source={source} from={from} to={to} days={days} minN={minN} />
    </>
  );
}

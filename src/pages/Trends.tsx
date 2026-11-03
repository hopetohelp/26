import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type Series } from "../components/charts";
import CandleTrend from "../components/CandleTrend";
import { Segmented } from "../components/Choice";
import Select from "../components/Select";
import Explained from "../components/Explained";
import { MODEL_AVERAGE, SOURCE_OPTIONS } from "../lib/dataResolver";
import { Card, ChartWithTable, Note } from "../components/ui";
import { colorOf } from "../lib/colors";
import { lists2026, listName, POINT_DAYS, POINT_WINDOW, pollsterKey, rollingMean, groupSeatsIn, seatsIn, toTime, usablePolls, type Poll } from "../lib/data";
import { rollingBlocMean } from "../lib/blocTrend";
import { SIMPLE_BLOCS } from "../lib/simpleSources";
import { ELECTION_DAY, results2026 } from "../lib/guessAccuracyData";
import { date, seatsFmt } from "../lib/format";
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

/** תקופות (הכרעת בעלים 03.11.2026): הגשת הרשימות — quality.listSubmission; פיזור הכנסת — 17.7.2026 (ויקיפדיה, טבלת הסקרים) */
const PERIODS = [
  { id: "lists", label: "מהגשת הרשימות", from: "2026-09-08" },
  { id: "dissolution", label: "מפיזור הכנסת", from: "2026-07-17" },
  { id: "k25", label: "מבחירות 22", from: "2022-11-01" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

/** מכונים בלבד, ואחרי קו הפרדה — כל צירוף מכון ומזמין */
const FIRMS = [...new Map(usablePolls.map((p) => [p.firm, p.firmHe])).entries()].sort((a, b) => a[1].localeCompare(b[1], "he"));
const SERIES = SOURCE_OPTIONS.filter((o) => o.seriesId);
const pollFilter = (key: string) => (p: Poll) =>
  key === "all" || (key.startsWith("firm:") ? p.firm === key.slice(5) : pollsterKey(p) === key.slice(7));

/** רשימות לפי תוצאות 2026: נכנסו (לפי מנדטים), התמודדו ולא נכנסו, וכל השאר */
const seats26 = results2026.seats as Record<string, number>;
const ENTERED = Object.keys(seats26).filter((id) => seats26[id] > 0).sort((a, b) => seats26[b] - seats26[a]);
const RAN_OUT = Object.keys(results2026.votes ?? seats26).filter((id) => !seats26[id]);
const OTHERS = lists2026.map((l) => l.id).filter((id) => !ENTERED.includes(id) && !RAN_OUT.includes(id));
const ALL_LISTS = [...ENTERED, ...RAN_OUT, ...OTHERS];

const colorIndex = (id: string) => Math.max(0, lists2026.findIndex((l) => l.id === id));
const withdrawnOf = (id: string) => lists2026.find((l) => l.id === id)?.withdrawn;
const lastMeasuredTime = (id: string, ps: Poll[]) =>
  ps.reduce((acc, p) => (typeof seatsIn(p, id) === "number" ? Math.max(acc, toTime(p.end)) : acc), 0) || undefined;

/** המקרא — פעם אחת, בגרף הראשון (הכרעת בעלים 03.11.2026) */
const LEGEND = [
  { kind: "candle" as const, text: "הטווח החכם - ככל שכמות הסקרים יורדת הצבע נחלש (סקרי המכונים ב-14 הימים האחרונים, בכל 3 ימים)" },
  { kind: "line" as const, text: "הקו מחבר את הממוצעים של הנקודות" },
  { kind: "diamond" as const, text: "מעוין בסוף הגרף לתוצאות אמת" },
];

type Group = { label: string; ids: string[] };
type Item = { id: string; label: string };

/** בחירה מרובה ברשימה נפתחת: קבוצות (מסמנות/מבטלות את כולן) ואחריהן פריטים בודדים */
function MultiPick({ label, groups, sections, value, onChange }: { label: string; groups: Group[]; sections: Item[][]; value: string[]; onChange: (ids: string[]) => void }) {
  const has = (ids: string[]) => ids.length > 0 && ids.every((id) => value.includes(id));
  const toggleGroup = (ids: string[]) => onChange(has(ids) ? value.filter((x) => !ids.includes(x)) : [...new Set([...value, ...ids])]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const named = groups.find((g) => g.ids.length === value.length && has(g.ids));
  const summary = named ? named.label : value.length === 1 ? sections.flat().find((i) => i.id === value[0])?.label : `${value.length} נבחרו`;
  const row = "flex items-center gap-2 min-h-[40px] px-3 cursor-pointer hover:bg-paper";
  // לחיצה מחוץ לרשימה סוגרת אותה (הכרעת בעלים 03.11.2026)
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const off = (e: PointerEvent) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, []);
  return (
    <details ref={ref} className="c-multipick relative">
      <summary aria-label={label} className="flex items-center justify-between gap-2 h-[50px] px-3 rounded-theme bg-paper border-[1.5px] border-ink/[.35] text-sm font-semibold cursor-pointer list-none">
        <span className="truncate">{summary}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-ink-soft shrink-0"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <fieldset className="absolute z-20 mt-1 w-full min-w-[220px] max-h-[60vh] overflow-y-auto rounded-theme bg-paper-card border border-paper-line shadow-lg py-1 text-sm">
        <legend className="sr-only">{label}</legend>
        {groups.map((g) => (
          <label key={g.label} className={`${row} font-bold`}><input type="checkbox" checked={has(g.ids)} onChange={() => toggleGroup(g.ids)} />{g.label}</label>
        ))}
        {sections.map((items, si) => items.length > 0 && (
          <div key={si} className="border-t border-paper-line">
            {items.map((i) => <label key={i.id} className={row}><input type="checkbox" checked={value.includes(i.id)} onChange={() => toggle(i.id)} />{i.label}</label>)}
          </div>
        ))}
      </fieldset>
    </details>
  );
}

export default function Trends() {
  // הסקרים עד יום הבחירות; תוצאות האמת יומיים אחריו (electionMarkers)
  const to = MODEL_AVERAGE.asOf < ELECTION_DAY ? MODEL_AVERAGE.asOf : ELECTION_DAY;
  const [period, setPeriod] = useState<PeriodId>("lists");
  const [poll, setPoll] = useState("all");
  const [asTable, setAsTable] = useState(false);
  const [ids, setIds] = useState<string[]>(ENTERED);
  const [blocIds, setBlocIds] = useState<string[]>(SIMPLE_BLOCS.map((b) => b.id));

  const from = PERIODS.find((p) => p.id === period)!.from;
  const rawSource = useMemo(() => usablePolls.filter(pollFilter(poll)), [poll]);
  const source = useMemo(() => withLineage(rawSource), [rawSource]);
  const days = POINT_WINDOW;
  // קפסולות רק בכל המכונים ובבחירה אחת; אחרת — קו מגמה רגיל
  const capsules = (n: number) => poll === "all" && n === 1;

  const series: Series[] = [];
  for (const id of ids) {
    const color = colorOf(id, colorIndex(id));
    const lastMeasured = withdrawnOf(id) ? lastMeasuredTime(id, source) : undefined;
    const solid = rollingMean(id, from, to, days, POINT_DAYS, source).filter((x) => x.n >= 1 && (lastMeasured === undefined || x.t <= lastMeasured));
    const lin = LINEAGE[id];
    if (lin && from < lin.since && !capsules(ids.length)) {
      const dashed = rollingMean(`${id}__lineage`, from, lin.since, days, POINT_DAYS, source).filter((x) => x.n >= 1);
      if (dashed.length) series.push({ id: `${id}__lineage`, colorId: id, color, name: `${listName(id)} (מרכיבים)`, points: dashed, dashed: true });
    }
    if (solid.length) series.push({ id, color, name: lastMeasured === undefined ? listName(id) : `${listName(id)} (פרשה, הסקר האחרון ${date(new Date(lastMeasured).toISOString())})`, points: solid });
  }
  const labeled = series.filter((s) => !s.dashed);

  const blocs = SIMPLE_BLOCS.filter((b) => blocIds.includes(b.id)).map((b) => ({ id: b.id, name: b.name, lists: [...b.lists], target: null }));
  const blocData = useMemo(() => rollingBlocMean(blocs, rawSource, from, to, days, 1), [blocs.map((b) => b.id).join(), rawSource, from, to, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocSeries: Series[] = blocData.filter((b) => b.points.length).map((b) => ({ id: `bloc-${b.id}`, name: b.name, color: colorOf(b.id, SIMPLE_BLOCS.findIndex((x) => x.id === b.id)), points: b.points }));

  const empty = <p className="text-ink-soft py-8 text-center">אין סקרים בתקופה ובבחירה הזו.</p>;
  const assumption = "נקודה כל 3 ימים: ממוצע הסקר האחרון של כל מכון ומזמין מ-14 הימים שמסתיימים בה. בכל המכונים ובבחירה אחת — קפסולה מ-0 עד הגבוה בין הסקרים בנקודה. ממוצע תיאורי, לא מודל.";

  const table = (rows: Series[]) => (
    <table className="text-sm w-full">
      <thead>
        <tr className="text-right border-b border-paper-line">
          <th scope="col" className="py-1">שם</th>
          <th scope="col">בתחילת התקופה</th>
          <th scope="col">בסוף</th>
          <th scope="col">הנמוך והגבוה בסוף</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const first = s.points[0], last = s.points[s.points.length - 1];
          return (
            <tr key={s.id} className="border-b border-paper-line/60">
              <th scope="row" className="text-right py-1 font-medium">{s.name}</th>
              <td className="tabular-nums">{seatsFmt(first.v)} ({date(new Date(first.t).toISOString())})</td>
              <td className="tabular-nums">{seatsFmt(last.v)} ({date(new Date(last.t).toISOString())})</td>
              <td className="tabular-nums">{last.lo !== undefined && last.hi !== undefined ? (last.lo === last.hi ? seatsFmt(last.lo) : `${seatsFmt(last.lo)}–${seatsFmt(last.hi)}`) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="c-trend-bar flex flex-wrap gap-2 items-center" role="group" aria-label="הגדרות המגמות">
          <Segmented className="grow basis-[280px]" label="תקופה" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} />
          <Select inline id="trend-poll" label="סקר" value={poll} onChange={setPoll} className="grow basis-[160px]">
            <option value="all">ממוצע</option>
            <optgroup label="מכונים">{FIRMS.map(([f, he]) => <option key={f} value={`firm:${f}`}>{he}</option>)}</optgroup>
            <optgroup label="מכון ומזמין">{SERIES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>
          </Select>
          <Segmented className="basis-[140px]" label="תצוגה" value={asTable ? "table" : "chart"} onChange={(v) => setAsTable(v === "table")} options={[{ id: "chart", label: "גרף" }, { id: "table", label: "טבלה" }]} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-bold grow">מפלגות</h3>
          <div className="basis-[200px]">
            <MultiPick
              label="מפלגות"
              groups={[{ label: "כולם", ids: ALL_LISTS }, { label: "נכנסו לכנסת", ids: ENTERED }, ...(OTHERS.length ? [{ label: "כל השאר", ids: OTHERS }] : [])]}
              sections={[ENTERED.map((id) => ({ id, label: listName(id) })), RAN_OUT.map((id) => ({ id, label: listName(id) }))]}
              value={ids}
              onChange={setIds}
            />
          </div>
        </div>
        <Explained bare kind="סיכום סקרים" source="טבלאות הסקרים בוויקיפדיה האנגלית (עם קישור למקור של כל סקר)" asOf={`הסקרים עד ${date(to)}`} assumption={assumption} methodAnchor="trends">
          <ChartWithTable
            asTable={asTable}
            chart={labeled.length ? (
              <CandleTrend
                title={labeled.length === 1 ? `מגמת המנדטים: ${labeled[0].name}` : "מגמת המנדטים לפי רשימה"}
                series={capsules(ids.length) ? labeled : series}
                forceLine={!capsules(ids.length)}
                zeroBase={capsules(ids.length)}
                windowDays={days}
                resultDots
                legendEntries={LEGEND}
                markers={labeled.flatMap((x) => electionMarkers([x.id], labeled.length === 1 ? undefined : x.id).filter((m) => !m.asMean))}
              />
            ) : empty}
            table={table(labeled)}
          />
        </Explained>
        {series.some((s) => s.dashed) && (
          <Note>קו מקווקו: לפני שהרשימה התאחדה — סכום המנדטים של מרכיביה ({Object.values(LINEAGE).map((l) => l.note).join(" · ")}).</Note>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-bold grow">גושים</h3>
          <div className="basis-[200px]">
            <MultiPick
              label="גושים"
              groups={[{ label: "כולם", ids: SIMPLE_BLOCS.map((b) => b.id) }]}
              sections={[SIMPLE_BLOCS.map((b) => ({ id: b.id, label: b.name }))]}
              value={blocIds}
              onChange={setBlocIds}
            />
          </div>
        </div>
        <Explained bare kind="סיכום סקרים" source="הסקרים שנבחרו" asOf={date(to)} assumption="סוכמים בתוך כל סקר ורק אז מחשבים ממוצע. סקר שסקר לפחות מפלגה אחת מהגוש נכנס; מפלגה שלא נסקרה נספרת 0." methodAnchor="personal-blocs">
          <ChartWithTable
            asTable={asTable}
            chart={blocSeries.length ? (
              <CandleTrend
                title={blocSeries.length === 1 ? `ממוצע מנדטים: ${blocSeries[0].name}` : "מגמת המנדטים לפי גוש"}
                series={blocSeries}
                majority={61}
                forceLine={!capsules(blocSeries.length)}
                zeroBase={capsules(blocSeries.length)}
                windowDays={days}
                resultDots
                hideLegend
                markers={blocSeries.flatMap((x) => electionMarkers(blocs.find((b) => `bloc-${b.id}` === x.id)?.lists ?? [], blocSeries.length === 1 ? undefined : x.id).filter((m) => !m.asMean))}
              />
            ) : empty}
            table={table(blocSeries)}
          />
        </Explained>
      </Card>
      <p className="text-center text-sm"><Link to="/method#trends" className="font-semibold">איך זה חושב?</Link></p>
    </div>
  );
}

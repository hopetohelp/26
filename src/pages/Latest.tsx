import { useMemo } from "react";
import CandleTrend from "../components/CandleTrend";
import { PollsterGrid } from "../components/latestCharts";
import { Card } from "../components/ui";
import { IDS } from "./guess/model";
import { useCrowdDashboard } from "../lib/sources";
import { SIMPLE_BLOCS, simpleValue } from "../lib/simpleSources";
import { CURRENT_POLLS, MODEL_AVERAGE } from "../lib/dataResolver";
import { activeLists2026, exitPolls, exitSeats, groupSeatsIn, passesInMost, pollsterLabel, summarize, usablePolls } from "../lib/data";
import { rollingBlocMean } from "../lib/blocTrend";
import { electionMarkers } from "../lib/electionMarkers";
import { hasResults, results2026 } from "../lib/guessAccuracyData";
import { seatsFmt } from "../lib/format";
import { FocusFoot, LegendCapsule, LegendLine, PartyChart, SourceBar, orderedLists, useSimpleSource } from "./simple/shared";

const NETANYAHU = SIMPLE_BLOCS.find(b => b.id === "netanyahu")!;
const FROM = "2026-01-01";

/** "אחרונים" (הכרעת בעלים 28.10.2026): גרף הרשימות עם מתג המכונים, מגמת גוש נתניהו, השוואת המכונים, וטבלת גושים עם המדגמים ותוצאות האמת */
export default function Latest() {
  const source = useSimpleSource();
  const crowd = Object.fromEntries((useCrowdDashboard().dashboard?.seats?.full ?? []).map(r => [r.list, r.mean]));
  const values = Object.fromEntries(IDS.map(id => [id, simpleValue(source.selection, [id])]));
  const to = MODEL_AVERAGE.asOf;
  const trend = useMemo(() => rollingBlocMean([{ id: NETANYAHU.id, name: NETANYAHU.name, lists: [...NETANYAHU.lists], target: null }], usablePolls, FROM, to)[0], [to]);
  const parties = summarize(CURRENT_POLLS, activeLists2026.map(l => l.id)).filter(passesInMost);
  const rows: { key: string; label: string; kind: string; cells: (number | null)[] }[] = [
    ...CURRENT_POLLS.map(p => ({ key: p.id, label: pollsterLabel(p), kind: "סקר אחרון", cells: SIMPLE_BLOCS.map(b => groupSeatsIn(p, [...b.lists])) })),
    ...exitPolls.map(p => ({ key: p.id, label: p.publisherHe, kind: "מדגם 22:00", cells: SIMPLE_BLOCS.map(b => exitSeats(p, [...b.lists])) })),
    ...(hasResults() ? [{ key: "results", label: "תוצאות אמת", kind: `נספרו ${results2026.counted ?? "—"}%`, cells: SIMPLE_BLOCS.map(b => b.lists.reduce((t, id) => t + (results2026.seats[id] ?? 0), 0)) }] : []),
  ];
  return <div className="max-w-6xl mx-auto space-y-5"><h1 className="sr-only">אחרונים</h1>
    <div><SourceBar source={source} />
      <PartyChart selection={source.selection} lists={orderedLists(source.selection, [], crowd)} marks={id => [{ value: values[id], side: "up" }]} legend={<><LegendCapsule /><LegendLine label="ממוצע" /></>} /></div>
    {trend?.points.length ? <Card>
      <h2 className="font-bold mb-1">{NETANYAHU.name} לאורך זמן</h2>
      <CandleTrend title={`ממוצע מנדטים: ${NETANYAHU.name}`} series={[{ id: "netanyahu", name: NETANYAHU.name, points: trend.points }]} fixedLines={[40, 50, 61]} height={240} markers={electionMarkers([...NETANYAHU.lists])} />
    </Card> : null}
    <Card><h2 className="font-bold mb-2">השוואה בין המכונים</h2><PollsterGrid polls={CURRENT_POLLS} parties={parties} /></Card>
    <Card><h2 className="font-bold mb-2">לפי גושים: סקרים, מדגמים ותוצאות אמת</h2>
      <div className="overflow-x-auto"><table className="w-full text-xs md:text-sm">
        <thead><tr className="text-ink-soft text-right"><th className="py-2 pe-2">מקור</th>{SIMPLE_BLOCS.map(b => <th key={b.id} className="py-2 px-1 md:px-2 font-semibold"><span className="hidden md:inline">{b.name}</span><span className="md:hidden">{b.short}</span></th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.key} className={`border-t border-line ${r.key === "results" ? "font-bold border-t-2 border-ink" : ""}`}>
          <td className="py-2 pe-2">{r.label} <span className="block text-ink-soft font-normal text-xs">{r.kind}</span></td>
          {r.cells.map((c, i) => <td key={i} className="px-1 md:px-2 font-num">{c == null ? "—" : seatsFmt(c)}</td>)}
        </tr>)}</tbody>
      </table></div>
    </Card>
    <FocusFoot /></div>;
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SeatsPayload } from "../../lib/crowdApi";
import { useCrowdDashboard } from "../../lib/sources";
import { accuracyRows, accuracyTable, bestCombination, distance, type Seats } from "../../lib/guessAccuracy";
import { finalPolls, hasResults, histArrays, pollMean, results2026 } from "../../lib/guessAccuracyData";
import { IDS, nameOf, startSeats } from "../guess/model";
import { PartyAvatar } from "../../components/PartyAvatar";
import { useSession, useUnit } from "../guess/useCrowd";
import { Notice } from "../guess/ui";
import { FocusFoot, GuessCount, PartyName, fmt } from "./shared";
import { useHagzara } from "./hagzara";
import AccuracyShare from "./AccuracyShare";

const EMPTY = startSeats("zero");
const pc = (x: number | null) => x === null ? "—" : `${Math.round(x * 100)}%`;
const COLUMNS = [
  ["תוצאות אמת", "המנדטים שהרשימה קיבלה בפועל, לפי ועדת הבחירות."],
  ["הניחוש", "המנדטים בניחוש או בסקר שנבחר במתג."],
  ["המרחק", "בכמה מנדטים הניחוש טעה, ובאחוזים ממספר המנדטים בפועל (רשימה שלא עברה — מול 4)."],
  ["דיוק הניחושים", "כמה מכל הניחושים היו רחוקים יותר מהאמת (שוויון נספר חצי)."],
  ["דיוק הסקרים", "כמה מהסקרים האחרונים של כל מכון היו מדויקים יותר."],
] as const;

/** דיוק הניחושים והסקרים מול תוצאות האמת (docs/תוכנית-דיוק-הניחושים-27-10-2026.md) */
export default function GuessAccuracy() {
  const session = useSession();
  const crowd = useCrowdDashboard();
  const hagzara = useHagzara(session);
  const seats = useUnit<SeatsPayload>("seats", EMPTY, session.me?.latest.seats?.payload as SeatsPayload | undefined, { exitSave: false });
  const saved = session.me?.latest.seats?.payload as SeatsPayload | undefined;
  const mine: Seats | null = saved ? Object.fromEntries(IDS.map(id => [id, (seats.draft ?? saved).seats[id]?.v ?? 0])) : null;
  const [mode, setMode] = useState<"guesses" | "polls">("guesses");
  const [pick, setPick] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const d = crowd.dashboard;
  const hist = useMemo(() => histArrays(d?.seats?.hist), [d]);
  const crowdMean: Seats = useMemo(() => Object.fromEntries((d?.seats?.full ?? []).map(r => [r.list, r.mean])), [d]);
  const actual = results2026.seats;
  const ids = useMemo(() => accuracyRows(actual, pollMean), [actual]);
  const best = useMemo(() => hasResults() ? bestCombination(finalPolls, actual, ids) : null, [actual, ids]);
  if (!hasResults()) return <div className="max-w-6xl mx-auto"><h1 className="text-xl font-bold mb-3">דיוק הניחושים</h1>
    <div className="f-card"><p className="text-ink-soft">המסך ייפתח עם פרסום תוצאות האמת של ועדת הבחירות.</p></div><FocusFoot /></div>;

  const options: { key: string; label: string; values: Seats; exclude?: number }[] = mode === "guesses"
    ? [...(mine ? [{ key: "mine", label: "הניחוש שלי", values: mine }] : []), { key: "crowd", label: "ממוצע הניחושים", values: crowdMean }]
    : [{ key: "mean", label: "ממוצע הסקרים", values: pollMean }, ...finalPolls.map((p, i) => ({ key: p.key, label: p.label, values: p.values, exclude: i }))];
  const subject = options.find(o => o.key === pick) ?? options[0];
  const table = accuracyTable({ subject: subject.values, actual, ids, hist, polls: finalPolls.map(p => p.values), exclude: subject.exclude });
  const polls = finalPolls.map(p => p.values);

  return <div className="max-w-6xl mx-auto">
    <h1 className="text-xl font-bold mb-1">דיוק הניחושים</h1>
    <p className="text-sm text-ink-soft mb-4">{results2026.status === "partial" ? "לפי ספירה חלקית · " : ""}{results2026.asOf ?? ""}</p>
    <GuessCount total={d?.seats?.n} />
    {crowd.failed && !d && <Notice>נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בהמשך.</Notice>}
    <div className="f-seg fit" role="group" aria-label="מה משווים">
      {(["guesses", "polls"] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setPick(null); }}>{m === "guesses" ? "ניחושים" : "סקרים"}</button>)}
    </div>
    {options.length > 1 && <div className="f-seg" role="group" aria-label="הנושא">
      {options.map(o => <button key={o.key} type="button" aria-pressed={subject.key === o.key} onClick={() => setPick(o.key)}>{o.label}</button>)}
    </div>}
    <div className="f-card overflow-x-auto">
      <table className="w-full text-xs md:text-sm">
        <thead><tr className="text-ink-soft text-right">
          <th className="py-2 pe-2">רשימה</th>
          {COLUMNS.map(([h], i) => <th key={h} className="py-2 px-1 md:px-2 font-semibold">{i === 1 ? subject.label : h}</th>)}
        </tr></thead>
        <tbody>{table.rows.map(r => <tr key={r.id} className="border-t border-line">
          <td className="py-2 pe-2"><span className="hidden md:inline"><PartyName id={r.id} /></span><span className="md:hidden" title={nameOf(r.id)}><PartyAvatar id={r.id} size={30} /><span className="sr-only">{nameOf(r.id)}</span></span></td>
          <td className="px-1 md:px-2 font-num">{fmt(r.actual)}</td>
          <td className="px-1 md:px-2 font-num">{fmt(r.guess)}</td>
          <td className="px-1 md:px-2 font-num whitespace-nowrap">{fmt(r.seats)} / {Math.round(r.pct)}%</td>
          <td className="px-1 md:px-2 font-num whitespace-nowrap">{r.vsCrowd === null ? "—" : <>{pc(r.vsCrowd)}<span className="hidden md:inline"> רחוקים יותר</span></>}</td>
          <td className="px-1 md:px-2 font-num whitespace-nowrap">{r.pollsCloser === null ? "—" : <>{pc(r.pollsCloser)}<span className="hidden md:inline"> מדויקים יותר</span></>}</td>
        </tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-ink font-bold">
          <td className="py-2 pe-2">כל המפלגות</td><td className="px-1 md:px-2 font-num">120</td><td className="px-1 md:px-2 font-num">{fmt(Object.values(subject.values).reduce((a, b) => a + b, 0))}</td>
          <td className="px-1 md:px-2 font-num">{fmt(table.total.seats)}</td>
          <td className="px-1 md:px-2 font-num">{pc(table.total.vsCrowd)}</td><td className="px-1 md:px-2 font-num">{pc(table.total.pollsCloser)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div className="f-card mt-4">
      <h2 className="font-bold mb-2">מה בכל טור</h2>
      <ul className="text-sm space-y-1">{COLUMNS.map(([h, t]) => <li key={h}><b>{h}:</b> {t}</li>)}</ul>
      <p className="text-sm mt-2"><Link to="/method#guess-accuracy" className="font-semibold">איך זה חושב?</Link></p>
    </div>
    {best && <div className="f-card mt-4">
      <h2 className="font-bold mb-2">הממוצע שהיה הכי קרוב לאמת</h2>
      <p className="text-sm mb-2">{best.keys.map(k => finalPolls.find(p => p.key === k)?.label).join(" · ")}</p>
      <p className="text-sm text-ink-soft">טעות ממוצעת למפלגה <span className="font-num">{Math.round(best.error)}%</span>, מול <span className="font-num">{Math.round(ids.reduce((s, id) => s + distance(pollMean[id] ?? 0, actual[id] ?? 0).pct, 0) / ids.length)}%</span> בממוצע כל הסקרים.</p>
    </div>}
    <div className="flex justify-center mt-5"><button type="button" className="f-btn pri" onClick={() => setSharing(true)} disabled={!d}>שיתוף</button></div>
    <FocusFoot />
    {sharing && <AccuracyShare onClose={() => setSharing(false)} input={{ actual, ids, crowdMean, mine, pollMean, polls, pollLabels: finalPolls.map(p => p.label), hist, count: d?.seats?.n ?? 0, best: best ? best.keys.map(k => finalPolls.find(p => p.key === k)?.firm ?? k) : [], group: hagzara }} />}
  </div>;
}

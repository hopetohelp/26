import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SeatsPayload } from "../../lib/crowdApi";
import { useCrowdDashboard } from "../../lib/sources";
import { accuracyRows, bestCombination, closerShareHist, distance, histStats, pollStats, type Seats } from "../../lib/guessAccuracy";
import { finalPolls, hasResults, histArrays, pollMean, results2026 } from "../../lib/guessAccuracyData";
import { IDS, nameOf, startSeats } from "../guess/model";
import { PartyAvatar } from "../../components/PartyAvatar";
import { useSession, useUnit } from "../guess/useCrowd";
import { Notice } from "../guess/ui";
import { FocusFoot, GuessCount, PartyName, fmt } from "./shared";
import { useHagzara } from "./hagzara";
import AccuracyShare from "./AccuracyShare";

const EMPTY = startSeats("zero");
const pc = (x: number | null | undefined) => x == null ? "—" : `${Math.round(x * 100)}%`;
type View = "mine" | "all" | "polls";
/** מרחק במספר וביחס: "2 (20%)" */
const Dist = ({ seats, actual }: { seats: number | null | undefined; actual: number }) =>
  seats == null ? <>—</> : <bdi dir="ltr">{fmt(Math.round(seats * 10) / 10)} <span className="text-ink-soft">({Math.round(seats / Math.max(actual, 4) * 100)}%)</span></bdi>;
/** הטורים בכל תצוגה: כותרת ושורת הסבר (הכרעת בעלים 27.10.2026) */
const COLUMNS: Record<View, [string, string][]> = {
  mine: [
    ["תוצאות אמת", "המנדטים שהרשימה קיבלה בפועל, לפי ועדת הבחירות."],
    ["הניחוש שלי", "המנדטים שנתתי לרשימה בניחוש."],
    ["ניחושים מדויקים ממני", "אחוז המנחשים שהיו קרובים יותר לתוצאה (מי שטעה בדיוק כמוני אינו נספר)."],
    ["המרחק שלי", "בכמה מנדטים טעיתי, וכמה זה ביחס לגודל הרשימה בפועל (רשימה שלא עברה — ביחס ל־4)."],
  ],
  all: [
    ["תוצאות אמת", "המנדטים שהרשימה קיבלה בפועל, לפי ועדת הבחירות."],
    ["ניחושים מדויקים", "אחוז המנחשים שנתנו לרשימה בדיוק את מספר המנדטים שקיבלה."],
    ["המרחק הממוצע", "בממוצע, בכמה מנדטים טעו המנחשים, וכמה זה ביחס לגודל הרשימה."],
    ["המרחק של החציון", "החציון הוא הניחוש האמצעי (חצי ניחשו פחות וחצי יותר); כמה הוא רחוק מהתוצאה, במספר וביחס."],
  ],
  polls: [
    ["תוצאות אמת", "המנדטים שהרשימה קיבלה בפועל, לפי ועדת הבחירות."],
    ["סקרים מדויקים", "אחוז הסקרים האחרונים (אחד לכל מכון) שנתנו לרשימה בדיוק את מספר המנדטים שקיבלה."],
    ["המרחק הממוצע", "בממוצע, בכמה מנדטים טעו הסקרים, וכמה זה ביחס לגודל הרשימה. סקר שלא פרסם נתון לרשימה אינו נכלל בה."],
    ["המכון שנבחר", "בכמה מנדטים טעה המכון שנבחר במתג, וכמה זה ביחס לגודל הרשימה."],
  ],
};

/** דיוק הניחושים והסקרים מול תוצאות האמת (docs/תוכנית-דיוק-הניחושים-27-10-2026.md) */
export default function GuessAccuracy() {
  const session = useSession();
  const crowd = useCrowdDashboard();
  const hagzara = useHagzara(session);
  const seats = useUnit<SeatsPayload>("seats", EMPTY, session.me?.latest.seats?.payload as SeatsPayload | undefined, { exitSave: false });
  const saved = session.me?.latest.seats?.payload as SeatsPayload | undefined;
  const mine: Seats | null = saved ? Object.fromEntries(IDS.map(id => [id, (seats.draft ?? saved).seats[id]?.v ?? 0])) : null;
  const [mode, setMode] = useState<"guesses" | "polls">("guesses");
  const [who, setWho] = useState<"mine" | "all">("mine");
  const [firm, setFirm] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const d = crowd.dashboard;
  const hist = useMemo(() => histArrays(d?.seats?.hist), [d]);
  const crowdMean: Seats = useMemo(() => Object.fromEntries((d?.seats?.full ?? []).map(r => [r.list, r.mean])), [d]);
  const actual = results2026.seats;
  const ids = useMemo(() => accuracyRows(actual, pollMean), [actual]);
  const best = useMemo(() => hasResults() ? bestCombination(finalPolls, actual, ids) : null, [actual, ids]);
  if (!hasResults()) return <div className="max-w-6xl mx-auto"><h1 className="text-xl font-bold mb-3">דיוק הניחושים</h1>
    <div className="f-card"><p className="text-ink-soft">המסך ייפתח עם פרסום תוצאות האמת של ועדת הבחירות.</p></div><FocusFoot /></div>;

  const view: View = mode === "polls" ? "polls" : who === "mine" && mine ? "mine" : "all";
  const pollList = finalPolls.map(p => p.values);
  const chosen = finalPolls.find(p => p.key === firm) ?? finalPolls[0];
  const rows = ids.map(id => {
    const a = actual[id] ?? 0, h = hist?.[id];
    if (view === "mine") { const g = mine?.[id] ?? 0, err = Math.abs(g - a); return { id, a, cells: [fmt(g), pc(h ? closerShareHist(err, h, a) : null)], dist: [err] as (number | null)[], share: h ? closerShareHist(err, h, a) : null }; }
    if (view === "all") { const st = h ? histStats(h, a) : null; return { id, a, cells: [pc(st?.exact)], dist: [st?.mean ?? null, st ? Math.abs(st.median - a) : null], share: st?.exact ?? null }; }
    const st = pollStats(pollList, id, a), f = chosen && id in chosen.values ? Math.abs(chosen.values[id] - a) : null;
    return { id, a, cells: [pc(st?.exact)], dist: [st?.mean ?? null, f], share: st?.exact ?? null };
  });
  // שורת "כל המפלגות": אחוזים — ממוצע של המפלגות; מרחקים — סכום המנדטים, והיחס הממוצע של המפלגות
  const avgOf = (xs: (number | null)[]) => { const ok = xs.filter((x): x is number => x != null); return ok.length ? ok.reduce((p, q) => p + q, 0) / ok.length : null; };
  const nDist = rows[0]?.dist.length ?? 0;
  const totals = Array.from({ length: nDist }, (_, j) => ({
    seats: rows.reduce((t, r) => t + (r.dist[j] ?? 0), 0),
    ratio: avgOf(rows.map(r => r.dist[j] == null ? null : r.dist[j]! / Math.max(r.a, 4))),
  }));
  const polls = pollList;

  return <div className="max-w-6xl mx-auto">
    <h1 className="text-xl font-bold mb-1">דיוק הניחושים</h1>
    <p className="text-sm text-ink-soft mb-4">{results2026.status === "partial" ? "לפי ספירה חלקית · " : ""}{results2026.asOf ?? ""}</p>
    <GuessCount total={d?.seats?.n} />
    {crowd.failed && !d && <Notice>נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בהמשך.</Notice>}
    <div className="f-seg fit" role="group" aria-label="מה משווים">
      {(["guesses", "polls"] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "guesses" ? "ניחושים" : "סקרים"}</button>)}
    </div>
    {mode === "guesses" && mine && <div className="f-seg fit" role="group" aria-label="איזה ניחוש">
      {(["mine", "all"] as const).map(w => <button key={w} type="button" aria-pressed={who === w} onClick={() => setWho(w)}>{w === "mine" ? "הניחוש שלי" : "כל הניחושים"}</button>)}
    </div>}
    {mode === "polls" && <div className="f-seg" role="group" aria-label="מכון">
      {finalPolls.map(p => <button key={p.key} type="button" aria-pressed={chosen?.key === p.key} onClick={() => setFirm(p.key)}>{p.label}</button>)}
    </div>}
    <div className="f-card overflow-x-auto">
      <table className="w-full text-xs md:text-sm">
        <thead><tr className="text-ink-soft text-right">
          <th className="py-2 pe-2">רשימה</th>
          {COLUMNS[view].map(([h], i) => <th key={h} className="py-2 px-1 md:px-2 font-semibold">{view === "polls" && i === 3 ? chosen?.label ?? h : h}</th>)}
        </tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} className="border-t border-line">
          <td className="py-2 pe-2"><span className="hidden md:inline"><PartyName id={r.id} /></span><span className="md:hidden" title={nameOf(r.id)}><PartyAvatar id={r.id} size={30} /><span className="sr-only">{nameOf(r.id)}</span></span></td>
          <td className="px-1 md:px-2 font-num">{fmt(r.a)}</td>
          {r.cells.map((c, i) => <td key={i} className="px-1 md:px-2 font-num whitespace-nowrap">{c}</td>)}
          {r.dist.map((x, i) => <td key={`d${i}`} className="px-1 md:px-2 font-num whitespace-nowrap"><Dist seats={x} actual={r.a} /></td>)}
        </tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-ink font-bold">
          <td className="py-2 pe-2">כל המפלגות</td><td className="px-1 md:px-2 font-num">120</td>
          {view === "mine" && <td className="px-1 md:px-2 font-num">{fmt(rows.reduce((t, r) => t + (mine?.[r.id] ?? 0), 0))}</td>}
          <td className="px-1 md:px-2 font-num">{pc(avgOf(rows.map(r => r.share)))}</td>
          {totals.map((t, i) => <td key={i} className="px-1 md:px-2 font-num whitespace-nowrap"><bdi dir="ltr">{fmt(Math.round(t.seats * 10) / 10)} ({t.ratio == null ? "—" : `${Math.round(t.ratio * 100)}%`})</bdi></td>)}
        </tr></tfoot>
      </table>
    </div>
    <div className="f-card mt-4">
      <h2 className="font-bold mb-2">מה בכל טור</h2>
      <ul className="text-sm space-y-1">{COLUMNS[view].map(([h, t]) => <li key={h}><b>{h}:</b> {t}</li>)}<li><b>כל המפלגות:</b> באחוזים — ממוצע של המפלגות, כל מפלגה במשקל שווה; במרחק — סך המנדטים, והיחס הממוצע של המפלגות.</li></ul>
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

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { SeatsPayload } from "../../lib/crowdApi";
import { useCrowdDashboard } from "../../lib/sources";
import { accuracyPct, accuracyRows, bestCombination, closerShareHist, closestPoll, distance, histStats, pollStats, type Seats } from "../../lib/guessAccuracy";
import { useInterface } from "../../lib/interfaceMode";
import { SIMPLE_ALL, SIMPLE_BLOCS } from "../../lib/simpleSources";
import { finalPolls, hasResults, histArrays, pollMean, results2026 } from "../../lib/guessAccuracyData";
import { IDS, nameOf, startSeats } from "../guess/model";
import { PartyAvatar } from "../../components/PartyAvatar";
import { useSession, useUnit } from "../guess/useCrowd";
import { Notice } from "../guess/ui";
import { FocusFoot, GuessCount, InlineBlocBar, LegendBox, LegendCapsule, PartyChart, PartyName, fmt } from "./shared";
import { useHagzara } from "./hagzara";
import AccuracyShare from "./AccuracyShare";

const EMPTY = startSeats("zero");
const avgOf = (xs: (number | null)[]) => { const ok = xs.filter((x): x is number => x != null); return ok.length ? ok.reduce((p, q) => p + q, 0) / ok.length : null; };
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
  const { advanced } = useInterface();
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
  const nearest = useMemo(() => hasResults() ? closestPoll(finalPolls, actual) : null, [actual]);
  // לפני הספירה הראשונה: כל הנתונים הקיימים, ובטורים שתלויים בתוצאות — קו (הכרעת בעלים 27.10.2026)
  const ready = hasResults();

  const view: View = mode === "polls" ? "polls" : who === "mine" && mine ? "mine" : "all";
  const pollList = finalPolls.map(p => p.values);
  const chosen = finalPolls.find(p => p.key === firm) ?? finalPolls[0];
  const polls = pollList;
  // ממוקדת: כמה מהמנחשים היו רחוקים יותר ממני (ממוצע המפלגות), כמה מנדטים במקום הלא נכון, ושלוש תיבות אחוז הדיוק
  const myBeat = mine && ready ? avgOf(ids.map(id => { const h = hist?.[id]; if (!h) return null; const a = actual[id] ?? 0, err = Math.abs((mine[id] ?? 0) - a); const c = closerShareHist(err, h, a); const n = h.reduce((x, y) => x + y, 0); const tie = (h[a - err] ?? 0) + (err ? h[a + err] ?? 0 : 0); return c === null ? null : 1 - c - tie / n; })) : null;
  const myMisplaced = mine ? (100 - accuracyPct(mine, actual)) * 1.2 : 0;
  const acc = (v: Seats | null) => v && ready ? accuracyPct(v, actual) : null;
  const tiles: [string, number | null][] = [...(mine ? [["הניחוש שלי", acc(mine)] as [string, number | null]] : []), ["ממוצע הניחושים", d ? acc(crowdMean) : null], ["ממוצע הסקרים", acc(pollMean)]];

  return <div className="max-w-6xl mx-auto">
    <h1 className="text-xl font-bold mb-1">תוצאות</h1>
    {!ready && <Notice>ממתינים לתוצאות ראשונות. המסך יתעדכן אוטומטית עם תחילת הספירה.</Notice>}
    <p className="text-sm text-ink-soft mb-4">{results2026.status === "partial" ? "לפי ספירה חלקית · " : ""}{results2026.source.includes("ויקיפדיה") ? "מוויקיפדיה, לא אומת · " : ""}{results2026.asOf ?? ""}</p>
    <GuessCount total={d?.seats?.n} />
    {crowd.failed && !d && <Notice>נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בהמשך.</Notice>}
    {advanced ? <>
    <div className="f-seg fit" role="group" aria-label="מה משווים">
      {(["guesses", "polls"] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "guesses" ? "ניחושים" : "סקרים"}</button>)}
    </div>
    {mode === "guesses" && mine && <div className="f-seg fit" role="group" aria-label="איזה ניחוש">
      {(["mine", "all"] as const).map(w => <button key={w} type="button" aria-pressed={who === w} onClick={() => setWho(w)}>{w === "mine" ? "הניחוש שלי" : "כל הניחושים"}</button>)}
    </div>}
    {mode === "polls" && <div className="f-seg" role="group" aria-label="מכון">
      {finalPolls.map(p => <button key={p.key} type="button" aria-pressed={chosen?.key === p.key} onClick={() => setFirm(p.key)}>{p.label}</button>)}
    </div>}
    <AccuracyTable view={view} ids={ids} name={id => <PartyName id={id} />} short={id => <><PartyAvatar id={id} size={30} /><span className="sr-only">{nameOf(id)}</span></>} actual={actual} mine={mine} hist={hist} polls={pollList} chosen={chosen?.values ?? null} chosenLabel={chosen?.label} ready={ready} />
    <h2 className="font-bold mt-5 mb-2">לפי ארבעת הגושים</h2>
    <AccuracyTable view={view} ids={BLOC_IDS4} name={id => <span>{blocName(id)}</span>} short={id => <span>{blocShort(id)}</span>} actual={blocs(actual)} mine={mine && blocs(mine)} hist={blocHist(hist)} polls={pollList.map(blocs)} chosen={chosen ? blocs(chosen.values) : null} chosenLabel={chosen?.label} ready={ready} />
    <div className="f-card mt-4">
      <h2 className="font-bold mb-2">מה בכל טור</h2>
      <ul className="text-sm space-y-1">{COLUMNS[view].map(([h, t]) => <li key={h}><b>{h}:</b> {t}</li>)}<li><b>כל המפלגות:</b> באחוזים — ממוצע של המפלגות, כל מפלגה במשקל שווה; במרחק — סך המנדטים, והיחס הממוצע של המפלגות.</li></ul>
      <p className="text-sm mt-2"><Link to="/method#guess-accuracy" className="font-semibold">איך זה חושב?</Link></p>
    </div>
    </> : <>
    {/* ממוקדת: הפניה למתג "מתקדם" הקיים — בלי כפתור נוסף (הכרעת בעלים 27.10.2026) */}
    <p className="text-sm text-ink-soft mb-4">לניתוח מורחב — הפעילו את המתג ״מתקדם״ בראש המסך.</p>
    {mine && ready && <div className="f-card mb-4 text-center">
      <p className="text-2xl font-bold">היית מדויק יותר מ־<span className="font-num">{pc(myBeat)}</span> מהמנחשים</p>
      <p className="text-sm text-ink-soft mt-1"><span className="font-num">{ready ? fmt(Math.round(myMisplaced)) : "—"}</span> מנדטים בניחוש שלי הונחו ברשימה הלא נכונה</p>
    </div>}
    <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
      {tiles.map(([label, v]) => <div key={label} className="f-card text-center !p-3"><p className="text-xs md:text-sm text-ink-soft">{label}</p><p className="text-2xl md:text-3xl font-bold font-num">{v == null ? "—" : `${Math.round(v)}%`}</p></div>)}
    </div>
    <p className="text-xs text-ink-soft mb-4 text-center">אחוז הדיוק = כמה מתוך 120 המנדטים הונחו ברשימה הנכונה.</p>
    <PartyChart selection={SIMPLE_ALL} lists={ids} spreadOf={id => { if (!ready) return null; const v = actual[id] ?? 0; return [v, v, v, v, v, v]; }}
      marks={id => [...(mine ? [{ value: mine[id] ?? 0, side: "up" as const }] : []), { value: crowdMean[id], kind: "dash" as const, side: "down" as const }]}
      legend={<><LegendCapsule label="תוצאות אמת" />{mine && <LegendBox label="הניחוש שלי" />}<LegendBox kind="dash" label="ממוצע הניחושים" /></>} />
    <h2 className="font-bold mt-5 mb-2">לפי ארבעת הגושים</h2>
    <AccuracyTable view={mine ? "mine" : "all"} ids={BLOC_IDS4} name={id => <span>{blocName(id)}</span>} short={id => <span>{blocShort(id)}</span>} actual={blocs(actual)} mine={mine && blocs(mine)} hist={blocHist(hist)} polls={pollList.map(blocs)} chosen={null} ready={ready} />
    <div className="f-card mt-4 grid gap-3">
      <div><p className="text-sm font-bold mb-1">תוצאות אמת</p>{ready ? <InlineBlocBar values={actual} /> : <p className="text-ink-soft">—</p>}</div>
      <div><p className="text-sm font-bold mb-1">{mine ? "הניחוש שלי" : "ממוצע הניחושים"}</p><InlineBlocBar values={mine ?? crowdMean} /></div>
    </div>
    </>}
    {nearest && <div className="f-card mt-4">
      <h2 className="font-bold mb-2">הסקר הקרוב ביותר</h2>
      <p className="text-sm">{nearest.label} <span className="text-ink-soft">({nearest.end.split("-").reverse().slice(0, 2).map(Number).join("/")})</span> · אחוז דיוק <span className="font-num font-bold">{Math.round(nearest.acc)}%</span></p>
    </div>}
    {advanced && best && <div className="f-card mt-4">
      <h2 className="font-bold mb-2">השילוב הקרוב ביותר</h2>
      <p className="text-sm mb-2">{best.keys.map(k => finalPolls.find(p => p.key === k)?.label).join(" · ")}</p>
      <p className="text-sm text-ink-soft">טעות ממוצעת למפלגה <span className="font-num">{Math.round(best.error)}%</span>, מול <span className="font-num">{Math.round(ids.reduce((s, id) => s + distance(pollMean[id] ?? 0, actual[id] ?? 0).pct, 0) / ids.length)}%</span> בממוצע כל הסקרים.</p>
    </div>}
    <div className="flex justify-center mt-5"><button type="button" className="f-btn pri" onClick={() => setSharing(true)} disabled={!d || !ready}>שיתוף</button></div>
    <FocusFoot />
    {sharing && <AccuracyShare onClose={() => setSharing(false)} input={{ actual, ids, crowdMean, mine, pollMean, polls, pollLabels: finalPolls.map(p => p.label), hist, count: d?.seats?.n ?? 0, best: best ? best.keys.map(k => finalPolls.find(p => p.key === k)?.firm ?? k) : [], group: hagzara }} />}
  </div>;
}

/** ארבעת הגושים — אותה הגדרה כמו בכל האתר (SIMPLE_BLOCS) */
const BLOC_IDS4 = SIMPLE_BLOCS.map(b => b.id);
const blocName = (id: string) => SIMPLE_BLOCS.find(b => b.id === id)?.name ?? id;
const blocShort = (id: string) => SIMPLE_BLOCS.find(b => b.id === id)?.short ?? id;
/** מנדטי הגושים מתוך מנדטי הרשימות; רשימה שחסרה (סקר שלא פרסם) — נספרת 0, כמו בכל נתון על קבוצת מפלגות */
const blocs = (v: Seats): Seats => Object.fromEntries(SIMPLE_BLOCS.map(b => [b.id, b.lists.reduce((t, id) => t + (v[id] ?? 0), 0)]));
/** התפלגות סכום הגוש בכל ניחוש — מהשרת (bloc:<מזהה>) */
const blocHist = (h: Record<string, number[]> | null) => h && Object.fromEntries(BLOC_IDS4.flatMap(id => h[`bloc:${id}`] ? [[id, h[`bloc:${id}`]]] : []));

/** טבלה אחת — לרשימות ולגושים, באותם טורים (הכרעות בעלים 27.10.2026) */
function AccuracyTable({ view, ids, name, short, actual, mine, hist, polls, chosen, chosenLabel, ready }: {
  view: View; ids: string[]; name: (id: string) => React.ReactNode; short: (id: string) => React.ReactNode; actual: Seats; mine: Seats | null;
  hist: Record<string, number[]> | null; polls: Seats[]; chosen: Seats | null; chosenLabel?: string; ready: boolean;
}) {
  const rows = ids.map(id => {
    const a = actual[id] ?? 0, h = hist?.[id];
    if (!ready) return { id, a, cells: view === "mine" ? [fmt(mine?.[id] ?? 0), "—"] : ["—"], dist: (view === "mine" ? [null] : [null, null]) as (number | null)[], share: null };
    if (view === "mine") { const g = mine?.[id] ?? 0, err = Math.abs(g - a); return { id, a, cells: [fmt(g), pc(h ? closerShareHist(err, h, a) : null)], dist: [err] as (number | null)[], share: h ? closerShareHist(err, h, a) : null }; }
    if (view === "all") { const st = h ? histStats(h, a) : null; return { id, a, cells: [pc(st?.exact)], dist: [st?.mean ?? null, st ? Math.abs(st.median - a) : null], share: st?.exact ?? null }; }
    const st = pollStats(polls, id, a), f = chosen && id in chosen ? Math.abs(chosen[id] - a) : null;
    return { id, a, cells: [pc(st?.exact)], dist: [st?.mean ?? null, f], share: st?.exact ?? null };
  });
  // שורת "כל המפלגות": אחוזים — ממוצע של השורות; מרחקים — סכום המנדטים, והיחס הממוצע
  const nDist = rows[0]?.dist.length ?? 0;
  const totals = Array.from({ length: nDist }, (_, j) => ({
    seats: rows.reduce((t, r) => t + (r.dist[j] ?? 0), 0),
    ratio: avgOf(rows.map(r => r.dist[j] == null ? null : r.dist[j]! / Math.max(r.a, 4))),
  }));
  return <div className="f-card overflow-x-auto">
    <table className="w-full text-xs md:text-sm">
      <thead><tr className="text-ink-soft text-right">
        <th className="py-2 pe-2">{ids === BLOC_IDS4 ? "גוש" : "רשימה"}</th>
        {COLUMNS[view].map(([h], i) => <th key={h} className="py-2 px-1 md:px-2 font-semibold">{view === "polls" && i === 3 ? chosenLabel ?? h : h}</th>)}
      </tr></thead>
      <tbody>{rows.map(r => <tr key={r.id} className="border-t border-line">
        <td className="py-2 pe-2"><span className="hidden md:inline">{name(r.id)}</span><span className="md:hidden">{short(r.id)}</span></td>
        <td className="px-1 md:px-2 font-num">{ready ? fmt(r.a) : "—"}</td>
        {r.cells.map((c, i) => <td key={i} className="px-1 md:px-2 font-num whitespace-nowrap">{c}</td>)}
        {r.dist.map((x, i) => <td key={`d${i}`} className="px-1 md:px-2 font-num whitespace-nowrap"><Dist seats={x} actual={r.a} /></td>)}
      </tr>)}</tbody>
      <tfoot><tr className="border-t-2 border-ink font-bold">
        <td className="py-2 pe-2">{ids === BLOC_IDS4 ? "כל הגושים" : "כל המפלגות"}</td><td className="px-1 md:px-2 font-num">{ready ? fmt(rows.reduce((t, r) => t + r.a, 0)) : "—"}</td>
        {view === "mine" && <td className="px-1 md:px-2 font-num">{fmt(rows.reduce((t, r) => t + (mine?.[r.id] ?? 0), 0))}</td>}
        <td className="px-1 md:px-2 font-num">{pc(avgOf(rows.map(r => r.share)))}</td>
        {totals.map((t, i) => <td key={i} className="px-1 md:px-2 font-num whitespace-nowrap">{ready ? <bdi dir="ltr">{fmt(Math.round(t.seats * 10) / 10)} ({t.ratio == null ? "—" : `${Math.round(t.ratio * 100)}%`})</bdi> : "—"}</td>)}
      </tr></tfoot>
    </table>
  </div>;
}

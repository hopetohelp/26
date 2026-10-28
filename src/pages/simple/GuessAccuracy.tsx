import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import InfoTip from "../../components/InfoTip";
import { THRESHOLD_PCT } from "../../engine/pctForSeats";
import type { SeatsPayload } from "../../lib/crowdApi";
import { useCrowdDashboard } from "../../lib/sources";
import { accuracyPct, accuracyRows, bestCombination, closerShareHist, closestPoll, distance, histStats, pollStats, type Seats } from "../../lib/guessAccuracy";
import { useInterface } from "../../lib/interfaceMode";
import { SIMPLE_ALL, SIMPLE_BLOCS } from "../../lib/simpleSources";
import { finalPolls, hasResults, histArrays, pollMean, pollMedian, previousTurnout, results2026, turnoutPct } from "../../lib/guessAccuracyData";
import { activeLists2026, registry } from "../../lib/data";
import { IDS, nameOf, startSeats } from "../guess/model";
import { PartyAvatar } from "../../components/PartyAvatar";
import { useSession, useUnit } from "../guess/useCrowd";
import { Notice } from "../guess/ui";
import { FocusFoot, InlineBlocBar, LegendBox, LegendCapsule, PartyChart, PartyName, fmt } from "./shared";
import { useHagzara } from "./hagzara";
import AccuracyShare from "./AccuracyShare";
import { useRegisterNavShare } from "../../lib/navShare";

const EMPTY = startSeats("zero");
const avgOf = (xs: (number | null)[]) => { const ok = xs.filter((x): x is number => x != null); return ok.length ? ok.reduce((p, q) => p + q, 0) / ok.length : null; };
const pc = (x: number | null | undefined) => x == null ? "—" : `${Math.round(x * 100)}%`;
/** כמו pc, אבל חלק קטן מאחוז מוצג בעשירית (0.1%) ולא מתעגל ל-0% */
const pcFine = (x: number | null | undefined) => x == null ? "—" : x > 0 && x < .01 ? `${(x * 100).toFixed(1)}%` : pc(x);
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
  const openShare = useCallback(() => setSharing(true), []);
  const d = crowd.dashboard;
  const hist = useMemo(() => histArrays(d?.seats?.hist), [d]);
  // מתג חציון/ממוצע (הכרעת בעלים 28.10.2026): בחציון — כל מקום שמשתמש בממוצע הניחושים או הסקרים, כולל אחוז הדיוק והשיתוף
  const [stat, setStat] = useState<"mean" | "median">("mean");
  const crowdMean: Seats = useMemo(() => Object.fromEntries((d?.seats?.full ?? []).map(r => [r.list, stat === "median" ? r.median : r.mean])), [d, stat]);
  const pollAvg = stat === "median" ? pollMedian : pollMean;
  const avgWord = stat === "median" ? "חציון" : "ממוצע";
  const statSwitch = <div className="f-seg fit" role="group" aria-label="חציון או ממוצע">
    {(["median", "mean"] as const).map(m => <button key={m} type="button" aria-pressed={stat === m} onClick={() => setStat(m)}>{m === "median" ? "חציון" : "ממוצע"}</button>)}
  </div>;
  const actual = results2026.seats;
  const ids = useMemo(() => accuracyRows(actual, pollMean), [actual]);
  const best = useMemo(() => hasResults() ? bestCombination(finalPolls, actual, ids) : null, [actual, ids]);
  const nearest = useMemo(() => hasResults() ? closestPoll(finalPolls, actual) : null, [actual]);
  // לפני הספירה הראשונה: כל הנתונים הקיימים, ובטורים שתלויים בתוצאות — קו (הכרעת בעלים 27.10.2026)
  const ready = hasResults();
  useRegisterNavShare(openShare, !d || !ready);
  // הגרף: הרשימות שעברו, ואחריהן — אחרי קו הפרדה — כל הרשימות שלא עברו, לפי אחוז הקולות (הכרעת בעלים 28.10.2026)
  // ברשימות שלא עברו — אחוז הקולות במקום 0 מנדטים (הכרעת בעלים 28.10.2026)
  const votePct = (results2026 as { pct?: Record<string, number> }).pct ?? {};
  const belowIds = useMemo(() => {
    if (!ready) return [];
    return activeLists2026.map(l => l.id).filter(id => (actual[id] ?? 0) === 0).sort((a, b) => (votePct[b] ?? 0) - (votePct[a] ?? 0));
  }, [actual, ready, votePct]);
  const chartIds = useMemo(() => ready ? [...ids.filter(id => (actual[id] ?? 0) > 0), ...belowIds] : ids, [ids, actual, ready, belowIds]);

  const view: View = mode === "polls" ? "polls" : who === "mine" && mine ? "mine" : "all";
  const pollList = finalPolls.map(p => p.values);
  const chosen = finalPolls.find(p => p.key === firm) ?? finalPolls[0];
  const polls = pollList;
  // ממוקדת: כמה מהמנחשים היו רחוקים יותר ממני (ממוצע המפלגות), כמה מנדטים במקום הלא נכון, ושלוש תיבות אחוז הדיוק
  const myBeat = mine && ready ? avgOf(ids.map(id => { const h = hist?.[id]; if (!h) return null; const a = actual[id] ?? 0, err = Math.abs((mine[id] ?? 0) - a); const c = closerShareHist(err, h, a); const n = h.reduce((x, y) => x + y, 0); const tie = (h[a - err] ?? 0) + (err ? h[a + err] ?? 0 : 0); return c === null ? null : 1 - c - tie / n; })) : null;
  const myMisplaced = mine ? (100 - accuracyPct(mine, actual)) * 1.2 : 0;
  const acc = (v: Seats | null) => v && ready ? accuracyPct(v, actual) : null;
  // תיבות הדיוק (הכרעת בעלים 27.10.2026): "דיוק N הניחושים" — הגדולה, באמצע — ו"דיוק N הסקרים"; ההסבר באייקון מידע
  const nGuesses = d?.seats?.n;
  // כל הניחושים: בשורת "כל המפלגות" — אחוז המנחשים שצדקו בכל הרשימות יחד (מהשרת; הכרעת בעלים 28.10.2026)
  const exactAllShare = ready && d?.seats?.exactAll != null && d.seats.n ? d.seats.exactAll / d.seats.n : null;
  const tiles: { label: string; v: number | null; big?: boolean }[] = [
    ...(mine ? [{ label: "הניחוש שלי", v: acc(mine) }] : []),
    { label: nGuesses ? `דיוק ${nGuesses.toLocaleString("he-IL")} הניחושים` : "דיוק הניחושים", v: d ? acc(crowdMean) : null, big: true },
    { label: `דיוק ${finalPolls.length} הסקרים`, v: acc(pollAvg) },
  ];

  return <div className="max-w-6xl mx-auto">
    {/* בלי כותרת גלויה ובלי הודעת "ממתינים לתוצאות" (הכרעת בעלים 27.10.2026); הכותרת נשארת לקורא מסך */}
    <h1 className="sr-only">תוצאות</h1>
    {/* בלי שורת המקור; שעת העדכון בסוגריים אחרי "נספרו" (הכרעת בעלים 28.10.2026) */}
    <TurnoutCard />
    {crowd.failed && !d && <Notice>נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בהמשך.</Notice>}
    {statSwitch}
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
    <AccuracyTable view={view} ids={ids} allShare={exactAllShare} name={id => <PartyName id={id} />} short={id => <><PartyAvatar id={id} size={30} /><span className="sr-only">{nameOf(id)}</span></>} actual={actual} mine={mine} hist={hist} polls={pollList} chosen={chosen?.values ?? null} chosenLabel={chosen?.label} ready={ready} />
    <h2 className="font-bold mt-5 mb-2">לפי ארבעת הגושים</h2>
    <AccuracyTable view={view} ids={BLOC_IDS4} name={id => <span>{blocName(id)}</span>} short={id => <span>{blocShort(id)}</span>} actual={blocs(actual)} mine={mine && blocs(mine)} hist={blocHist(hist)} polls={pollList.map(blocs)} chosen={chosen ? blocs(chosen.values) : null} chosenLabel={chosen?.label} ready={ready} />
    <div className="f-card mt-4">
      <h2 className="font-bold mb-2">מה בכל טור</h2>
      <ul className="text-sm space-y-1">{COLUMNS[view].map(([h, t]) => <li key={h}><b>{h}:</b> {t}</li>)}<li><b>כל המפלגות:</b> {view === "all" ? <>ב"ניחושים מדויקים" — אחוז המנחשים שצדקו בכל הרשימות יחד</> : <>באחוזים — ממוצע של המפלגות, כל מפלגה במשקל שווה</>}; במרחק — סך המנדטים, והיחס הממוצע של המפלגות.</li></ul>
      <p className="text-sm mt-2"><Link to="/method#guess-accuracy" className="font-semibold">איך זה חושב?</Link></p>
    </div>
    </> : <>
    {mine && ready && <div className="f-card mb-4 text-center">
      <p className="text-2xl font-bold">היית מדויק יותר מ־<span className="font-num">{pc(myBeat)}</span> מהמנחשים</p>
      <p className="text-sm text-ink-soft mt-1"><span className="font-num">{ready ? fmt(Math.round(myMisplaced)) : "—"}</span> מנדטים בניחוש שלי הונחו ברשימה הלא נכונה</p>
    </div>}
    <div className="grid gap-2 mb-4 items-center" style={{ gridTemplateColumns: tiles.map(t => t.big ? "minmax(0, 1.35fr)" : "minmax(0, 1fr)").join(" ") }}>
      {tiles.map(t => <div key={t.label} className={`f-card text-center ${t.big ? "!py-4 !px-3" : "!p-3"}`}>
        <p className={`${t.big ? "text-sm md:text-base" : "text-xs md:text-sm"} text-ink-soft`}>{t.label}{t.big && <InfoTip label="מה זה אחוז הדיוק?" className="ms-1">אחוז הדיוק = כמה מתוך 120 המנדטים הונחו ברשימה הנכונה.</InfoTip>}</p>
        <p className={`${t.big ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"} font-bold font-num`}>{t.v == null ? "—" : `${Math.round(t.v)}%`}</p>
      </div>)}
    </div>
    <PartyChart selection={SIMPLE_ALL} lists={chartIds} separatorBefore={belowIds[0]} capValue={ready ? id => (actual[id] ?? 0) > 0 ? actual[id] : `${(votePct[id] ?? 0).toFixed(1)}%` : undefined} spreadOf={id => { if (!ready) return null; const v = actual[id] ?? 0; return [v, v, v, v, v, v]; }}
      marks={id => [...(mine ? [{ value: mine[id] ?? 0, side: "up" as const }] : []), { value: crowdMean[id], kind: "dash" as const, side: "down" as const }]}
      legend={<><LegendCapsule label="תוצאות אמת" />{mine && <LegendBox label="הניחוש שלי" />}<LegendBox kind="dash" label={`${avgWord} הניחושים`} /></>} />
    <h2 className="font-bold mt-5 mb-2">לפי ארבעת הגושים</h2>
    <AccuracyTable view={mine ? "mine" : "all"} ids={BLOC_IDS4} name={id => <span>{blocName(id)}</span>} short={id => <span>{blocShort(id)}</span>} actual={blocs(actual)} mine={mine && blocs(mine)} hist={blocHist(hist)} polls={pollList.map(blocs)} chosen={null} ready={ready} />
    <div className="f-card mt-4 grid gap-3">
      <div><p className="text-sm font-bold mb-1">תוצאות אמת</p>{ready ? <InlineBlocBar values={actual} /> : <p className="text-ink-soft">—</p>}</div>
      <div><p className="text-sm font-bold mb-1">{mine ? "הניחוש שלי" : `${avgWord} הניחושים`}</p><InlineBlocBar values={mine ?? crowdMean} /></div>
    </div>
    </>}
    {/* במצב ממוקד הרשימות שלא עברו כבר בגרף (אחרי קו ההפרדה) — הכרטיס רק בניתוח מורחב (הכרעת בעלים 28.10.2026) */}
    {advanced && <BelowThreshold ready={ready} />}
    {nearest && <div className="f-card mt-4">
      <h2 className="font-bold mb-2">הסקר הקרוב ביותר</h2>
      <p className="text-sm">{nearest.label} <span className="text-ink-soft">({nearest.end.split("-").reverse().slice(0, 2).map(Number).join("/")})</span> · אחוז דיוק <span className="font-num font-bold">{Math.round(nearest.acc)}%</span></p>
    </div>}
    {advanced && best && <div className="f-card mt-4">
      <h2 className="font-bold mb-2">השילוב הקרוב ביותר</h2>
      <p className="text-sm mb-2">{best.keys.map(k => finalPolls.find(p => p.key === k)?.label).join(" · ")}</p>
      <p className="text-sm text-ink-soft">טעות ממוצעת למפלגה <span className="font-num">{Math.round(best.error)}%</span>, מול <span className="font-num">{Math.round(ids.reduce((s, id) => s + distance(pollAvg[id] ?? 0, actual[id] ?? 0).pct, 0) / ids.length)}%</span> ב{avgWord} כל הסקרים.</p>
    </div>}
    {/* כפתור השיתוף — בסרגל הניווט, מימין ל-AI (הכרעת בעלים 28.10.2026; src/lib/navShare.ts) */}
    <FocusFoot />
    {sharing && <AccuracyShare onClose={() => setSharing(false)} input={{ actual, ids, crowdMean, mine, pollMean: pollAvg, avgWord, polls, pollLabels: finalPolls.map(p => p.label), hist, count: d?.seats?.n ?? 0, best: best ? best.keys.map(k => finalPolls.find(p => p.key === k)?.firm ?? k) : [], group: hagzara }} />}
  </div>;
}

/** רשימות שלא עברו את אחוז החסימה (הכרעת בעלים 27.10.2026): כל רשימה פעילה בלי מנדטים, עם אחוז הקולות שלה (raw/results-2026.json pct).
 * לפני הספירה — הרשימות הקטנות, עם קו */
function BelowThreshold({ ready }: { ready: boolean }) {
  const pct = (results2026 as { pct?: Record<string, number> }).pct ?? {};
  // לפני הספירה: הרשימות שבממוצע הסקרים מתחת ל-4 מנדטים (המילואימניקים, עמך ישראל, נעם, הציבור החרדי, צבע שחור)
  const rows = activeLists2026.map(l => l.id)
    .filter(id => ready ? (results2026.seats[id] ?? 0) === 0 : (pollMean[id] ?? 0) < 4)
    .sort((a, b) => (pct[b] ?? 0) - (pct[a] ?? 0));
  if (!rows.length) return null;
  return <div className="f-card mt-4">
    <h2 className="font-bold mb-2">{ready ? `לא עברו את אחוז החסימה (${THRESHOLD_PCT}%)` : "רשימות נוספות"}</h2>
    <table className="w-full text-sm"><tbody>
      {rows.map(id => <tr key={id} className="border-t border-line first:border-t-0">
        <td className="py-2"><PartyName id={id} /></td>
        <td className="py-2 text-end font-num whitespace-nowrap">{ready && pct[id] != null ? `${pct[id].toFixed(1)}% מהקולות` : "—"}</td>
      </tr>)}
    </tbody></table>
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
function AccuracyTable({ view, ids, name, short, actual, mine, hist, polls, chosen, chosenLabel, ready, allShare }: {
  /** allShare — בתצוגת "כל הניחושים" בטבלת הרשימות: אחוז המנחשים שצדקו בכל הרשימות יחד, במקום ממוצע השורות */
  allShare?: number | null;
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
        <td className="px-1 md:px-2 font-num">{view === "all" && allShare !== undefined ? pcFine(allShare) : pc(avgOf(rows.map(r => r.share)))}</td>
        {totals.map((t, i) => <td key={i} className="px-1 md:px-2 font-num whitespace-nowrap">{ready ? <bdi dir="ltr">{fmt(Math.round(t.seats * 10) / 10)} ({t.ratio == null ? "—" : `${Math.round(t.ratio * 100)}%`})</bdi> : "—"}</td>)}
      </tr></tfoot>
    </table>
  </div>;
}

interface Turnout { time: string; total: { percent: number; "בזב": number; "מצביעים": number; updated: string; prev_percent: number; delta: number } }
/** אחוז ההצבעה הארצי בשורה אחת, בעשירית האחוז: "אחוז הצבעה: X% בחירות קודמות: Y% נספרו: Z%" (הכרעת בעלים 27.10.2026; "נספרו" — raw/results-2026.json counted, הקולות שנספרו מתוך כלל בעלי זכות הבחירה, כשידוע): המצביעים — ממפת ההצבעה של ועדת הבחירות (public/turnout.json, נשמר בכל פרסום);
 * בעלי זכות הבחירה — מהנתון הרשמי של האתר (registry.k26, הודעת יו"ר הוועדה), כמו בשאר המסכים.
 * "בחירות קודמות" — אחוז ההצבעה הסופי ב-2022 מהתוצאות הרשמיות (previousTurnout). prev_percent של המפה הוא העדכון הקודם של הוועדה, לא הבחירות הקודמות */
function TurnoutCard() {
  const [t, setT] = useState<Turnout | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}turnout.json`, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(j => { if (live && j?.total) setT(j); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const pct = t ? turnoutPct(t.total["מצביעים"], registry.k26.eligible) : null;
  const prev = previousTurnout();
  const counted = typeof results2026.counted === "number" ? results2026.counted : null;
  const time = results2026.asOf?.match(/\d{1,2}:\d{2}/)?.[0] ?? null;
  if (!t || pct == null || prev == null) return null;
  return <p className="f-card mb-4 text-center text-[11px] sm:text-sm !py-2 !px-2">
    אחוז הצבעה: <b className="font-num">{pct}%</b> בחירות קודמות: <b className="font-num">{prev}%</b>{counted != null && <> <span className="whitespace-nowrap">נספרו: <b className="font-num">{counted}%</b>{time && <> <span className="font-num font-normal">({time})</span></>}</span></>}
  </p>;
}

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import SurveyHeader from "../surveys/SurveyHeader";
import { Link } from "react-router-dom";
import { call, CrowdError, type Dashboard, type GroupDashboard, type GroupPublic, type SeatsPayload } from "../../lib/crowdApi";
import { seatsSum } from "../../lib/crowdValidate";
import { comparisonUnlocked } from "../guess/stage";
import { useInterface } from "../../lib/interfaceMode";
import { HAGZARA_GROUP_ID, SIMPLE_BLOCS, simpleValue } from "../../lib/simpleSources";
import { useCrowdDashboard } from "../../lib/sources";
import { SAVED_EVENT } from "../../lib/outbox";
import { IDS, startSeats } from "../guess/model";
import { useSession, useUnit } from "../guess/useCrowd";
import { Notice } from "../guess/ui";
import { VotingStats } from "../guess/Dashboard";
import CardDrawer from "../../components/CardDrawer";
import { smartRange } from "../../components/ChartLegend";
import { BlocChart, FocusFoot, GuessCount, InlineBlocBar, LegendCapsule, LegendBox, PartyChart, SourceBar, orderedLists, useSimpleSource } from "./shared";
import ShareCard from "./ShareCard";
import { Podium } from "./GuessAccuracy";
import { BlocRows } from "./shared";
import { hasResults, histArrays, results2026 } from "../../lib/guessAccuracyData";
import { useRegisterNavShare } from "../../lib/navShare";
import { ELECTION_RESULTS_TITLE } from "../../lib/surveys";
const GuessAccuracy = lazy(() => import("./GuessAccuracy"));
import { useHagzara } from "./hagzara";

const meansOf = (d: Dashboard | null | undefined) => Object.fromEntries((d?.seats?.full ?? []).map(r => [r.list, r.mean]));
const EMPTY = startSeats("zero");
/** הכנסת הממוצעת: נפתחת אחרי שמירת הכנסת שלך במלואה. ממוצע המשתתפים, ולחברי הגזרה — הגזרה במקום ממוצע הסקרים. */
/**
 * surveysPart — "הניחושים" בחלק הסקרים (הכרעת בעלים 02.11.2026): גלוי לכולם, גם למי שלא ניחש, ובלי ממוצע הסקרים או בורר סקרים.
 */
export default function Comparison({ surveysPart = false }: { landing?: GroupPublic | null; surveysPart?: boolean }) {
  const session = useSession();
  const { setLanding } = useInterface();
  const source = useSimpleSource(true, true);
  const crowd = useCrowdDashboard();
  const hagzara = useHagzara(session);
  const member = session.groups.find(g => g.id === HAGZARA_GROUP_ID);
  const seats = useUnit<SeatsPayload>("seats", EMPTY, session.me?.latest.seats?.payload as SeatsPayload | undefined, { exitSave: false });
  const mine = seats.draft ?? EMPTY;
  const unlocked = comparisonUnlocked(seats, IDS);
  const [result, setResult] = useState<{ token: string; data: GroupDashboard | null; failed: boolean } | null>(null);
  const [sharing, setSharing] = useState(false);
  // בחלק הסקרים (הכרעת בעלים 02.11.2026): מתג גרף / טבלה (הטבלה — מסך תוצאות האמת בלי סקרים); השיתוף בסרגל בלבד
  const [view, setView] = useState<"graph" | "table">("graph");
  const openShare = useCallback(() => setSharing(true), []);
  useRegisterNavShare(openShare, false, surveysPart);
  const [votersOpen, setVotersOpen] = useState(false);
  const [pickedRange, setPickedRange] = useState(false);
  const allowed = !!member && !!session.token;
  useEffect(() => { if (member) setLanding({ id: member.id, name: member.name, slug: member.slug ?? "hagzara", image: member.image ?? null }); }, [member?.id, member?.name, member?.slug, member?.image, setLanding]);
  useEffect(() => {
    if (!allowed || !session.token) { setResult(null); return; }
    let live = true;
    const token = session.token;
    const load = async () => {
      try {
        const data = await call<GroupDashboard>(`/dashboard?group=${encodeURIComponent(HAGZARA_GROUP_ID)}`, { token });
        if (live) setResult({ token, data, failed: false });
      } catch (e) {
        if (live) setResult(previous => ({ token, data: e instanceof CrowdError && [401, 403].includes(e.status) ? null : previous?.token === token ? previous.data : null, failed: true }));
        if (e instanceof CrowdError && [401, 403].includes(e.status)) void session.refresh();
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    const focus = () => { void session.refresh(); void load(); };
    window.addEventListener("focus", focus);
    window.addEventListener(SAVED_EVENT, load);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener(SAVED_EVENT, load); };
  }, [allowed, session.token, session.refresh]);
  if (!unlocked && !surveysPart) {
    const total = seatsSum(mine);
    return <div className="max-w-6xl mx-auto"><h1 className="sr-only">ממוצע הניחושים</h1>
      <div className="f-card f-lock"><p className="text-3xl" aria-hidden="true">🔒</p><h2 className="text-lg font-bold my-2">ממוצע הניחושים נפתח אחרי שמירת הכנסת שלך</h2>
        <p className="text-ink-soft mb-4">ממלאים את כל 120 המנדטים, שומרים, ורואים איך כולם חושבים.</p>
        <InlineBlocBar values={Object.fromEntries(IDS.map(id => [id, mine.seats[id]?.v ?? 0]))} missing={Math.max(0, 120 - total)} />
        <Link to="/guess" className="f-btn pri mt-5">{total === 120 ? "לשמירת הניחוש שלי" : "להשלמת הניחוש שלי"}</Link></div>
      {/* דיוק הסקרים עבר למסך "סקרים" באזור הבחירות (הכרעות בעלים 02.11.2026: הדיוק בתוך הסקרים; הניחושים אינם קשורים לבחירות) */}
      <FocusFoot /></div>;
  }
  const response = allowed && result?.token === session.token ? result : null;
  const raw = response?.data;
  const group = raw && !raw.belowMin ? raw as Dashboard : null;
  // שני סכומים בלבד (הכרעת בעלים 25.10.2026): כולם — גם חבר הגזרה — רואים את כל הניחושים; לחבר הגזרה בכותרת X/N
  // (X = ניחושי הגזרה, N = כל הניחושים). טורים נפרדים לגזרה — רק במתקדם.
  const segmented = false;
  const groupCount = group?.seats?.n ?? null;
  const all = crowd.dashboard;
  const crowdMeans = meansOf(all), groupMeans = meansOf(group);
  const polls = (id: string) => simpleValue(source.selection, [id]);
  const lists = orderedLists(source.selection, [groupMeans], crowdMeans);
  const blocValues = crowdMeans;
  const hagzaraLogo = hagzara?.logoUrl ?? null;
  const voters = all;
  // חברי הקבוצה: ממוצע הקבוצה מול ממוצע הסקרים או מול כל המשתתפים — לפי בחירת מנהל הקבוצה (הכרעת בעלים 24.10.2026)
  const vsPolls = (raw?.compare ?? "polls") === "polls";
  // לחברי הקבוצה הסרגל בוחר תמיד טווח (כל הסקרים / 14 ו־i24 / הניחושים), בכל השוואה שהמנהל בחר (הכרעת בעלים 25.10.2026).
  // "טווח הניחושים" = מינימום, רבעונים ומקסימום של כל המשתתפים
  // לכל הגולשים (הכרעת בעלים 25.10.2026): ברירת המחדל במסך הזה היא תמיד טווח הניחושים, עד שבוחרים טווח אחר
  const ranges = true;
  // ב-#/community — רק טווחי הסקרים (הכרעת בעלים 02.11.2026); בחלק הסקרים — טווח הניחושים
  const rangeKey = surveysPart ? "crowd" : !pickedRange && source.key === "crowd" ? "all" : source.key;
  const rangeSource = { ...source, key: rangeKey, setKey: (k: string) => { setPickedRange(true); source.setKey(k); } };
  const crowdRange = surveysPart || (ranges && rangeKey === "crowd");
  const crowdRows = new Map((all?.seats?.full ?? []).map(r => [r.list, r]));
  const crowdSpread = (id: string): [number, number, number, number, number, number] | null => { const r = crowdRows.get(id); return r ? [r.min, r.p25, r.p25, r.p75, r.p75, r.max] : null; };
  // גושים: טווח מההתפלגות שבשרת (bloc:<מזהה>), ממוצע = סכום ממוצעי הרשימות, תוצאות אמת = סכום מנדטי הרשימות
  const q = (h: number[], p: number) => { const n = h.reduce((a, b) => a + b, 0); let c = 0; for (let i = 0; i < h.length; i++) { c += h[i]; if (c >= p * n) return i; } return h.length - 1; };
  // ההתפלגות מגיעה מהשרת כמילון {מנדטים: מספר} — histArrays ממיר למערך (כמו במסך תוצאות אמת)
  const blocHist = histArrays((all?.seats as { hist?: Record<string, Record<string, number>> } | undefined)?.hist) ?? {};
  const blocRows = SIMPLE_BLOCS.map(b => {
    const h = blocHist[`bloc:${b.id}`];
    const nz = h ? h.findIndex(v => v > 0) : -1;
    return { id: b.id, name: b.name, spread: h && nz >= 0 ? [nz, q(h, .25), q(h, .75), h.length - 1 - [...h].reverse().findIndex(v => v > 0)] as [number, number, number, number] : null,
      mean: Object.keys(crowdMeans).length ? Math.round(b.lists.reduce((t, id) => t + (crowdMeans[id] ?? 0), 0) * 10) / 10 : null,
      actual: hasResults() ? b.lists.reduce((t, id) => t + (results2026.seats[id] ?? 0), 0) : null,
      // הניחוש שלי בגושים (הכרעת בעלים 02.11.2026) — רק למי ששמר ניחוש מלא
      mine: unlocked ? b.lists.reduce((t, id) => t + (mine.seats[id]?.v ?? 0), 0) : null };
  });
  // כותרת ושורת המשתתפים מהרכיב האחיד של מסכי הסקרים (הכרעת בעלים 03.11.2026); הניחוש היה פתוח גם מחוץ לגזרה
  const toggle = surveysPart && <><div className="space-y-3.5 mb-3"><SurveyHeader title={ELECTION_RESULTS_TITLE} participants={all?.seats?.n ? { all: all.seats.n, group: groupCount ?? 0, outside: groupCount != null } : null} /></div>
    <div className="f-seg fit mb-3" role="radiogroup" aria-label="תצוגה">
      <button type="button" aria-pressed={view === "graph"} onClick={() => setView("graph")}>גרף</button>
      <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>טבלה</button>
    </div>
    {view === "graph" && hasResults() && all?.seats?.podium?.length ? <Podium top={all.seats.podium} n={all.seats.n} /> : null}</>;
  if (surveysPart && view === "table") return <div className="max-w-6xl mx-auto">{toggle}<Suspense fallback={<p className="text-ink-soft">טוען…</p>}><GuessAccuracy part="guesses" /></Suspense>
    {sharing && <ShareCard heading="שיתוף ממוצע הניחושים" input={{ kind: "average", values: blocValues, group: hagzara, mine: Object.fromEntries(IDS.map(id => [id, mine.seats[id]?.v ?? 0])) }} onClose={() => setSharing(false)} />}</div>;
  return <div className="max-w-6xl mx-auto">{surveysPart ? toggle : <h1 className="sr-only">ממוצע הניחושים</h1>}
    {/* בחלק הסקרים סמל הגזרה כבר בפס העליון (הכרעת בעלים 02.11.2026) */}
    {hagzara?.logoUrl && !surveysPart && <img src={hagzara.logoUrl} alt="הגזרה" className="f-gphone" />}
    {!surveysPart && <GuessCount total={all?.seats?.n} members={member ? groupCount : null} />}
    {!surveysPart && <SourceBar source={ranges ? rangeSource : source} ranges={ranges} crowdRange={false} />}
    {crowd.failed && !all && <Notice>נתוני המשתתפים אינם זמינים כרגע. אפשר לנסות שוב בהמשך.</Notice>}
    {response?.failed && <Notice>נתוני הגזרה אינם זמינים כרגע.</Notice>}
    <div className="f-grid">
      <PartyChart selection={source.selection} lists={lists} spreadOf={crowdRange ? crowdSpread : undefined}
        marks={id => surveysPart ? [...(hasResults() ? [{ value: results2026.seats[id] ?? 0, side: "up" as const }] : []), { value: crowdMeans[id], kind: "dash", side: "down" }] : segmented && !vsPolls ? [{ value: crowdMeans[id], side: "up" }, { value: groupMeans[id], kind: "dash", side: "down" }] : segmented ? [{ value: polls(id), kind: "soft", side: "up" }, { value: groupMeans[id], kind: "dash", side: "down" }] : [{ value: polls(id), kind: "soft", side: "up" }, { value: crowdMeans[id], kind: "dash", side: "down" }]}
        mine={surveysPart && !unlocked ? undefined : id => mine.seats[id]?.v ?? 0}
        legend={<><LegendCapsule label={smartRange(crowdRange ? "הניחושים" : "הסקרים")} />{surveysPart && hasResults() && <LegendBox label="תוצאות אמת" />}{!surveysPart && (!segmented || vsPolls) && <LegendBox kind="soft" label="ממוצע הסקרים" />}{(!segmented || !vsPolls) && <LegendBox kind={segmented ? undefined : "dash"} label="ממוצע כל הניחושים" />}{segmented && <LegendBox kind="dash" label="ממוצע הגזרה" n={group?.seats?.n} />}</>} />
      <div className="f-side">{surveysPart ? <BlocRows rows={blocRows} legend={<><LegendCapsule label="טווח הניחושים" />{hasResults() && <LegendBox label="תוצאות אמת" />}<LegendBox kind="dash" label="ממוצע הניחושים" /></>} /> : <BlocChart values={blocValues} logo={hagzaraLogo} />}
        {voters && !surveysPart && <CardDrawer title="התפלגות המצביעים" open={votersOpen} onOpenChange={setVotersOpen} seenId="voters" className="mt-5"><p className="text-xs text-ink-soft mb-3">הנתונים אינם סקר עדכני אלא חישוב מצטבר מפתיחת האתר, לצורך השוואה של אמינות הניחושים.</p><VotingStats d={voters} /></CardDrawer>}</div>
    </div>
    {!surveysPart && <div className="flex justify-center mt-5"><button type="button" className="f-btn pri" onClick={() => setSharing(true)} disabled={!Object.keys(blocValues).length}>שיתוף ממוצע הניחושים</button></div>}
    {/* מ"תוצאות אמת" (הכרעת בעלים 02.11.2026): דיוק הסקרים, לא עברו, הסקר והשילוב הקרובים */}
    {!surveysPart && <Suspense fallback={null}><div className="mt-6"><GuessAccuracy part="polls" /></div></Suspense>}
    <FocusFoot />
    {sharing && <ShareCard heading="שיתוף ממוצע הניחושים" input={{ kind: "average", values: blocValues, group: hagzara, mine: Object.fromEntries(IDS.map(id => [id, mine.seats[id]?.v ?? 0])) }} onClose={() => setSharing(false)} />}
  </div>;
}

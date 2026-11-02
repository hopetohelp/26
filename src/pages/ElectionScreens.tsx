import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { Fold, PageTitle } from "../components/ui";
import Missing, { POLL_DRAWERS } from "../components/Missing";
import OverviewCards from "../components/OverviewCards";
import { results } from "../lib/data";
import { K26_ID, SUMMARY_ID, electionOption, previousElection, useElection } from "../lib/election";
import { overviewOf } from "../lib/voterFlow";
import { useScreenShown } from "../lib/screenVisibility";
import { Accuracy2026 } from "./Results2026";
import Results, { ElectionSummary, PastBlocs } from "./Results";
import Accuracy, { AccuracyAcross } from "./Accuracy";
import Voters from "./Voters";
import Latest from "./Latest";
import PersonalBlocs from "../components/PersonalBlocs";
import { results2026 } from "../lib/guessAccuracyData";

/**
 * שלושת מסכי הבחירות, אחידים לכל מערכת (הכרעות בעלים 02.11.2026, docs/תוכנית-לשוניות-ניתוח-אחיד-02-11-2026.md):
 * "תוצאות" · "מה השתנה" · "סקרים", לפי בורר המערכת שבפס העליון. "סיכום" בבורר — ההשוואה בין המערכות.
 * 🔴 אין מחיקה: כל תצוגה שהייתה ב"היסטוריה", ב"דיוק הסקרים" וב"הסקרים" עברה לכאן כמו שהיא.
 */
const VoterFlow = lazy(() => import("./VoterFlow"));
const Trends = lazy(() => import("./Trends"));
const Polls = lazy(() => import("./Polls"));
const ExitPollsCard = lazy(() => import("./Polls").then(m => ({ default: m.ExitPollsCard })));
const Today = lazy(() => import("./Today"));
const SimpleOverview = lazy(() => import("./simple/Overview"));
const GuessAccuracy = lazy(() => import("./simple/GuessAccuracy"));
const loading = <p className="text-ink-soft">טוען…</p>;


/** "סיכום" בבורר: כל המערכות זו לצד זו, בעלי הזכות ושיעור ההצבעה, ודיוק הסקרים לאורך המערכות */
function Summary() {
  return <>
    <PageTitle lead="כל מערכות הבחירות מאז 2015, זו לצד זו.">סיכום</PageTitle>
    <ElectionSummary />
    <Voters embedded />
    <AccuracyAcross />
  </>;
}

/** כותרת המערכת בראש כל מסך — כדי שתמיד יהיה ברור באיזו מערכת נמצאים */
function ElectionLine({ id }: { id: string }) {
  const o = electionOption(id);
  return <p className="text-sm text-ink-soft mb-3">הכנסת ה־{o.knesset} · {o.full}</p>;
}

export function ResultsScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  // אותו מסך לכל מערכת, כולל 2026 (הכרעת בעלים 02.11.2026: "איחוד זהה")
  return <><h1 className="sr-only">תוצאות</h1><Results id={id} /></>;
}

/** "מה השתנה" של מערכת שהסתיימה: הערך והשינוי מהקודמת, הגושים, ומגירות המעבר (עדיין חסרות למערכות האלה) */
function PastChanges({ id }: { id: string }) {
  const e = results.find((x) => x.id === id)!;
  const prevOpt = previousElection(id), prev = prevOpt ? results.find((x) => x.id === prevOpt.id) : undefined;
  return <div>
    <section className="rounded-theme border border-paper-line bg-paper-card shadow-sm p-3 md:p-4">
      <h1 className="text-2xl font-display leading-tight">מה השתנה: {prevOpt?.label ?? "2013"} מול {electionOption(id).label}</h1>
      <OverviewCards pair={{ prev: prev ? overviewOf(prev) : null, cur: overviewOf(e) }} />
    </section>
    <PastBlocs id={id} />
    <Fold title="מעבר בין מפלגות"><Missing what="מעבר המצביעים" /></Fold>
    <Fold title="מעבר בין גושים"><Missing what="המעבר בין גושים" /></Fold>
    <Fold title="חיפוש לפי עיר או קלפי"><Missing what="החיפוש והמעבר ביישוב" /></Fold>
  </div>;
}

export function ChangesScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  if (id === K26_ID) return <Suspense fallback={loading}><VoterFlow afterHeader={<PersonalBlocs title="חלוקת הכנסת בתוצאות אוקטובר 2026" source="תוצאות אמת 2026" asOf={results2026.asOf ? `נכון ל-${results2026.asOf}` : "הספירה"} datasets={[{ values: results2026.seats, source: "תוצאות אמת 2026", asOf: results2026.asOf ?? "הספירה" }]} />} /></Suspense>;
  return <PastChanges id={id} />;
}

/** "סקרים" של 2026: אחרונים, הסקרים מול התוצאה, ומגירות "מגמות" ו"ארכיון" (הכרעת בעלים 02.11.2026: שלושה מסכים) */
function Polls2026() {
  const overview = useScreenShown("overview"), today = useScreenShown("today");
  // קישור ישן ללשונית (?tab=trends / archive / overview / today) פותח את המגירה שלה
  const tab = new URLSearchParams(useLocation().search).get("tab");
  // חמש המגירות, זהות לכל מערכת (POLL_DRAWERS; הכרעת בעלים 02.11.2026). כל התוכן הקודם נשמר — רק חולק למגירות.
  return <div>
    <Fold title={POLL_DRAWERS.vs} open={tab === "vs" || tab === "latest"}>
      <div className="space-y-5"><Latest part="chart" /><Accuracy2026 /><Latest part="blocs" /></div>
    </Fold>
    <Fold title={POLL_DRAWERS.firms} open={tab === "firms"}>
      {/* דיוק הסקרים לכל רשימה וגוש, הסקר הקרוב והשילוב הקרוב — הועברו ממסך "תוצאות אמת" */}
      <div className="space-y-5"><Latest part="grid" /><Suspense fallback={loading}><GuessAccuracy part="polls" /></Suspense></div>
    </Fold>
    <Fold title={POLL_DRAWERS.exit} open={tab === "exit"}><Suspense fallback={loading}><ExitPollsCard /></Suspense></Fold>
    <Fold title={POLL_DRAWERS.trend} open={tab === "trends"}>
      <div className="space-y-5"><Latest part="trend" /><Suspense fallback={loading}><Trends /></Suspense></div>
    </Fold>
    <Fold title={POLL_DRAWERS.archive} open={tab === "archive"}><Suspense fallback={loading}><Polls /></Suspense></Fold>
    {/* המסכים הישנים — רק לפי המתג במסך הניהול, כמו קודם */}
    {overview && <Fold title="האחרונים" open={tab === "overview"}><Suspense fallback={loading}><SimpleOverview /></Suspense></Fold>}
    {today && <Fold title="היום" open={tab === "today"}><Suspense fallback={loading}><Today /></Suspense></Fold>}
  </div>;
}

export function PollsScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  // אותה שורת מערכת ואותן חמש מגירות בכל מערכת
  if (id === K26_ID) return <><h1 className="sr-only">סקרים</h1><ElectionLine id={id} /><Polls2026 /></>;
  return <><h1 className="sr-only">סקרים</h1><ElectionLine id={id} /><Accuracy id={id} /></>;
}

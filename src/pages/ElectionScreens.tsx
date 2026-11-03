import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { Fold, PageTitle } from "../components/ui";
import Missing, { POLL_DRAWERS } from "../components/Missing";
import LocalityResults from "../components/LocalityResults";
import OverviewCards from "../components/OverviewCards";
import { results } from "../lib/data";
import { K26_ID, SUMMARY_ID, electionOption, previousElection, useElection } from "../lib/election";
import { overviewOf } from "../lib/voterFlow";
import { useScreenShown } from "../lib/screenVisibility";
import Results, { ElectionSummary } from "./Results";
import Accuracy, { AccuracyAcross } from "./Accuracy";
import Voters from "./Voters";

/**
 * שלושת מסכי הבחירות, אחידים לכל מערכת (הכרעות בעלים 02.11.2026, docs/תוכנית-לשוניות-ניתוח-אחיד-02-11-2026.md):
 * "תוצאות" · "מה השתנה" · "סקרים", לפי בורר המערכת שבפס העליון. "סיכום" בבורר — ההשוואה בין המערכות.
 * 🔴 אין מחיקה: כל תצוגה שהייתה ב"היסטוריה", ב"דיוק הסקרים" וב"הסקרים" עברה לכאן כמו שהיא.
 */
const VoterFlow = lazy(() => import("./VoterFlow"));
const Trends = lazy(() => import("./Trends"));
const Polls = lazy(() => import("./Polls"));
const Today = lazy(() => import("./Today"));
const SimpleOverview = lazy(() => import("./simple/Overview"));
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
    <Fold title="מעבר בין מפלגות"><Missing what="מעבר המצביעים" /></Fold>
    <Fold title="מעבר בין גושים"><Missing what="המעבר בין גושים" /></Fold>
    <Fold title="תוצאות לפי יישוב"><LocalityResults key={id} electionId={id} /></Fold>
  </div>;
}

export function ChangesScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  if (id === K26_ID) return <Suspense fallback={loading}><VoterFlow /></Suspense>;
  return <PastChanges id={id} />;
}

/** "סקרים" של 2026: אחרונים, הסקרים מול התוצאה, ומגירות "מגמות" ו"ארכיון" (הכרעת בעלים 02.11.2026: שלושה מסכים) */
function Polls2026() {
  const overview = useScreenShown("overview"), today = useScreenShown("today");
  // קישור ישן ללשונית (?tab=trends / archive / overview / today) פותח את המגירה שלה
  const tab = new URLSearchParams(useLocation().search).get("tab");
  // חמש המגירות, זהות לכל מערכת (POLL_DRAWERS; הכרעת בעלים 02.11.2026). כל התוכן הקודם נשמר — רק חולק למגירות.
  return <div>
    {/* "הסקרים מול התוצאה" ומפת המכונים הוסרו — הנתונים בטבלאות הארכיון (הכרעת בעלים 03.11.2026) */}
    {/* מגירת "הסקר האחרון של כל מכון" הוסרה (הכרעת בעלים 03.11.2026) — הנתונים בטבלאות הארכיון */}
    <Fold title={POLL_DRAWERS.trend} open={tab === "trends"}>
      {/* גרף "גוש נתניהו לאורך זמן" הוסר מהמגירה (הכרעת בעלים 03.11.2026) */}
      <Suspense fallback={loading}><Trends /></Suspense>
    </Fold>
    <Fold title={POLL_DRAWERS.archive} open={["archive", "exit", "firms", "vs", "latest"].includes(tab ?? "")}><Suspense fallback={loading}><Polls /></Suspense></Fold>
    {/* המסכים הישנים — רק לפי המתג במסך הניהול, כמו קודם */}
    {overview && <Fold title="האחרונים" open={tab === "overview"}><Suspense fallback={loading}><SimpleOverview /></Suspense></Fold>}
    {today && <Fold title="היום" open={tab === "today"}><Suspense fallback={loading}><Today /></Suspense></Fold>}
  </div>;
}

export function PollsScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  // אותה שורת מערכת ואותן חמש מגירות בכל מערכת
  if (id === K26_ID) return <><h1 className="sr-only">סקרים</h1><Polls2026 /></>;
  return <><h1 className="sr-only">סקרים</h1><Accuracy id={id} /></>;
}

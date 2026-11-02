import { lazy, Suspense } from "react";
import { Fold, PageTitle } from "../components/ui";
import OverviewCards from "../components/OverviewCards";
import { results } from "../lib/data";
import { K26_ID, SUMMARY_ID, electionOption, previousElection, useElection } from "../lib/election";
import { overviewOf } from "../lib/voterFlow";
import { useScreenShown } from "../lib/screenVisibility";
import { Accuracy2026, Results2026 } from "./Results2026";
import Results, { ElectionSummary, PastBlocs } from "./Results";
import Accuracy, { AccuracyAcross } from "./Accuracy";
import Voters from "./Voters";
import Latest from "./Latest";

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

/** "נתון חסר · נשלים בהמשך" (הכרעת בעלים 02.11.2026): החלק נשאר במקומו, כדי שהמבנה יהיה זהה בכל מערכת */
export function Missing({ what }: { what?: string }) {
  return <p className="text-sm text-ink-soft">נתון חסר{what ? `: ${what}` : ""} · נשלים בהמשך</p>;
}

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
  if (id === K26_ID) return <><h1 className="sr-only">תוצאות</h1><Results2026 /></>;
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
  if (id === K26_ID) return <Suspense fallback={loading}><VoterFlow /></Suspense>;
  return <PastChanges id={id} />;
}

/** "סקרים" של 2026: אחרונים, הסקרים מול התוצאה, ומגירות "מגמות" ו"ארכיון" (הכרעת בעלים 02.11.2026: שלושה מסכים) */
function Polls2026() {
  const overview = useScreenShown("overview"), today = useScreenShown("today");
  return <div className="space-y-5">
    <Latest />
    <Accuracy2026 />
    <div>
      <Fold title="מגמות"><Suspense fallback={loading}><Trends /></Suspense></Fold>
      <Fold title="ארכיון"><Suspense fallback={loading}><Polls /></Suspense></Fold>
      {/* המסכים הישנים — רק לפי המתג במסך הניהול, כמו קודם */}
      {overview && <Fold title="האחרונים"><Suspense fallback={loading}><SimpleOverview /></Suspense></Fold>}
      {today && <Fold title="היום"><Suspense fallback={loading}><Today /></Suspense></Fold>}
    </div>
  </div>;
}

export function PollsScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  if (id === K26_ID) return <><h1 className="sr-only">סקרים</h1><Polls2026 /></>;
  return <><h1 className="sr-only">סקרים</h1><ElectionLine id={id} /><Accuracy id={id} /></>;
}

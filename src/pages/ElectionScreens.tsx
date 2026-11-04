import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { Fold, PageTitle } from "../components/ui";
import { POLL_DRAWERS } from "../components/Missing";
import { SUMMARY_ID, useElection } from "../lib/election";
import { useScreenShown } from "../lib/screenVisibility";
import { hasLineage } from "../lib/electionData";
import Results, { ElectionSummary } from "./Results";
import { AccuracyAcross } from "./Accuracy";
import Voters from "./Voters";

/**
 * שלושת מסכי הבחירות, אחידים לכל מערכת (הכרעות בעלים 02.11.2026, docs/תוכנית-לשוניות-ניתוח-אחיד-02-11-2026.md):
 * "תוצאות" · "מה השתנה" · "סקרים", לפי בורר המערכת שבפס העליון. "סיכום" בבורר — ההשוואה בין המערכות.
 * 🔴 אין מחיקה: כל תצוגה שהייתה ב"היסטוריה", ב"דיוק הסקרים" וב"הסקרים" עברה לכאן כמו שהיא.
 */
const VoterFlow = lazy(() => import("./VoterFlow"));
const LineageChanges = lazy(() => import("./Changes"));
const Trends = lazy(() => import("./Trends"));
const Polls = lazy(() => import("./Polls"));
const Today = lazy(() => import("./Today"));
const SimpleOverview = lazy(() => import("./simple/Overview"));
const loading = <p className="text-ink-soft">טוען…</p>;


/** "סיכום" בבורר: כל המערכות זו לצד זו, בעלי הזכות ושיעור ההצבעה, ודיוק הסקרים לאורך המערכות */
function Summary() {
  return <>
    <PageTitle lead="כל מערכות הבחירות מאז 2013, זו לצד זו.">סיכום</PageTitle>
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

export function ChangesScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  // אותו מסך לכל מערכת, כולל 2026 (הכרעת בעלים 04.11.2026); מה שאין לו נתון — "נתון חסר" באותו מקום
  const lineage = useScreenShown("lineage") && hasLineage(id);
  return <>
    <Suspense fallback={loading}><VoterFlow key={id} id={id} /></Suspense>
    {/* "מה השתנה" הישן — לפי שיוך הרשימות; רק לפי המתג במסך הניהול (הכרעת בעלים 04.11.2026: מסך ישן נמחק או מוצג לפי מתג הניהול) */}
    {lineage && <Fold title="לפי שיוך הרשימות"><Suspense fallback={loading}><LineageChanges /></Suspense></Fold>}
  </>;
}

/**
 * "סקרים" — אותו מסך לכל מערכת, כולל 2026 (הכרעת בעלים 04.11.2026: "המסך אותו מסך של הגרסה המעודכנת של 26, השינוי רק הנתונים").
 * תוכן "סקרים" הישן של 2015–2022 (מול התוצאה, הסקר האחרון של כל מכון, לאורך המערכה, כל הסקרים מהמערכה) עבר לטבלאות הארכיון,
 * לתגיות הדיוק ולמגירת "מגמות" — כמו שהוכרע ל־2026 ב־03.11.2026; ההשוואה בין המערכות — ב"סיכום".
 */
function PollsOf({ id }: { id: string }) {
  const overview = useScreenShown("overview"), today = useScreenShown("today");
  // קישור ישן ללשונית (?tab=trends / archive / overview / today) פותח את המגירה שלה
  const tab = new URLSearchParams(useLocation().search).get("tab");
  // חמש המגירות, זהות לכל מערכת (POLL_DRAWERS; הכרעת בעלים 02.11.2026). כל התוכן הקודם נשמר — רק חולק למגירות.
  return <div>
    {/* "הסקרים מול התוצאה" ומפת המכונים הוסרו — הנתונים בטבלאות הארכיון (הכרעת בעלים 03.11.2026) */}
    {/* מגירת "הסקר האחרון של כל מכון" הוסרה (הכרעת בעלים 03.11.2026) — הנתונים בטבלאות הארכיון */}
    {/* "כל הסקרים": מסננים ומגירות, ובסוף מגירת "מגמות" (הכרעת בעלים 03.11.2026) */}
    <Suspense fallback={loading}><Polls id={id} trailing={<Fold title={POLL_DRAWERS.trend} open={tab === "trends"}><Suspense fallback={loading}><Trends id={id} /></Suspense></Fold>} /></Suspense>
    {/* המסכים הישנים — רק לפי המתג במסך הניהול, כמו קודם. תמונת המצב של היום, לא של מערכת — ולכן אינם תלויים בבורר */}
    {overview && <Fold title="האחרונים" open={tab === "overview"}><Suspense fallback={loading}><SimpleOverview /></Suspense></Fold>}
    {today && <Fold title="היום" open={tab === "today"}><Suspense fallback={loading}><Today /></Suspense></Fold>}
  </div>;
}

export function PollsScreen() {
  const [id] = useElection();
  if (id === SUMMARY_ID) return <Summary />;
  return <><h1 className="sr-only">סקרים</h1><PollsOf id={id} /></>;
}

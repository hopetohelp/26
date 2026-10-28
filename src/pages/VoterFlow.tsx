import { lazy, Suspense, useCallback, useState } from "react";
import { useRegisterNavShare } from "../lib/navShare";
import Explained from "../components/Explained";
import { Segmented } from "../components/Choice";
import { Fold } from "../components/ui";
import { coverage, flow, flowsFor, partialLine, smallPct, type FlowRow, type Mode } from "../lib/voterFlow";
import { num, pctValue } from "../lib/format";

const BallotLookup = lazy(() => import("../components/BallotLookup"));
const FlowShare = lazy(() => import("../components/FlowShare"));

type View = "from" | "to";
const MODES: { id: Mode; label: string }[] = [
  { id: "ballots", label: "לפי קלפיות" },
  { id: "localities", label: "לפי יישובים" },
];
const VIEWS: { id: View; label: string; lead: string }[] = [
  { id: "from", label: "מאיפה הגיעו", lead: "מאיפה הגיעו המצביעים לכל מפלגה בבחירות הנוכחיות" },
  { id: "to", label: "לאן הלכו", lead: "לאן הלכו המצביעים לכל מפלגה בבחירות הקודמות" },
];
/** חלק קטן מ-3% מצטרף לשורה "אחרים" — כדי שכל כרטיס יישאר קריא */
const MIN_SHARE = 3;
/** רשימות שמוצגות תמיד בשורה נפרדת, גם מתחת ל-3% (הכרעת בעלים 28.10.2026) */
const ALWAYS = new Set(["reservists", "amcha", "code_black", "haredi_public", "noam"]);

function Row({ row, view }: { row: FlowRow; view: View }) {
  // הרשימות הקטנות — תמיד בשורה נפרדת, החל מ-0.1% (הכרעת בעלים 28.10.2026)
  const shown = (p: FlowRow["parts"][number]) => p.share >= MIN_SHARE || (ALWAYS.has(p.id) && smallPct(p.share) !== null);
  const main = row.parts.filter(shown);
  const rest = row.parts.filter((p) => !shown(p)).reduce((a, p) => a + p.share, 0);
  return (
    <li className="border-t border-paper-line py-3">
      <h3 className="font-bold">{row.name}</h3>
      <p className="text-xs text-ink-soft mb-2">{view === "from" ? "מצביעים ב-2026" : "בעלי זכות הבחירה ב-2022"}: {num(row.total)}</p>
      <ul className="space-y-1">
        {main.map((p) => (
          <li key={p.id} className="grid grid-cols-[minmax(7rem,10rem)_1fr_3.5rem] items-center gap-2 text-sm">
            <span className="truncate">{p.name}</span>
            <span className="h-3 flex justify-start rounded-sm bg-paper-line overflow-hidden" aria-hidden="true">
              <span className="block h-full bg-ink" style={{ width: `${p.share}%` }} />
            </span>
            <span className="tabular-nums text-end">{ALWAYS.has(p.id) && p.share < MIN_SHARE ? smallPct(p.share) : pctValue(p.share)}%</span>
          </li>
        ))}
        {rest >= 0.5 && (
          <li className="grid grid-cols-[minmax(7rem,10rem)_1fr_3.5rem] items-center gap-2 text-sm text-ink-soft">
            <span>אחרים</span><span /><span className="tabular-nums text-end">{pctValue(rest)}%</span>
          </li>
        )}
      </ul>
    </li>
  );
}

function Flows({ rows, view }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; view: View }) {
  const list = (view === "from" ? rows.cameFrom : rows.wentTo).filter((r) => r.id !== "abstain" || view === "from");
  return <ul className="mt-2">{list.map((r) => <Row key={r.id} row={r} view={view} />)}</ul>;
}

/** מה השתנה: מעבר מצביעים אמיתי בין 2022 ל-2026, לפי השוואת קלפיות (הכרעות בעלים 28.10.2026) */
export default function VoterFlow() {
  const [mode, setMode] = useState<Mode>("ballots");
  const [view, setView] = useState<View>("from");
  const cov = { ballots: coverage("ballots"), localities: coverage("localities") };
  const data = flowsFor(mode);
  const lead = VIEWS.find((v) => v.id === view)!.lead;
  const [sharing, setSharing] = useState(false);
  useRegisterNavShare(useCallback(() => setSharing(true), []), false);
  return (
    <div>
      <h1 className="text-2xl font-display leading-tight">מה השתנה: 2022 מול 2026</h1>
      <p className="text-sm text-ink-soft">{partialLine()}</p>
      <Segmented label="יחידת ההשוואה" value={mode} onChange={setMode} options={MODES} className="w-64 mt-4" />
      <p className="text-sm text-ink-soft mt-2">
        החלוקה לקלפיות השתנתה, ולכן קלפי מדויקת מכסה רק {pctValue(cov.ballots.ballot)}% מהקולות, ועם מיקום הקלפי {pctValue(cov.ballots.total)}%.
        לפי יישובים — {pctValue(cov.localities.total)}%, אך פחות מדויק בערים גדולות ומעורבות. המעטפות הכפולות נמדדות כיישוב אחד.
      </p>
      <Segmented label="כיוון ההשוואה" value={view} onChange={setView} options={VIEWS} className="w-64 mt-4" />
      <p className="text-sm mt-2" aria-live="polite">{lead}</p>
      <Explained
        kind="השוואה"
        source="תוצאות האמת לפי קלפי: 2022 (data.gov.il) ו-2026 (ועדת הבחירות המרכזית)"
        asOf={flow.asOf}
        assumption="כל קלפי מושווית לאותה קלפי; קלפי שחלוקתה השתנתה — לפי הקלפי השלמה, אחר כך לפי מיקום הקלפי, ובמתג היישובים — לפי היישוב. שיעור מעבר אחד לכל הארץ; אין שימוש בסקרים."
        methodAnchor="voter-flow"
      >
        <Flows rows={data.lists} view={view} />
        <h2 className="text-xl font-display leading-tight mt-8">מעבר בין הגושים</h2>
        <Flows rows={data.blocs} view={view} />
      </Explained>
      {sharing && <Suspense fallback={null}><FlowShare mode={mode} onClose={() => setSharing(false)} /></Suspense>}
      <Fold title="בדיקה לפי קלפי, מיקום או יישוב">
        <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><BallotLookup /></Suspense>
      </Fold>
    </div>
  );
}

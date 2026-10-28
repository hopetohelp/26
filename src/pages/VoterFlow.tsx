import { useState } from "react";
import Explained from "../components/Explained";
import { Segmented } from "../components/Choice";
import { Fold, Note } from "../components/ui";
import { cameFrom, coverage, flow, wentTo, type FlowRow } from "../lib/voterFlow";
import { num, pctValue } from "../lib/format";

type View = "from" | "to";
const VIEWS: { id: View; label: string; lead: string }[] = [
  { id: "from", label: "מאיפה הגיעו", lead: "מאיפה הגיעו המצביעים לכל מפלגה בבחירות הנוכחיות" },
  { id: "to", label: "לאן הלכו", lead: "לאן הלכו המצביעים לכל מפלגה בבחירות הקודמות" },
];
/** חלק קטן מ-3% מצטרף לשורה "אחרים" — כדי שכל כרטיס יישאר קריא */
const MIN_SHARE = 3;
/** רשימות שמוצגות תמיד בשורה נפרדת, גם מתחת ל-3% (הכרעת בעלים 28.10.2026) */
const ALWAYS = new Set(["reservists", "amcha", "code_black", "haredi_public", "noam"]);

function Row({ row, view }: { row: FlowRow; view: View }) {
  const shown = (p: FlowRow["parts"][number]) => p.share >= MIN_SHARE || ALWAYS.has(p.id);
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
            <span className="tabular-nums text-end">{pctValue(p.share)}%</span>
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

/** מה השתנה: מעבר מצביעים אמיתי בין 2022 ל-2026, לפי השוואת כל קלפי לאותה קלפי (הכרעת בעלים 28.10.2026) */
export default function VoterFlow() {
  const [view, setView] = useState<View>("from");
  const rows = (view === "from" ? cameFrom : wentTo).filter((r) => r.id !== "abstain" || view === "from");
  return (
    <div>
      <h1 className="text-2xl font-display leading-tight">מה השתנה: 2022 מול 2026</h1>
      <p className="mt-1">כל קלפי נמדדת מול אותה קלפי ב-2022. מכאן נקבע מאיפה הגיעו המצביעים של כל רשימה.</p>
      <p className="text-sm text-ink-soft mt-1">
        {num(flow.ballots)} קלפיות שהיו גם ב-2022, מתוך {num(flow.ballots2026)} שנספרו · {pctValue(coverage)}% מהקולות שנספרו
      </p>
      <Segmented label="כיוון ההשוואה" value={view} onChange={setView} options={VIEWS} className="w-64 mt-4" />
      <p className="text-sm mt-2" aria-live="polite">{VIEWS.find((v) => v.id === view)!.lead}</p>
      <Explained
        kind="השוואה"
        source="תוצאות האמת לפי קלפי: 2022 (data.gov.il) ו-2026 (ועדת הבחירות המרכזית)"
        asOf={flow.asOf}
        assumption="אותה קלפי = אותו יישוב ואותו מספר קלפי בשתי המערכות. שיעור המעבר נקבע כך שיתאים יחד לכל הקלפיות; אין שימוש בסקרים."
        methodAnchor="voter-flow"
      >
        <ul className="mt-4">{rows.map((r) => <Row key={r.id} row={r} view={view} />)}</ul>
      </Explained>
      <Fold title="מה לא נכלל">
        <Note>
          קלפי של 2026 שאין לה מספר זהה ב-2022 (קלפי חדשה) לא נכללת. השיעורים הם הערכה אחת לכל הארץ, שמתאימה ביותר
          לתוצאות כל הקלפיות יחד; אין דרך לדעת איך הצביע אדם מסוים. "לא הצביעו" כולל גם מי שנוסף לרשימת הבוחרים או יצא ממנה.
        </Note>
      </Fold>
    </div>
  );
}

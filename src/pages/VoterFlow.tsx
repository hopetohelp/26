import { lazy, Suspense, useCallback, useState } from "react";
import { useRegisterNavShare } from "../lib/navShare";
import Explained from "../components/Explained";
import { Segmented } from "../components/Choice";
import { Fold } from "../components/ui";
import { bloc2022, bloc2026, coverage, flow, flowsFor, partialLine, smallPct, type FlowRow, type Mode } from "../lib/voterFlow";
import { PartyAvatar } from "../components/PartyAvatar";
import { num, pctValue } from "../lib/format";

const BallotLookup = lazy(() => import("../components/BallotLookup"));
const FlowShare = lazy(() => import("../components/FlowShare"));

type View = "from" | "to";
const MODES: { id: Mode; label: string }[] = [
  { id: "localities", label: "לפי יישובים" },
  { id: "ballots", label: "לפי קלפיות" },
];
const VIEWS: { id: View; label: string; lead: string }[] = [
  { id: "from", label: "מאיפה הגיעו", lead: "מאיפה הגיעו המצביעים לכל מפלגה בבחירות הנוכחיות" },
  { id: "to", label: "לאן הלכו", lead: "לאן הלכו המצביעים לכל מפלגה בבחירות הקודמות" },
];
/** חלק קטן מ-3% מצטרף לשורה "אחרים" — כדי שכל כרטיס יישאר קריא */
const MIN_SHARE = 3;
/** רשימות שמוצגות תמיד בשורה נפרדת, גם מתחת ל-3% (הכרעת בעלים 28.10.2026) */
const ALWAYS = new Set(["reservists", "amcha", "code_black", "haredi_public", "noam"]);

/** צבע הגוש מטוקני האתר (--bloc-1..4 לפי סדר SIMPLE_BLOCS); בגזרה הטוקנים מתחלפים לצבעי הגזרה (הכרעת בעלים 28.10.2026) */
const BLOC_TOKEN: Record<string, string> = { netanyahu: "--bloc-1", haredi: "--bloc-2", arab: "--bloc-3", eisenkot: "--bloc-4" };
const blocFill = (bloc: string) => `rgb(var(${BLOC_TOKEN[bloc] ?? "--bloc-miss"}))`;
/** תמונת יו"ר לרשימת 2022 — רק כשזו אותה מפלגה ואותו יו"ר כמו ב-2026 */
const IMG_2022: Record<string, string> = { "מחל": "likud", "שס": "shas", "ג": "utj", "ל": "yb", "ט": "rzp", "עם": "raam", "כן": "bluewhite" };

function Row({ row, view, colorOf }: { row: FlowRow; view: View; colorOf: (id: string) => string }) {
  const shown = (p: FlowRow["parts"][number]) => p.share >= MIN_SHARE || (ALWAYS.has(p.id) && smallPct(p.share) !== null);
  const main = row.parts.filter(shown);
  const rest = row.parts.filter((p) => !shown(p)).reduce((a, p) => a + p.share, 0);
  const img = view === "from" ? row.id : IMG_2022[row.id] ?? "";
  return (
    <li className="border-t border-paper-line py-3 grid grid-cols-[4.5rem_1fr] md:grid-cols-[6.5rem_1fr] gap-2 md:gap-3">
      {/* מימין: תמונת יו"ר הרשימה, ומתחתיה השם בשתי שורות לכל היותר */}
      <div className="flex flex-col items-start gap-1">
        <PartyAvatar id={img} size={48} />
        <h3 className="font-bold leading-tight line-clamp-2">{row.name}</h3>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-ink-soft mb-2">{view === "from" ? "מצביעים ב-2026" : "בעלי זכות הבחירה ב-2022"}: {num(row.total)}</p>
        <ul className="space-y-1">
          {main.map((p) => (
            <li key={p.id} className="grid grid-cols-[minmax(4.5rem,9rem)_1fr_3rem] items-center gap-2 text-sm">
              <span className="truncate">{p.name}</span>
              <span className="h-3 flex justify-start rounded-sm bg-paper-line overflow-hidden" aria-hidden="true">
                <span className="block h-full" style={{ width: `${p.share}%`, background: blocFill(colorOf(p.id)) }} />
              </span>
              <span className="tabular-nums text-end">{ALWAYS.has(p.id) && p.share < MIN_SHARE ? smallPct(p.share) : pctValue(p.share)}%</span>
            </li>
          ))}
          {rest >= 0.5 && (
            <li className="grid grid-cols-[minmax(4.5rem,9rem)_1fr_3rem] items-center gap-2 text-sm text-ink-soft">
              <span>אחרים</span><span /><span className="tabular-nums text-end">{pctValue(rest)}%</span>
            </li>
          )}
        </ul>
      </div>
    </li>
  );
}

/** אותה מפלגה בשתי הבחירות (אותה רשימה ואותן אותיות) — לשורה משותפת במסך רחב */
const SAME: Record<string, string> = { likud: "מחל", democrats: "אמת", utj: "ג", yb: "ל", shas: "שס", rzp: "ט", raam: "עם", other: "other", abstain: "abstain" };
/** כחול לבן (בני גנץ) — התמודדה ב-2022 כמחנה הממלכתי ופרשה לפני ההצבעה ב-2026 */
const RETIRED: Record<string, string> = { "כן": "כחול לבן" };

function Empty({ name, text, img }: { name: string; text: string; img: string }) {
  return (
    <li className="border-t border-paper-line py-3 grid grid-cols-[4.5rem_1fr] md:grid-cols-[6.5rem_1fr] gap-2 md:gap-3">
      <div className="flex flex-col items-start gap-1">
        <PartyAvatar id={img} size={48} />
        <h3 className="font-bold leading-tight line-clamp-2">{name}</h3>
      </div>
      <p className="text-sm text-ink-soft self-center">{text}</p>
    </li>
  );
}

/** מסך רחב: שני טורים — "מאיפה הגיעו" (2026) ו"לאן הלכו" (2022); אותה מפלגה באותה שורה; מפלגה שלא רצה — כרטיס ריק (הכרעת בעלים 28.10.2026) */
function Paired({ rows, same, fromColor, toColor }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; same: (id: string) => string | undefined; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const used = new Set<string>();
  const pairs: [JSX.Element, JSX.Element][] = rows.cameFrom.map((r) => {
    const o = same(r.id), old = o ? rows.wentTo.find((w) => w.id === o) : undefined;
    if (old) used.add(old.id);
    return [<Row key={r.id} row={r} view="from" colorOf={fromColor} />, old ? <Row key={old.id} row={old} view="to" colorOf={toColor} /> : <Empty key={`e-${r.id}`} name={r.name} img={r.id} text="המפלגה לא רצה בבחירות אלו" />];
  });
  for (const w of rows.wentTo.filter((w) => !used.has(w.id))) {
    const retired = RETIRED[w.id];
    pairs.push([<Empty key={`e-${w.id}`} name={retired ?? w.name} img={IMG_2022[w.id] ?? ""} text={retired ? "המפלגה פרשה לפני ההצבעה" : "המפלגה לא רצה בבחירות אלו"} />, <Row key={w.id} row={w} view="to" colorOf={toColor} />]);
  }
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-8">
      <li className="font-bold text-ink-soft">{VIEWS[0].lead}</li>
      <li className="font-bold text-ink-soft">{VIEWS[1].lead}</li>
      {pairs.flat()}
    </ul>
  );
}

function Flows({ rows, view, fromColor, toColor }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; view: View; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const list = (view === "from" ? rows.cameFrom : rows.wentTo).filter((r) => r.id !== "abstain" || view === "from");
  return <ul className="mt-2">{list.map((r) => <Row key={r.id} row={r} view={view} colorOf={view === "from" ? fromColor : toColor} />)}</ul>;
}

/** מה השתנה: מעבר מצביעים אמיתי בין 2022 ל-2026, לפי השוואת קלפיות (הכרעות בעלים 28.10.2026) */
export default function VoterFlow() {
  // ברירת המחדל — לפי יישובים: אותן מדרגות מהמדויק לפחות מדויק, ובנוסף שאר הקלפיות (הכרעת בעלים 28.10.2026)
  const [mode, setMode] = useState<Mode>("localities");
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
        השיוך לפי קלפיות זהות מדויק יותר, אבל מכסה רק {pctValue(cov.ballots.total)}% מהקולות, ומניח שההתפלגות זהה בשאר הקולות.
        השיוך לפי יישובים משייך את השארית לפי ההתפלגות בכל היישוב, אבל זה פחות מדויק בערים גדולות ומעורבות. (המעטפות הכפולות נמדדות כיישוב אחד)
      </p>
      <div className="md:hidden">
        <Segmented label="כיוון ההשוואה" value={view} onChange={setView} options={VIEWS} className="w-64 mt-4" />
        <p className="text-sm mt-2" aria-live="polite">{lead}</p>
      </div>
      <Explained
        kind="השוואה"
        source="תוצאות האמת לפי קלפי: 2022 (data.gov.il) ו-2026 (ועדת הבחירות המרכזית)"
        asOf={flow.asOf}
        assumption="כל קלפי מושווית לאותה קלפי; קלפי שחלוקתה השתנתה — לפי הקלפי השלמה, אחר כך לפי מיקום הקלפי, ובמתג היישובים — לפי היישוב. שיעור מעבר אחד לכל הארץ; אין שימוש בסקרים."
        methodAnchor="voter-flow"
      >
        <div className="md:hidden"><Flows rows={data.lists} view={view} fromColor={bloc2022} toColor={bloc2026} /></div>
        <div className="hidden md:block"><Paired rows={data.lists} same={(id) => SAME[id]} fromColor={bloc2022} toColor={bloc2026} /></div>
        <h2 className="text-xl font-display leading-tight mt-8">מעבר בין הגושים</h2>
        <div className="md:hidden"><Flows rows={data.blocs} view={view} fromColor={(id) => id} toColor={(id) => id} /></div>
        <div className="hidden md:block"><Paired rows={data.blocs} same={(id) => id} fromColor={(id) => id} toColor={(id) => id} /></div>
      </Explained>
      {sharing && <Suspense fallback={null}><FlowShare mode={mode} onClose={() => setSharing(false)} /></Suspense>}
      <Fold title="בדיקה לפי קלפי, מיקום או יישוב">
        <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><BallotLookup /></Suspense>
      </Fold>
    </div>
  );
}

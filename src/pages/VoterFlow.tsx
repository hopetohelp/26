import { lazy, Suspense, useCallback, useState } from "react";
import { useRegisterNavShare } from "../lib/navShare";
import Explained from "../components/Explained";
import { Segmented } from "../components/Choice";
import { Fold } from "../components/ui";
import InfoTip from "../components/InfoTip";
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

/** גוף הכרטיס: מספר המצביעים והפסים — בלי השם (השם והתמונה פעם אחת לכל שורה) */
function Body({ row, view, colorOf }: { row: FlowRow; view: View; colorOf: (id: string) => string }) {
  const shown = (p: FlowRow["parts"][number]) => p.share >= MIN_SHARE || (ALWAYS.has(p.id) && smallPct(p.share) !== null);
  const main = row.parts.filter(shown);
  const rest = row.parts.filter((p) => !shown(p)).reduce((a, p) => a + p.share, 0);
  return (
    <div className="min-w-0 w-full">
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
  );
}

/** טור אחד (טלפון): שורה אחת בראש הכרטיס — תמונה ושם; מתחת — הגוף */
function Row({ row, view, colorOf }: { row: FlowRow; view: View; colorOf: (id: string) => string }) {
  return (
    <li className="border-t border-paper-line py-3">
      <h3 className="font-bold flex items-center gap-2 mb-1"><PartyAvatar id={view === "from" ? row.id : IMG_2022[row.id] ?? ""} size={28} />{row.name}</h3>
      <Body row={row} view={view} colorOf={colorOf} />
    </li>
  );
}

/** אותה מפלגה בשתי הבחירות (אותה רשימה ואותן אותיות) — לשורה משותפת במסך רחב */
const SAME: Record<string, string> = { likud: "מחל", democrats: "אמת", utj: "ג", yb: "ל", shas: "שס", rzp: "ט", raam: "עם", other: "other", abstain: "abstain" };
/** כחול לבן (בני גנץ) — התמודדה ב-2022 כמחנה הממלכתי ופרשה לפני ההצבעה ב-2026 */
const RETIRED: Record<string, string> = { "כן": "כחול לבן" };

/** מסך רחב: שם ותמונה פעם אחת מימין (טור צר), ואחריהם שני טורים — "מאיפה הגיעו" (2026) ו"לאן הלכו" (2022); מפלגה שלא רצה — "המפלגה לא רצה בבחירות אלו" (הכרעת בעלים 28.10.2026) */
function Paired({ rows, same, fromColor, toColor }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; same: (id: string) => string | undefined; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const used = new Set<string>();
  const empty = (text: string) => <p className="text-sm text-ink-soft self-center">{text}</p>;
  const lines: { key: string; img: string; name: string; sub?: string; from: JSX.Element; to: JSX.Element }[] = rows.cameFrom.map((r) => {
    const o = same(r.id), old = o ? rows.wentTo.find((w) => w.id === o) : undefined;
    if (old) used.add(old.id);
    return {
      key: r.id, img: r.id, name: r.name, sub: old && old.name !== r.name ? old.name : undefined,
      from: <Body row={r} view="from" colorOf={fromColor} />,
      to: old ? <Body row={old} view="to" colorOf={toColor} /> : empty("המפלגה לא רצה בבחירות אלו"),
    };
  });
  for (const w of rows.wentTo.filter((w) => !used.has(w.id))) {
    const retired = RETIRED[w.id];
    lines.push({ key: w.id, img: IMG_2022[w.id] ?? "", name: retired ?? w.name, sub: retired ? w.name : undefined,
      from: empty(retired ? "המפלגה פרשה לפני ההצבעה" : "המפלגה לא רצה בבחירות אלו"), to: <Body row={w} view="to" colorOf={toColor} /> });
  }
  return (
    <div className="mt-2 grid grid-cols-[max-content_1fr_1fr] gap-x-6">
      <span /><span className="font-bold text-ink-soft pb-2">{VIEWS[0].lead}</span><span className="font-bold text-ink-soft pb-2">{VIEWS[1].lead}</span>
      {lines.map((l) => (
        <div key={l.key} className="contents">
          <div className="border-t border-paper-line py-3 flex flex-col items-start gap-1 max-w-[6rem]">
            <PartyAvatar id={l.img} size={44} />
            <h3 className="font-bold leading-tight line-clamp-2">{l.name}</h3>
            {l.sub && <span className="text-xs text-ink-soft leading-tight">ב-2022: {l.sub}</span>}
          </div>
          <div className="border-t border-paper-line py-3 flex">{l.from}</div>
          <div className="border-t border-paper-line py-3 flex">{l.to}</div>
        </div>
      ))}
    </div>
  );
}

function Flows({ rows, view, fromColor, toColor }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; view: View; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const list = (view === "from" ? rows.cameFrom : rows.wentTo).filter((r) => r.id !== "abstain" || view === "from");
  return <ul className="mt-2">{list.map((r) => <Row key={r.id} row={r} view={view} colorOf={view === "from" ? fromColor : toColor} />)}</ul>;
}

type Rows = { cameFrom: FlowRow[]; wentTo: FlowRow[] };
/** בלי השורות שאינן אמינות (הכרעת בעלים 28.10.2026): "רשימות אחרות" — בהשוואה לקלפיות המצביעים של 2026 בהן יוצאים 100% "לא הצביעו" (חוסר יציבות בקבוצה זעירה); "לא הצביעו" בחלק המפלגות */
const without = (r: Rows, ids: string[]): Rows => ({ cameFrom: r.cameFrom.filter((x) => !ids.includes(x.id)), wentTo: r.wentTo.filter((x) => !ids.includes(x.id)) });

/** מה השתנה: מעבר מצביעים אמיתי בין 2022 ל-2026, לפי השוואת קלפיות (הכרעות בעלים 28.10.2026) */
export default function VoterFlow() {
  // ברירת המחדל — לפי יישובים: אותן מדרגות מהמדויק לפחות מדויק, ובנוסף שאר הקלפיות (הכרעת בעלים 28.10.2026)
  const [mode, setMode] = useState<Mode>("localities");
  const [view, setView] = useState<View>("from");
  const cov = { ballots: coverage("ballots"), localities: coverage("localities") };
  const raw = flowsFor(mode);
  const data = { lists: without(raw.lists, ["other", "abstain"]), blocs: without(raw.blocs, ["other"]) };
  const lead = VIEWS.find((v) => v.id === view)!.lead;
  const [sharing, setSharing] = useState(false);
  useRegisterNavShare(useCallback(() => setSharing(true), []), false);
  return (
    <div>
      <h1 className="text-2xl font-display leading-tight">מה השתנה: 2022 מול 2026</h1>
      <p className="text-sm text-ink-soft">{partialLine()}</p>
      <div className="flex items-center gap-2 mt-4">
        <Segmented label="יחידת ההשוואה" value={mode} onChange={setMode} options={MODES} className="w-64" />
        <InfoTip label="מה ההבדל בין קלפיות ליישובים?">
          השיוך לפי קלפיות זהות מדויק יותר, אבל מכסה רק {pctValue(cov.ballots.total)}% מהקולות, ומניח שההתפלגות זהה בשאר הקולות.
          השיוך לפי יישובים משייך את השארית לפי ההתפלגות בכל היישוב, אבל זה פחות מדויק בערים גדולות ומעורבות. (המעטפות הכפולות נמדדות כיישוב אחד)
        </InfoTip>
      </div>
      <div className="md:hidden">
        <div className="flex items-center gap-2 mt-4">
          <Segmented label="כיוון ההשוואה" value={view} onChange={setView} options={VIEWS} className="w-64" />
          <InfoTip label="מה מוצג בכיוון הזה?">{lead}</InfoTip>
        </div>
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

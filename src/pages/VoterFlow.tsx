import { lazy, Suspense, useCallback, useId, useRef, useState } from "react";
import { useRegisterNavShare } from "../lib/navShare";
import Explained from "../components/Explained";
import { Segmented } from "../components/Choice";
import { Fold } from "../components/ui";
import InfoTip from "../components/InfoTip";
import RotatingPromo from "../components/RotatingPromo";
import { bloc2022, bloc2026, coverage, flow, flowsFor, partialLine, partyNumbers, SAME, smallPct, type FlowRow, type Mode } from "../lib/voterFlow";
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
const SHARE_MESSAGES = [
  "רוצים פוסט מעוצב על המפלגות החרדיות?",
  "רוצים תמונה של השינוי בכל המפלגות?",
  "או אולי תמונה על העיר שלכם?",
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
function Body({ row, view, colorOf, total = true }: { row: FlowRow; view: View; colorOf: (id: string) => string; total?: boolean }) {
  const shown = (p: FlowRow["parts"][number]) => p.share >= MIN_SHARE || (ALWAYS.has(p.id) && smallPct(p.share) !== null);
  const main = row.parts.filter(shown);
  const rest = row.parts.filter((p) => !shown(p)).reduce((a, p) => a + p.share, 0);
  return (
    <div className="min-w-0 w-full">
      {total && <p className="text-xs text-ink-soft mb-2">{view === "from" ? "קולות ב-2026" : "קולות ב-2022"}: {num(row.total)}</p>}
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

/** הקולות והמנדטים הרשמיים אז והיום (הכרעת בעלים 28.10.2026): שורה לכל שנה; מפלגה שלא רצה — "לא רצה" */
function Stats({ id26, letters22 }: { id26: string | null; letters22: string | null }) {
  const { y2022, y2026 } = partyNumbers(id26, letters22);
  const line = (year: string, v: { votes: number; seats: number } | null) => (
    <p className="text-xs text-ink-soft tabular-nums whitespace-nowrap">
      <span className="font-bold text-ink">{year}:</span> {v ? `${num(v.votes)} קולות · ${v.seats} מנדטים` : "לא רצה"}
    </p>
  );
  return <div className="mb-2">{line("2022", y2022)}{line("2026", y2026)}</div>;
}

const LETTERS_TO_ID: Record<string, string> = Object.fromEntries(Object.entries(SAME).map(([id, l]) => [l, id]));
/** מפלגה אמיתית (לא "אחרים", "לא הצביעו" או "יישובים חדשים") — לה מוצגים הקולות והמנדטים */
const isParty = (id: string) => !["other", "abstain", "new"].includes(id);

/** טור אחד (טלפון): שורה אחת בראש הכרטיס — תמונה ושם; מתחתיה שתי שורות הקולות והמנדטים (2022, 2026); מתחת — הגוף */
function Row({ row, view, colorOf, stats }: { row: FlowRow; view: View; colorOf: (id: string) => string; stats: boolean }) {
  const id26 = view === "from" ? row.id : LETTERS_TO_ID[row.id] ?? null;
  const letters22 = view === "from" ? SAME[row.id] ?? null : row.id;
  const show = stats && isParty(row.id);
  return (
    <li className="border-t border-paper-line py-3">
      <h3 className="font-bold flex items-center gap-2 mb-1"><PartyAvatar id={view === "from" ? row.id : IMG_2022[row.id] ?? ""} size={28} />{row.name}</h3>
      {show && <Stats id26={id26} letters22={letters22} />}
      <Body row={row} view={view} colorOf={colorOf} total={!show} />
    </li>
  );
}

/** כיוון אישי לכל מפלגה בטלפון: ימינה למקור המצביעים, שמאלה ליעד; גלילה אנכית נשארת טבעית. */
function SwipePartyRow({ row, from, to, view, fromColor, toColor }: { row: FlowRow; from?: FlowRow; to?: FlowRow; view: View; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const [selected, setSelected] = useState(view);
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const panelId = useId();
  return (
    <li className="flow-swipe-card border-t border-paper-line py-3" data-party={row.id} data-direction={selected} style={{ touchAction: "pan-y pinch-zoom" }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch" || !e.isPrimary || (e.target as Element).closest("button,a,input")) return;
        start.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerCancel={() => { start.current = null; }}
      onPointerUp={(e) => {
        const first = start.current; start.current = null;
        if (!first || first.pointer !== e.pointerId) return;
        const dx = e.clientX - first.x, dy = e.clientY - first.y;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) setSelected(dx > 0 ? "from" : "to");
      }}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h3 className="font-bold flex items-center gap-2"><PartyAvatar id={view === "from" ? row.id : IMG_2022[row.id] ?? ""} size={28} />{row.name}</h3>
        <div className="flex items-center gap-1" role="group" aria-label={`כיוון ההשוואה של ${row.name}`}>
          <button type="button" aria-label={`מאיפה הגיעו — ${row.name}`} aria-pressed={selected === "from"} aria-controls={`${panelId}-from`} onClick={() => setSelected("from")} className="min-h-[44px] min-w-[44px] rounded-theme border border-paper-line bg-paper-card text-ink">→</button>
          <span className="text-xs text-ink-soft min-w-[4.5rem] text-center" aria-live="polite">{selected === "from" ? "מאיפה הגיעו" : "לאן הלכו"}</span>
          <button type="button" aria-label={`לאן הלכו — ${row.name}`} aria-pressed={selected === "to"} aria-controls={`${panelId}-to`} onClick={() => setSelected("to")} className="min-h-[44px] min-w-[44px] rounded-theme border border-paper-line bg-paper-card text-ink">←</button>
        </div>
      </div>
      <Stats id26={from?.id ?? null} letters22={to?.id ?? null} />
      <div className="flow-swipe-panels">
        {(["from", "to"] as const).map((direction) => {
          const data = direction === "from" ? from : to;
          return <div key={direction} id={`${panelId}-${direction}`} className="flow-swipe-panel" data-view={direction} data-active={selected === direction} aria-hidden={selected !== direction}>
            {data ? <Body row={data} view={direction} colorOf={direction === "from" ? fromColor : toColor} total={false} /> : <p className="text-sm text-ink-soft">המפלגה לא רצה בבחירות אלו</p>}
          </div>;
        })}
      </div>
    </li>
  );
}

/** אותה מפלגה בשתי הבחירות — לשורה משותפת במסך רחב (SAME מהספרייה, ו"אחרים"/"לא הצביעו" לעצמם) */
const SAME_ROW: Record<string, string> = { ...SAME, other: "other", abstain: "abstain" };
/** כחול לבן (בני גנץ) — התמודדה ב-2022 כמחנה הממלכתי ופרשה לפני ההצבעה ב-2026 */
const RETIRED: Record<string, string> = { "כן": "כחול לבן" };

/** מסך רחב: שם ותמונה פעם אחת מימין (טור צר), ואחריהם שני טורים — "מאיפה הגיעו" (2026) ו"לאן הלכו" (2022); מפלגה שלא רצה — "המפלגה לא רצה בבחירות אלו" (הכרעת בעלים 28.10.2026) */
function Paired({ rows, same, fromColor, toColor, stats = false }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; same: (id: string) => string | undefined; fromColor: (id: string) => string; toColor: (id: string) => string; stats?: boolean }) {
  const used = new Set<string>();
  const empty = (text: string) => <p className="text-sm text-ink-soft self-center">{text}</p>;
  const lines: { key: string; img: string; name: string; sub?: string; id26: string | null; letters22: string | null; from: JSX.Element; to: JSX.Element }[] = rows.cameFrom.map((r) => {
    const o = same(r.id), old = o ? rows.wentTo.find((w) => w.id === o) : undefined;
    if (old) used.add(old.id);
    const show = stats && isParty(r.id);
    return {
      key: r.id, img: r.id, name: r.name, sub: old && old.name !== r.name ? old.name : undefined, id26: show ? r.id : null, letters22: show ? old?.id ?? null : null,
      from: <Body row={r} view="from" colorOf={fromColor} total={!show} />,
      to: old ? <Body row={old} view="to" colorOf={toColor} total={!show} /> : empty("המפלגה לא רצה בבחירות אלו"),
    };
  });
  for (const w of rows.wentTo.filter((w) => !used.has(w.id))) {
    const retired = RETIRED[w.id];
    const show = stats && isParty(w.id);
    lines.push({ key: w.id, img: IMG_2022[w.id] ?? "", name: retired ?? w.name, sub: retired ? w.name : undefined, id26: null, letters22: show ? w.id : null,
      from: empty(retired ? "המפלגה פרשה לפני ההצבעה" : "המפלגה לא רצה בבחירות אלו"), to: <Body row={w} view="to" colorOf={toColor} total={!show} /> });
  }
  return (
    <div className="mt-2 grid grid-cols-[max-content_1fr_1fr] gap-x-6">
      <span /><span className="font-bold text-ink-soft pb-2">{VIEWS[0].lead}</span><span className="font-bold text-ink-soft pb-2">{VIEWS[1].lead}</span>
      {lines.map((l) => (
        <div key={l.key} className="contents">
          <div className="border-t border-paper-line py-3 flex flex-col items-start gap-1 max-w-[13rem]">
            <PartyAvatar id={l.img} size={44} />
            <h3 className="font-bold leading-tight line-clamp-2">{l.name}</h3>
            {l.sub && <span className="text-xs text-ink-soft leading-tight">ב-2022: {l.sub}</span>}
            {(l.id26 || l.letters22) && <Stats id26={l.id26} letters22={l.letters22} />}
          </div>
          <div className="border-t border-paper-line py-3 flex">{l.from}</div>
          <div className="border-t border-paper-line py-3 flex">{l.to}</div>
        </div>
      ))}
    </div>
  );
}

function Flows({ rows, view, fromColor, toColor, stats = false, resetKey = 0 }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; view: View; fromColor: (id: string) => string; toColor: (id: string) => string; stats?: boolean; resetKey?: number }) {
  const list = (view === "from" ? rows.cameFrom : rows.wentTo).filter((r) => r.id !== "abstain" || view === "from");
  return <ul className="mt-2">{list.map((r) => {
    if (!stats || !isParty(r.id)) return <Row key={r.id} row={r} view={view} colorOf={view === "from" ? fromColor : toColor} stats={stats} />;
    const from = view === "from" ? r : rows.cameFrom.find((p) => SAME[p.id] === r.id);
    const to = view === "to" ? r : rows.wentTo.find((p) => p.id === SAME[r.id]);
    return <SwipePartyRow key={`${view}:${resetKey}:${r.id}`} row={r} from={from} to={to} view={view} fromColor={fromColor} toColor={toColor} />;
  })}</ul>;
}

type Rows = { cameFrom: FlowRow[]; wentTo: FlowRow[] };
/** בלי השורות שאינן אמינות (הכרעת בעלים 28.10.2026): "רשימות אחרות" — בהשוואה לקלפיות המצביעים של 2026 בהן יוצאים 100% "לא הצביעו" (חוסר יציבות בקבוצה זעירה); "לא הצביעו" בחלק המפלגות */
const without = (r: Rows, ids: string[]): Rows => ({ cameFrom: r.cameFrom.filter((x) => !ids.includes(x.id)), wentTo: r.wentTo.filter((x) => !ids.includes(x.id)) });

/** מה השתנה: מעבר מצביעים אמיתי בין 2022 ל-2026, לפי השוואת קלפיות (הכרעות בעלים 28.10.2026) */
export default function VoterFlow() {
  // ברירת המחדל — לפי יישובים: אותן מדרגות מהמדויק לפחות מדויק, ובנוסף שאר הקלפיות (הכרעת בעלים 28.10.2026)
  const [mode, setMode] = useState<Mode>("localities");
  const [view, setView] = useState<View>("from");
  const [viewRevision, setViewRevision] = useState(0);
  const cov = { ballots: coverage("ballots"), localities: coverage("localities") };
  const raw = flowsFor(mode);
  const data = { lists: without(raw.lists, ["other", "abstain"]), blocs: without(raw.blocs, ["other"]) };
  const lead = VIEWS.find((v) => v.id === view)!.lead;
  const [sharing, setSharing] = useState(false);
  const openSharing = useCallback(() => setSharing(true), []);
  useRegisterNavShare(openSharing, false);
  return (
    <div>
      <RotatingPromo messages={SHARE_MESSAGES} callToAction="לחצו וצרו פוסט מעוצב בדיוק על מה שמעניין אתכם!" label="יצירת תמונה או פוסט מותאם אישית — לחצו וצרו פוסט מעוצב בדיוק על מה שמעניין אתכם!" onClick={openSharing} />
      <h1 className="text-2xl font-display leading-tight">מה השתנה: 2022 מול 2026</h1>
      <p className="text-sm text-ink-soft">{partialLine()}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4">
        <div className="flex items-center gap-2">
          <Segmented label="יחידת ההשוואה" value={mode} onChange={setMode} options={MODES} className="w-64" />
          <InfoTip label="מה ההבדל בין קלפיות ליישובים?">
            השיוך לפי קלפיות זהות מדויק יותר, אבל מוצא מקבילה רק ל-{pctValue(cov.ballots.total)}% מהקולות; את השאר הוא משייך לפי השינוי באותו יישוב.
            השיוך לפי יישובים משייך את השארית לפי ההתפלגות בכל היישוב, אבל זה פחות מדויק בערים גדולות ומעורבות. (המעטפות הכפולות נמדדות כיישוב אחד)
            בשני המתגים כל קול נספר: הסכום של כל מפלגה הוא התוצאה הרשמית, וקולות ביישובים שלא היו בהם קלפיות ב-2022 מופיעים כ"יישובים חדשים".
          </InfoTip>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <Segmented label="כיוון ההשוואה" value={view} onChange={(next) => { setView(next); setViewRevision((n) => n + 1); }} options={VIEWS} className="w-64" />
          <InfoTip label="מה מוצג בכיוון הזה?">{lead}</InfoTip>
        </div>
      </div>
      <Explained
        kind="השוואה"
        source="תוצאות האמת לפי קלפי: 2022 (data.gov.il) ו-2026 (ועדת הבחירות המרכזית)"
        asOf={flow.asOf}
        assumption="כל קלפי מושווית לאותה קלפי; קלפי שחלוקתה השתנתה — לפי הקלפי השלמה, אחר כך לפי מיקום הקלפי, ובמתג היישובים — לפי היישוב. הסכום של כל מפלגה הוא הספירה הרשמית; קלפיות שעדיין לא נספרו ב-2026 — לפי השינוי באותו יישוב; יישוב בלי קלפי ב-2022 — ״יישובים חדשים״. אין שימוש בסקרים."
        methodAnchor="voter-flow"
      >
        <div className="md:hidden"><Flows rows={data.lists} stats view={view} resetKey={viewRevision} fromColor={bloc2022} toColor={bloc2026} /></div>
        <div className="hidden md:block"><Paired rows={data.lists} stats same={(id) => SAME_ROW[id]} fromColor={bloc2022} toColor={bloc2026} /></div>
        <h2 className="text-xl font-display leading-tight mt-8">מעבר בין הגושים</h2>
        <div className="md:hidden"><Flows rows={data.blocs} view={view} fromColor={(id) => id} toColor={(id) => id} /></div>
        <div className="hidden md:block"><Paired rows={data.blocs} same={(id) => id} fromColor={(id) => id} toColor={(id) => id} /></div>
      </Explained>
      {sharing && <Suspense fallback={null}><FlowShare mode={mode} onClose={() => setSharing(false)} /></Suspense>}
      <Fold title="בדיקה לפי קלפי">
        <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><BallotLookup /></Suspense>
      </Fold>
    </div>
  );
}

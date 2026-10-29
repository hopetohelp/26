import { lazy, Suspense, useCallback, useId, useRef, useState } from "react";
import { useRegisterNavShare } from "../lib/navShare";
import Explained from "../components/Explained";
import { Fold } from "../components/ui";
import InfoTip from "../components/InfoTip";
import RotatingPromo from "../components/RotatingPromo";
import { bloc2022, bloc2026, coverage, flow, flowsFor, partialLine, partyNumbers, SAME, smallPct, type FlowRow, type Mode } from "../lib/voterFlow";
import { PartyAvatar } from "../components/PartyAvatar";
import { num, pctValue } from "../lib/format";

const BallotLookup = lazy(() => import("../components/BallotLookup"));
const FlowShare = lazy(() => import("../components/FlowShare"));

type View = "from" | "to";
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
const LETTER_2026 = Object.fromEntries(Object.entries(flow.letters26).map(([letters, id]) => [id, letters]));

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

/** נתוני שתי השנים תמיד בראש כרטיס המפלגה; בטלפון בשני טורים גמישים ובמחשב מתחת לשם. */
function Stats({ id26, letters22, compact = false }: { id26: string | null; letters22: string | null; compact?: boolean }) {
  const { y2022, y2026 } = partyNumbers(id26, letters22);
  return <div className={compact ? "grid grid-cols-2 gap-x-3 basis-44 grow-[2] min-w-0" : "space-y-2 mt-1"}>
    {([["2022", y2022], ["2026", y2026]] as const).map(([year, v]) => <div key={year} className="text-xs text-ink-soft tabular-nums min-w-0">
      <p className="font-bold text-ink">{year}</p>
      {v ? <><p><bdi dir="ltr">{num(v.votes)}</bdi> <span className="text-[10px]">מצביעים</span></p><p><bdi dir="ltr">{v.seats}</bdi> מנדטים</p></> : <p>לא רצה</p>}
    </div>)}
  </div>;
}

/** מפלגה אמיתית (לא ״אחרים״, ״לא הצביעו״ או ״יישובים חדשים״). */
const isParty = (id: string) => !["other", "abstain", "new"].includes(id);
const SAME_ROW: Record<string, string> = { ...SAME, other: "other", abstain: "abstain" };
const RETIRED: Record<string, string> = { "כן": "כחול לבן" };
type Rows = { cameFrom: FlowRow[]; wentTo: FlowRow[] };
interface PairedRow { key: string; img: string; name: string; sub?: string; id26: string | null; letters22: string | null; from?: FlowRow; to?: FlowRow }

/** אותו איחוד רשימות לכל המכשירים, כולל רשימות שהתמודדו רק ב־2022. */
function pairedRows(rows: Rows, same: (id: string) => string | undefined, stats: boolean): PairedRow[] {
  const used = new Set<string>();
  const lines: PairedRow[] = rows.cameFrom.map((r) => {
    const old = rows.wentTo.find((w) => w.id === same(r.id));
    if (old) used.add(old.id);
    const show = stats && isParty(r.id);
    return { key: r.id, img: r.id, name: r.name, sub: old && old.name !== r.name ? old.name : undefined,
      id26: show ? r.id : null, letters22: show ? old?.id ?? null : null, from: r, to: old };
  });
  for (const w of rows.wentTo.filter((w) => !used.has(w.id))) {
    const retired = RETIRED[w.id], show = stats && isParty(w.id);
    lines.push({ key: `2022:${w.id}`, img: IMG_2022[w.id] ?? "", name: retired ?? w.name, sub: retired ? w.name : undefined,
      id26: null, letters22: show ? w.id : null, to: w });
  }
  return lines;
}

/** כיוון אישי לכל מפלגה בטלפון: ימינה למקור המצביעים, שמאלה ליעד; גלילה אנכית נשארת טבעית. */
function SwipePartyRow({ line, fromColor, toColor }: { line: PairedRow; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const [selected, setSelected] = useState<View>(line.from ? "from" : "to");
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const panelId = useId(), showStats = !!(line.id26 || line.letters22);
  const label = selected === "from" ? "מאיפה הגיעו" : "לאן הלכו";
  const nextLabel = selected === "from" ? "לאן הלכו" : "מאיפה הגיעו";
  return <li className="flow-swipe-card border-t border-paper-line py-3" data-party={line.key} data-direction={selected} style={{ touchAction: "pan-y pinch-zoom" }}
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
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 mb-2">
      <div className="flex items-center gap-2 min-w-0 basis-24 grow">
        {showStats && <PartyAvatar id={line.img} size={32} fallback={line.letters22 ?? LETTER_2026[line.id26 ?? ""] ?? "…"} />}
        <div className="min-w-0"><h3 className="font-bold leading-tight break-words">{line.name}</h3>{line.sub && <p className="text-xs text-ink-soft">ב־2022: {line.sub}</p>}</div>
      </div>
      {showStats && <Stats id26={line.id26} letters22={line.letters22} compact />}
    </div>
    <div className="flex justify-end mb-2">
      <button type="button" aria-label={`${label} — ${line.name}; מעבר ל${nextLabel}`} aria-controls={`${panelId}-${selected}`}
        onClick={() => setSelected((v) => v === "from" ? "to" : "from")}
        className="min-h-[44px] px-3 inline-flex items-center gap-2 rounded-theme border border-paper-line bg-paper-card text-ink text-xs font-bold">
        <span aria-hidden="true">{selected === "from" ? "→" : "←"}</span><span aria-live="polite">{label}</span>
      </button>
    </div>
    <div className="flow-swipe-panels">
      {(["from", "to"] as const).map((direction) => {
        const data = direction === "from" ? line.from : line.to;
        return <div key={direction} id={`${panelId}-${direction}`} className="flow-swipe-panel" data-view={direction} data-active={selected === direction} aria-hidden={selected !== direction}>
          {data ? <Body row={data} view={direction} colorOf={direction === "from" ? fromColor : toColor} total={!showStats} /> : <p className="text-sm text-ink-soft">המפלגה לא רצה בבחירות אלו</p>}
        </div>;
      })}
    </div>
  </li>;
}

/** מסך רחב: שם ותמונה פעם אחת מימין (טור צר), ואחריהם שני טורים — "מאיפה הגיעו" (2026) ו"לאן הלכו" (2022); מפלגה שלא רצה — "המפלגה לא רצה בבחירות אלו" (הכרעת בעלים 28.10.2026) */
function Paired({ rows, same, fromColor, toColor, stats = false }: { rows: { cameFrom: FlowRow[]; wentTo: FlowRow[] }; same: (id: string) => string | undefined; fromColor: (id: string) => string; toColor: (id: string) => string; stats?: boolean }) {
  const lines = pairedRows(rows, same, stats);
  const empty = (text: string) => <p className="text-sm text-ink-soft self-center">{text}</p>;
  return (
    <div className="mt-2 grid grid-cols-[max-content_1fr_1fr] gap-x-6">
      <span /><span className="font-bold text-ink-soft pb-2">{VIEWS[0].lead}</span><span className="font-bold text-ink-soft pb-2">{VIEWS[1].lead}</span>
      {lines.map((l) => (
        <div key={l.key} className="flow-paired-row contents" data-layout="paired" data-party={l.key}>
          <div className="border-t border-paper-line py-3 flex flex-col items-start gap-1 max-w-[13rem]">
            {(l.id26 || l.letters22) && <PartyAvatar id={l.img} size={44} fallback={l.letters22 ?? LETTER_2026[l.id26 ?? ""] ?? "…"} />}
            <h3 className="font-bold leading-tight line-clamp-2">{l.name}</h3>
            {l.sub && <span className="text-xs text-ink-soft leading-tight">ב-2022: {l.sub}</span>}
            {(l.id26 || l.letters22) && <Stats id26={l.id26} letters22={l.letters22} />}
          </div>
          <div className="border-t border-paper-line py-3 flex">{l.from ? <Body row={l.from} view="from" colorOf={fromColor} total={!stats} /> : empty("המפלגה לא רצה בבחירות אלו")}</div>
          <div className="border-t border-paper-line py-3 flex">{l.to ? <Body row={l.to} view="to" colorOf={toColor} total={!stats} /> : empty("המפלגה לא רצה בבחירות אלו")}</div>
        </div>
      ))}
    </div>
  );
}

function Flows({ rows, fromColor, toColor, stats = false }: { rows: Rows; fromColor: (id: string) => string; toColor: (id: string) => string; stats?: boolean }) {
  const lines = pairedRows(rows, stats ? (id) => SAME_ROW[id] : (id) => id, stats);
  return <ul className="mt-2">{lines.map((line) => <SwipePartyRow key={line.key} line={line} fromColor={fromColor} toColor={toColor} />)}</ul>;
}

/** בלי השורות שאינן אמינות (הכרעת בעלים 28.10.2026): "רשימות אחרות" — בהשוואה לקלפיות המצביעים של 2026 בהן יוצאים 100% "לא הצביעו" (חוסר יציבות בקבוצה זעירה); "לא הצביעו" בחלק המפלגות */
const without = (r: Rows, ids: string[]): Rows => ({ cameFrom: r.cameFrom.filter((x) => !ids.includes(x.id)), wentTo: r.wentTo.filter((x) => !ids.includes(x.id)) });

/** מה השתנה: מעבר מצביעים אמיתי בין 2022 ל-2026, לפי השוואת קלפיות (הכרעות בעלים 28.10.2026) */
export default function VoterFlow() {
  const mode: Mode = "localities"; // קבוע לפי בקשת הבעלים 29/10; יתרת הקלפיות משויכת לפי העיר.
  const cov = coverage(mode);
  const raw = flowsFor(mode);
  const data = { lists: without(raw.lists, ["other", "abstain"]), blocs: without(raw.blocs, ["other"]) };
  const [sharing, setSharing] = useState(false);
  const openSharing = useCallback(() => setSharing(true), []);
  useRegisterNavShare(openSharing, false);
  return (
    <div>
      <RotatingPromo messages={SHARE_MESSAGES} callToAction="לחצו וצרו פוסט מעוצב בדיוק על מה שמעניין אתכם!" label="יצירת תמונה או פוסט מותאם אישית — לחצו וצרו פוסט מעוצב בדיוק על מה שמעניין אתכם!" onClick={openSharing} />
      <h1 className="text-2xl font-display leading-tight">מה השתנה: 2022 מול 2026</h1>
      <p className="text-sm text-ink-soft">{partialLine()}</p>
      <div className="flex justify-end mt-2">
        <InfoTip label="איך מחושב מעבר המצביעים?">
          משווים תחילה את אותו מספר תת קלפי באותו יישוב, אחר כך את הקלפי השלמה ואת מרכז הקלפיות.
          יתרת הקלפיות משויכת לפי השינוי באותה עיר. כך נמצאה מקבילה ל־{pctValue(cov.total)}% מהקולות, וכל קול נשאר בחישוב.
          מעטפות כפולות נמדדות כיישוב אחד; יישוב ללא קלפי ב־2022 מופיע כ״יישובים חדשים״.
        </InfoTip>
      </div>
      <Explained
        kind="השוואה"
        source="תוצאות האמת לפי קלפי: 2022 (data.gov.il) ו-2026 (ועדת הבחירות המרכזית)"
        asOf={flow.asOf}
        assumption="כל קלפי מושווית לאותה קלפי; קלפי שחלוקתה השתנתה — לפי הקלפי השלמה, אחר כך לפי מיקום הקלפי, ולבסוף לפי היישוב. הסכום של כל מפלגה הוא הספירה הרשמית; קלפיות שעדיין לא נספרו ב-2026 — לפי השינוי באותו יישוב; יישוב בלי קלפי ב-2022 — ״יישובים חדשים״. אין שימוש בסקרים."
        methodAnchor="voter-flow"
      >
        <div className="md:hidden"><Flows rows={data.lists} stats fromColor={bloc2022} toColor={bloc2026} /></div>
        <div className="hidden md:block"><Paired rows={data.lists} stats same={(id) => SAME_ROW[id]} fromColor={bloc2022} toColor={bloc2026} /></div>
        <h2 className="text-xl font-display leading-tight mt-8">מעבר בין הגושים</h2>
        <div className="md:hidden"><Flows rows={data.blocs} fromColor={(id) => id} toColor={(id) => id} /></div>
        <div className="hidden md:block"><Paired rows={data.blocs} same={(id) => id} fromColor={(id) => id} toColor={(id) => id} /></div>
      </Explained>
      {sharing && <Suspense fallback={null}><FlowShare mode={mode} onClose={() => setSharing(false)} /></Suspense>}
      <Fold title="בדיקה לפי קלפי">
        <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><BallotLookup /></Suspense>
      </Fold>
    </div>
  );
}

import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { useRegisterNavShare } from "../lib/navShare";
import Explained from "../components/Explained";
import { Fold } from "../components/ui";
import InfoTip from "../components/InfoTip";
import RotatingPromo from "../components/RotatingPromo";
import { bloc2022, bloc2026, coverage, flow, flowsFor, partialLine, blocYears, partyYears, SAME, smallPct, type FlowRow, type Mode, type YearNumbers } from "../lib/voterFlow";
import ParamCard, { PARAM_NAMES, type ParamRow } from "../components/ParamCard";
import { PartyAvatar } from "../components/PartyAvatar";
import { num, pctOne, pctValue } from "../lib/format";

const BallotLookup = lazy(() => import("../components/BallotLookup"));
const FlowShare = lazy(() => import("../components/FlowShare"));

type View = "from" | "to";
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
          <li key={p.id} className="grid grid-cols-[minmax(3.5rem,9rem)_minmax(0,1fr)_2.75rem] items-center gap-2 text-sm">
            <span className="truncate">{p.name}</span>
            <span className="h-3 flex justify-start rounded-sm bg-paper-line overflow-hidden" aria-hidden="true">
              <span className="block h-full" style={{ width: `${p.share}%`, background: blocFill(colorOf(p.id)) }} />
            </span>
            <span className="tabular-nums text-end">{ALWAYS.has(p.id) && p.share < MIN_SHARE ? smallPct(p.share) : pctValue(p.share)}%</span>
          </li>
        ))}
        {rest >= 0.5 && (
          <li className="grid grid-cols-[minmax(3.5rem,9rem)_minmax(0,1fr)_2.75rem] items-center gap-2 text-sm text-ink-soft">
            <span>אחרים</span><span /><span className="tabular-nums text-end">{pctValue(rest)}%</span>
          </li>
        )}
      </ul>
    </div>
  );
}

/** ארבעת הפרמטרים ככרטיס (מפלגה או גוש); ברצף: מצביעים, מזכות בחירה, מהכשרים, מנדטים. רצה רק באחת מהמערכות — טור אחד */
function Stats({ years, what, head }: { years: { y2022: YearNumbers | null; y2026: YearNumbers | null }; what: string; head: ReactNode }) {
  const { y2022, y2026 } = years;
  if (!y2022 && !y2026) return null;
  const row = (key: keyof typeof PARAM_NAMES, get: (y: YearNumbers) => number | null, fmt: (n: number) => string, kind: "count" | "pct"): ParamRow =>
    ({ key, label: PARAM_NAMES[key], v22: y2022 ? get(y2022) : null, v26: y2026 ? get(y2026) : null, fmt, kind });
  // רצה רק באחת מהמערכות: לא טבלה — טור אחד של הערך והשם (הכרעת בעלים 29.10.2026)
  if (!y2022 || !y2026) {
    const y = (y2022 ?? y2026)!;
    const items: [string, string][] = [[num(y.votes), PARAM_NAMES.votes], ...(y.ofEligible === null ? [] : [[pctOne(y.ofEligible), PARAM_NAMES.ofEligible] as [string, string]]), [pctOne(y.ofValid), PARAM_NAMES.ofValid], [String(y.seats), PARAM_NAMES.seats]];
    return <div className="rounded-theme border border-paper-line bg-paper-card shadow-sm p-3 h-full flex flex-col justify-center gap-1 text-xs md:text-sm" aria-label={`${what}: ${y2022 ? "2022" : "2026"}`}>
      {/* תמונה, שם ושנה (הכרעת בעלים 29.10.2026) */}
      <div className="flex flex-col items-center text-center gap-0.5 mb-1">{head}<span className="text-xs font-bold text-accent">{y2022 ? "2022" : "2026"}</span></div>
      {items.map(([v, l]) => <span key={l} className="whitespace-nowrap text-center"><bdi dir="ltr" className="font-bold tabular-nums">{v}</bdi> <span className="text-ink-soft">{l}</span></span>)}
    </div>;
  }
  const rows = [row("votes", (y) => y.votes, num, "count"), row("ofEligible", (y) => y.ofEligible, pctOne, "pct"), row("ofValid", (y) => y.ofValid, pctOne, "pct"), row("seats", (y) => y.seats, String, "count")];
  return <ParamCard rows={rows} compact corner={head} caption={`ארבעת הפרמטרים של ${what}: 2022, 2026 והפער`} className="min-w-0 w-full md:h-full" />;
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

type Kind = "party" | "bloc";
const TITLES: Record<Kind, Record<View, string>> = {
  party: { from: "מאיפה הגיעו מצביעי המפלגה בבחירות הנוכחיות", to: "לאן הלכו מצביעי המפלגה בבחירות הקודמות" },
  bloc: { from: "מאיפה הגיעו מצביעי הגוש בבחירות הנוכחיות", to: "לאן הלכו מצביעי הגוש בבחירות הקודמות" },
};
const BLOCS = new Set(["netanyahu", "haredi", "arab", "eisenkot"]);

/** תמונה ושם בפינה הימנית העליונה של טבלת הנתונים (הכרעת בעלים 29.10.2026); שם של כמה מילים — מילה בשורה */
function Head({ line, center = false }: { line: PairedRow; center?: boolean }) {
  const avatar = !!(line.id26 || line.letters22);
  return <div className={`flex flex-col gap-0.5 ${center ? "items-center" : "items-start"}`}>
    {avatar && <PartyAvatar id={line.img} size={28} fallback={line.letters22 ?? LETTER_2026[line.id26 ?? ""] ?? "…"} />}
    <h3 className="font-bold leading-tight text-[11px] md:text-xs">{line.name.split(" ").map((w, i) => <span key={i} className="block">{w}</span>)}</h3>
    {line.sub && <span className="text-[10px] font-normal text-ink-soft leading-tight">ב־2022: {line.sub}</span>}
  </div>;
}

/** כרטיס תנועה: כותרת בשורה אחת (הגופן מתכווץ עם רוחב הכרטיס) והפסים */
function FlowCard({ title, data, view, colorOf, className = "", narrow = false }: { title: string; data?: FlowRow; view: View; colorOf: (id: string) => string; className?: string; narrow?: boolean }) {
  return <section className={`min-w-0 md:h-full ${className}`} data-card="flow"><div className="h-full rounded-theme border border-paper-line bg-paper-card shadow-sm p-3" style={{ containerType: "inline-size" }} aria-label={title}>
    {/* כותרת בשורה אחת; בכרטיס צר (לצד כרטיס הנתונים בטלפון) — בשתי שורות מאוזנות */}
    <h4 className={`font-bold text-accent text-center mb-2 ${narrow ? "text-xs leading-snug [text-wrap:balance]" : "whitespace-nowrap"}`} style={narrow ? undefined : { fontSize: "clamp(9px, 4.6cqi, 13px)" }}>{title}</h4>
    {data ? <Body row={data} view={view} colorOf={colorOf} total={false} /> : <p className="text-sm text-ink-soft text-center">לא רצה בבחירות אלו</p>}
  </div></section>;
}

/**
 * שורה לכל מפלגה או גוש (הצעה א׳, הכרעת בעלים 29.10.2026): שם ותמונה מימין, טבלת הפרמטרים, ושני כרטיסי התנועה.
 * בטלפון: השם והטבלה בשורה אחת, ומתחתם שני הכרטיסים; במחשב: ארבעה טורים, וטורי התנועה צרים יותר.
 */
function Line({ line, kind, fromColor, toColor }: { line: PairedRow; kind: Kind; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const one = !line.from || !line.to;
  const years = kind === "party" ? (line.id26 || line.letters22 ? partyYears(line.id26, line.letters22) : null) : BLOCS.has(line.key) ? blocYears(line.key) : null;
  const stats = years
    ? <Stats years={years} what={line.name} head={<Head line={line} center={one} />} />
    : <div className="rounded-theme border border-paper-line bg-paper-card shadow-sm p-3 h-full flex items-center justify-center"><Head line={line} center /></div>;
  return <li className="border-t border-paper-line py-4 grid gap-3 md:grid-cols-[minmax(19rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-stretch" data-party={line.key}>
    {/* רצה רק באחת מהמערכות: בטלפון כרטיס הנתונים וכרטיס התנועה היחיד באותה שורה, ובלי כרטיס לבחירות שלא רץ בהן */}
    <div className={`min-w-0 md:h-full ${one ? "grid grid-cols-[auto_minmax(0,1fr)] gap-3 items-stretch md:block" : ""}`}>
      {stats}
      {one && <FlowCard narrow className="md:hidden" title={TITLES[kind][line.from ? "from" : "to"]} data={line.from ?? line.to} view={line.from ? "from" : "to"} colorOf={line.from ? fromColor : toColor} />}
    </div>
    <FlowCard className={one ? "hidden md:block" : ""} title={TITLES[kind].from} data={line.from} view="from" colorOf={fromColor} />
    <FlowCard className={one ? "hidden md:block" : ""} title={TITLES[kind].to} data={line.to} view="to" colorOf={toColor} />
  </li>;
}

function Lines({ rows, kind, same, fromColor, toColor }: { rows: Rows; kind: Kind; same: (id: string) => string | undefined; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  return <ul className="mt-2">{pairedRows(rows, same, kind === "party").map((line) => <Line key={line.key} line={line} kind={kind} fromColor={fromColor} toColor={toColor} />)}</ul>;
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
      <div className="flex items-center justify-between gap-2"><h1 className="text-2xl font-display leading-tight">מה השתנה: 2022 מול 2026</h1>

      <div className="flex justify-end">
        <InfoTip label="איך מחושב מעבר המצביעים?">
          משווים תחילה את אותו מספר תת קלפי באותו יישוב, אחר כך את הקלפי השלמה ואת מרכז הקלפיות.
          יתרת הקלפיות משויכת לפי השינוי באותה עיר. כך נמצאה מקבילה ל־{pctValue(cov.total)}% מהקולות, וכל קול נשאר בחישוב.
          מעטפות כפולות נמדדות כיישוב אחד; יישוב ללא קלפי ב־2022 מופיע כ״יישובים חדשים״.
          בכרטיס המפלגה: ״מהכשרים״ — אחוז הקולות הכשרים, כמו בוועדת הבחירות; ״מזכות בחירה״ — אחוז מכלל בעלי זכות הבחירה (ב־2026: בקלפיות שנספרו).
        </InfoTip>
      </div>
      </div><p className="text-sm text-ink-soft">{partialLine()}</p>
      <Explained
        kind="השוואה"
        source="תוצאות האמת לפי קלפי: 2022 (data.gov.il) ו-2026 (ועדת הבחירות המרכזית)"
        asOf={flow.asOf}
        assumption="כל קלפי מושווית לאותה קלפי; קלפי שחלוקתה השתנתה — לפי הקלפי השלמה, אחר כך לפי מיקום הקלפי, ולבסוף לפי היישוב. הסכום של כל מפלגה הוא הספירה הרשמית; קלפיות שעדיין לא נספרו ב-2026 — לפי השינוי באותו יישוב; יישוב בלי קלפי ב-2022 — ״יישובים חדשים״. אין שימוש בסקרים."
        methodAnchor="voter-flow"
        inFooter
      >
        {/* שלושה חלקים נפתחים (הכרעת בעלים 29.10.2026) */}
        <Fold title="מעבר בין מפלגות"><Lines rows={data.lists} kind="party" same={(id) => SAME_ROW[id]} fromColor={bloc2022} toColor={bloc2026} /></Fold>
        <Fold title="מעבר בין גושים"><Lines rows={data.blocs} kind="bloc" same={(id) => id} fromColor={(id) => id} toColor={(id) => id} /></Fold>
        {/* ״איך זה חושב?״ בתחתית העמוד (הכרעת בעלים 29.10.2026) */}
        <Fold title="חיפוש לפי עיר או קלפי">
          <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><BallotLookup /></Suspense>
        </Fold>
      </Explained>
      {sharing && <Suspense fallback={null}><FlowShare mode={mode} onClose={() => setSharing(false)} /></Suspense>}
    </div>
  );
}

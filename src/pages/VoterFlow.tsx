import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRegisterNavShare } from "../lib/navShare";
import Explained from "../components/Explained";
import { Fold } from "../components/ui";
import RotatingPromo from "../components/RotatingPromo";
import { FLOW_SHARE_CTA, FLOW_SHARE_MESSAGES, blocGraph, flowCtx2026, flowCtxFrom, flowsFor, overview, overviewOf, partyYears, groupYears, smallPct, type FlowCtx, type FlowFile, type Group, type FlowRow, type YearNumbers } from "../lib/voterFlow";
import ParamCard, { Delta, PARAM_NAMES, type ParamRow } from "../components/ParamCard";
import OverviewCards from "../components/OverviewCards";
import { changeOf } from "../lib/changeMark";
import { PartyAvatar } from "../components/PartyAvatar";
import { num, pctOne, pctValue } from "../lib/format";
import Missing from "../components/Missing";
import LocalityResults from "../components/LocalityResults";
import { results } from "../lib/data";
import { K26_ID, electionOption, previousElection, previousSummary } from "../lib/election";
import { hasVoterFlow } from "../lib/electionData";
import { loadHistoryFlow } from "../lib/flowFiles";

const BallotLookup = lazy(() => import("../components/BallotLookup"));
const FlowShare = lazy(() => import("../components/FlowShare"));
import GraphSwitch from "../components/GraphSwitch";
import FlowExplain from "../components/FlowExplain";

type View = "from" | "to";
/** חלק קטן מ-3% מצטרף לשורה "אחרים" — כדי שכל כרטיס יישאר קריא */
const MIN_SHARE = 3;
/** המערכת שמוצגת: הקובץ, השמות, הגושים והנתונים לכל שנה (src/lib/voterFlow.ts, FlowCtx). רשימות שמוצגות תמיד בשורה נפרדת,
 * גם מתחת ל-3% — ctx.always (2026; הכרעת בעלים 28.10.2026) */
const Ctx = createContext<FlowCtx | null>(null);
const useFlowCtx = () => useContext(Ctx) ?? flowCtx2026();

/** צבע הגוש מטוקני האתר (--bloc-1..4 לפי סדר SIMPLE_BLOCS); בגזרה הטוקנים מתחלפים לצבעי הגזרה (הכרעת בעלים 28.10.2026) */
const BLOC_TOKEN: Record<string, string> = { netanyahu: "--bloc-1", haredi: "--bloc-2", arab: "--bloc-3", eisenkot: "--bloc-4", none: "--accent" };
const blocFill = (bloc: string) => `rgb(var(${BLOC_TOKEN[bloc] ?? "--bloc-miss"}))`;
/** תמונת יו"ר לרשימת 2022 — רק כשזו אותה מפלגה ואותו יו"ר כמו ב-2026 */
const IMG_2022: Record<string, string> = { "מחל": "likud", "שס": "shas", "ג": "utj", "ל": "yb", "ט": "rzp", "עם": "raam", "כן": "bluewhite" };

/** גוף הכרטיס: מספר המצביעים והפסים — בלי השם (השם והתמונה פעם אחת לכל שורה) */
function Body({ row, view, colorOf, total = true }: { row: FlowRow; view: View; colorOf: (id: string) => string; total?: boolean }) {
  const { always: ALWAYS, prevLabel, curLabel } = useFlowCtx();
  const shown = (p: FlowRow["parts"][number]) => p.share >= MIN_SHARE || (ALWAYS.has(p.id) && smallPct(p.share) !== null);
  const main = row.parts.filter(shown);
  const rest = row.parts.filter((p) => !shown(p)).reduce((a, p) => a + p.share, 0);
  return (
    <div className="min-w-0 w-full">
      {total && <p className="text-xs text-ink-soft mb-2">{view === "from" ? `קולות ב-${curLabel}` : `קולות ב-${prevLabel}`}: {num(row.total)}</p>}
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
  const { prevLabel, curLabel } = useFlowCtx();
  if (!y2022 && !y2026) return null;
  const row = (key: keyof typeof PARAM_NAMES, get: (y: YearNumbers) => number | null, fmt: (n: number) => string, kind: "count" | "pct"): ParamRow =>
    ({ key, label: PARAM_NAMES[key], v22: y2022 ? get(y2022) : null, v26: y2026 ? get(y2026) : null, fmt, kind });
  // רצה רק באחת מהמערכות: לא טבלה — טור אחד של הערך והשם (הכרעת בעלים 29.10.2026)
  if (!y2022 || !y2026) {
    const y = (y2022 ?? y2026)!;
    const items: [string, string][] = [[num(y.votes), PARAM_NAMES.votes], ...(y.ofEligible === null ? [] : [[pctOne(y.ofEligible), PARAM_NAMES.ofEligible] as [string, string]]), [pctOne(y.ofValid), PARAM_NAMES.ofValid], [String(y.seats), PARAM_NAMES.seats]];
    return <div className="rounded-theme border border-paper-line bg-paper-card shadow-sm p-3 h-full flex flex-col justify-center gap-1 text-xs md:text-sm" aria-label={`${what}: ${y2022 ? prevLabel : curLabel}`}>
      {/* תמונה, שם ושנה (הכרעת בעלים 29.10.2026) */}
      <div className="flex flex-col items-center text-center gap-0.5 mb-1">{head}<span className="text-xs font-bold text-accent">{y2022 ? prevLabel : curLabel}</span></div>
      {items.map(([v, l]) => <span key={l} className="whitespace-nowrap text-center"><bdi dir="ltr" className="font-bold tabular-nums">{v}</bdi> <span className="text-ink-soft">{l}</span></span>)}
    </div>;
  }
  const rows = [row("votes", (y) => y.votes, num, "count"), row("ofEligible", (y) => y.ofEligible, pctOne, "pct"), row("ofValid", (y) => y.ofValid, pctOne, "pct"), row("seats", (y) => y.seats, String, "count")];
  return <ParamCard rows={rows} compact corner={head} caption={`ארבעת הפרמטרים של ${what}: ${prevLabel}, ${curLabel} והפער`} years={[prevLabel, curLabel]} className="min-w-0 w-full md:h-full" />;
}

/** חץ צף למעלה (הכרעת בעלים 29.10.2026): עולה לראש המגירה הפתוחה שבה הקורא נמצא; מופיע רק אחרי גלילה לתוכה */
function DrawerTop() {
  const [drawer, setDrawer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const open = [...document.querySelectorAll<HTMLElement>("main details.c-fold[open]")];
      setDrawer(open.find((d) => { const r = d.getBoundingClientRect(); return r.top < -240 && r.bottom > 160; }) ?? null);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  if (!drawer) return null;
  const go = () => drawer.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  return <button type="button" onClick={go} aria-label={`חזרה לראש ״${drawer.querySelector("summary h2")?.textContent ?? ""}״`}
    className="fixed left-3 z-30 w-11 h-11 rounded-full bg-accent text-paper-card shadow-lg grid place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-6">
    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
  </button>;
}

/** מפלגה אמיתית (לא ״אחרים״, ״לא הצביעו״ או ״יישובים חדשים״). */
const isParty = (id: string) => !["other", "abstain", "new"].includes(id);
const RETIRED: Record<string, string> = {};
type Rows = { cameFrom: FlowRow[]; wentTo: FlowRow[] };
interface PairedRow { key: string; img: string; name: string; sub?: string; id26: string | null; letters22: string | null; from?: FlowRow; to?: FlowRow }

/** אותו איחוד רשימות לכל המכשירים, כולל רשימות שהתמודדו רק ב־2022. */
function pairedRows(rows: Rows, same: (id: string) => string | undefined, stats: boolean, c: FlowCtx): PairedRow[] {
  const used = new Set<string>();
  const lines: PairedRow[] = rows.cameFrom.map((r) => {
    const old = rows.wentTo.find((w) => w.id === same(r.id));
    if (old) used.add(old.id);
    const show = stats && isParty(r.id);
    return { key: r.id, img: c.img(r.id), name: r.name, sub: old && old.name !== r.name ? old.name : undefined,
      id26: show ? r.id : null, letters22: show ? old?.id ?? null : null, from: r, to: old };
  });
  for (const w of rows.wentTo.filter((w) => !used.has(w.id))) {
    const retired = RETIRED[w.id], show = stats && isParty(w.id);
    lines.push({ key: `2022:${w.id}`, img: c.id === K26_ID ? IMG_2022[w.id] ?? "" : "", name: retired ?? w.name, sub: retired ? w.name : undefined,
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
/** "לאן הלכו" עם שם המפלגה (הכרעת בעלים 29.10.2026): "לאן הלכו מצביעי הליכוד בבחירות הקודמות"; בגושים — הכותרת הכללית */
const fromTitle = (kind: Kind, row?: FlowRow) => (kind === "party" && row ? `מאיפה הגיעו מצביעי ${row.name}` : TITLES[kind].from);
const toTitle = (kind: Kind, row?: FlowRow) => (kind === "party" && row ? `לאן הלכו מצביעי ${row.name} בבחירות הקודמות` : TITLES[kind].to);

/** תמונה ושם בפינה הימנית העליונה של טבלת הנתונים (הכרעת בעלים 29.10.2026); שם של כמה מילים — מילה בשורה */
function Head({ line, center = false }: { line: PairedRow; center?: boolean }) {
  const c = useFlowCtx();
  const avatar = !!(line.id26 || line.letters22);
  return <div className={`flex flex-col gap-0.5 ${center ? "items-center" : "items-start"}`}>
    {avatar && <PartyAvatar id={line.img} size={28} fallback={line.letters22 ?? (line.id26 ? c.letterOf(line.id26) : "…")} />}
    <h3 className="font-bold leading-tight text-[11px] md:text-xs">{line.name.split(" ").map((w, i) => <span key={i} className="block">{w}</span>)}</h3>
    {line.sub && <span className="text-[10px] font-normal text-ink-soft leading-tight">ב־{c.prevLabel}: {line.sub}</span>}
  </div>;
}

/** כרטיס תנועה: כותרת בשורה אחת (הגופן מתכווץ עם רוחב הכרטיס) והפסים */
function FlowCard({ title, data, view, colorOf, className = "", narrow = false }: { title: string; data?: FlowRow; view: View; colorOf: (id: string) => string; className?: string; narrow?: boolean }) {
  return <section className={`min-w-0 sm:h-full ${className}`} data-card="flow"><div className="h-full rounded-theme border border-paper-line bg-paper-card shadow-sm p-3" style={{ containerType: "inline-size" }} aria-label={title}>
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
  const c = useFlowCtx();
  const years = kind === "party" ? (line.id26 || line.letters22 ? c.partyYears(line.id26, line.letters22) : null) : BLOCS.has(line.key) ? c.blocYears(line.key) : null;
  const stats = years
    ? <Stats years={years} what={line.name} head={<Head line={line} center={one} />} />
    : <div className="rounded-theme border border-paper-line bg-paper-card shadow-sm p-3 h-full flex items-center justify-center"><Head line={line} center /></div>;
  return <li className="border-t border-paper-line py-4 grid gap-3 sm:grid-cols-2 sm:items-stretch md:grid-cols-[minmax(19rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]" data-party={line.key}>
    {/* רצה רק באחת מהמערכות: בטלפון כרטיס הנתונים וכרטיס התנועה היחיד באותה שורה, ובלי כרטיס לבחירות שלא רץ בהן */}
    {/* טאבלט (הכרעת בעלים 29.10.2026): הטבלה ברוחב מלא, ומתחתיה ״מאיפה״ ו״לאן״ באותה שורה ובאותו גובה */}
    <div className={`min-w-0 sm:col-span-2 md:col-span-1 md:h-full ${one ? "grid grid-cols-[auto_minmax(0,1fr)] gap-3 items-stretch md:block" : ""}`}>
      {stats}
      {one && <FlowCard narrow className="md:hidden" title={line.from ? fromTitle(kind, line.from) : toTitle(kind, line.to)} data={line.from ?? line.to} view={line.from ? "from" : "to"} colorOf={line.from ? fromColor : toColor} />}
    </div>
    <FlowCard className={one ? "hidden md:block" : ""} title={fromTitle(kind, line.from)} data={line.from} view="from" colorOf={fromColor} />
    <FlowCard className={one ? "hidden md:block" : ""} title={toTitle(kind, line.to)} data={line.to} view="to" colorOf={toColor} />
  </li>;
}

/**
 * פיצול או איחוד ודאי (raw/lineage.json, "strict"; הכרעות בעלים 29.10.2026).
 * איחוד: כרטיס נתונים מסוכם (סכום הרשימות בכל שנה, ומתחתיו כל רשימה של 2022); "מאיפה הגיעו" אחד בגובה כפול;
 *   "לאן הלכו" לכל רשימה של 2022 — בטלפון זה לצד זה.
 * פיצול: פס השינוי של שתיהן יחד (במחשב טור צר מימין); לכל רשימה של היום כרטיס נתונים משלה ו"מאיפה הגיעו" משלה, הגדולה ראשונה; "לאן הלכו" אחד לרשימה של 2022,
 *   בגובה כפול במחשב. בטלפון: נתונים ומאיפה של הראשונה, נתונים ומאיפה של השנייה, ורק אז לאן הלכו.
 */
function GroupLine({ group, rows, fromColor, toColor }: { group: Group; rows: Rows; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const from = group.ids26.map((id) => rows.cameFrom.find((r) => r.id === id)).filter((r): r is FlowRow => !!r);
  const to = group.letters22.map((l) => rows.wentTo.find((r) => r.id === l)).filter((r): r is FlowRow => !!r);
  const names22 = to.map((r) => r.name).join(" + ");
  if (from.length > 1) {
    const ordered = [...from].sort((a, b) => b.total - a.total);
    const cells = ordered.flatMap((r, i) => {
      const line: PairedRow = { key: r.id, img: r.id, name: r.name, sub: undefined, id26: r.id, letters22: null, from: r };
      const head = <div className="flex flex-col items-center text-center gap-0.5"><Head line={line} center /><span className="text-[10px] font-normal text-ink-soft leading-tight">פוצלה מ{names22} (2022)</span></div>;
      const row = i === 0 ? "md:row-start-1" : "md:row-start-2";
      return [
        <div key={`s-${r.id}`} className={`min-w-0 md:col-start-2 ${row}`}><Stats years={{ y2022: null, y2026: partyYears(r.id, null).y2026 }} what={r.name} head={head} /></div>,
        <FlowCard key={`f-${r.id}`} className={`md:col-start-3 ${row}`} title={fromTitle("party", r)} data={r} view="from" colorOf={fromColor} />,
      ];
    });
    // פס השינוי של שתי הרשימות יחד מול 2022 (הכרעת בעלים 29.10.2026): רק השינוי; במחשב — טור צר מימין בגובה שתיהן
    const g = groupYears(group.ids26, group.letters22);
    const changes = g.y2022 && g.y2026 ? ([["votes", "מצביעים", "count"], ["ofEligible", "מזכות הבחירה", "pct"], ["ofValid", "מהכשרים", "pct"], ["seats", "מנדטים", "count"]] as const)
      .filter(([k]) => g.y2022![k] !== null && g.y2026![k] !== null)
      .map(([k, label, kind]) => ({ k, label, change: changeOf((g.y2026![k] as number) - (g.y2022![k] as number), kind) })) : [];
    const strip = <div className="sm:col-span-2 md:col-span-1 md:col-start-1 md:row-start-1 md:row-span-2 rounded-theme border border-paper-line border-t-4 border-t-accent bg-paper-card shadow-sm p-2 flex flex-col justify-center gap-2 text-center">
      <p className="text-[11px] font-bold leading-tight">שתיהן יחד מול {names22} 2022</p>
      {/* במחשב: טור אחד מרווח, שם הפרמטר ומתחתיו השינוי (הכרעת בעלים 29.10.2026) */}
      {/* בטלפון ובטאבלט: שתי עמודות, השינוי ולידו השם (הכרעת בעלים 29.10.2026) */}
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs font-bold tabular-nums md:hidden">{changes.map((c) => <li key={c.k} className="leading-tight">
        {c.change ? <><Delta change={c.change} /> <span className="text-ink-soft font-normal">{c.label}</span></> : <span className="text-ink-soft font-normal">{c.label} ללא שינוי</span>}
      </li>)}</ul>
      <ul className="hidden md:flex flex-col gap-3 text-xs tabular-nums">{changes.map((c) => <li key={c.k} className="flex flex-col items-center gap-0.5 leading-tight">
        <span className="text-ink-soft">{c.label}</span>
        <span className="font-bold">{c.change ? <Delta change={c.change} /> : "ללא שינוי"}</span>
      </li>)}</ul>
    </div>;
    return <li className="border-t border-paper-line py-4 grid gap-3 sm:grid-cols-2 sm:items-stretch md:grid-cols-[minmax(5.5rem,0.4fr)_minmax(15rem,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]" data-party={group.id} data-group="split">
      {strip}
      {cells}
      {to.map((r) => <FlowCard key={`t-${r.id}`} className="sm:col-span-2 md:col-span-1 md:col-start-4 md:row-start-1 md:row-span-2" title={toTitle("party", r)} data={r} view="to" colorOf={toColor} />)}
    </li>;
  }
  const r26 = from[0];
  const head = <div className="flex flex-col items-start gap-0.5">
    {r26 && <PartyAvatar id={r26.id} size={24} fallback={flowCtx2026().letterOf(r26.id)} />}
    <h3 className="font-bold leading-tight text-[11px] md:text-xs">{r26?.name}</h3>
    <span className="text-[10px] font-normal text-ink-soft leading-tight">איחוד של {names22} (2022)</span>
  </div>;
  const parts = to.map((r) => { const y = partyYears(null, r.id).y2022; return y ? `${r.name} (2022): ${pctOne(y.ofValid)}, ${y.seats} מנדטים` : null; });
  return <li className="border-t border-paper-line py-4 grid gap-3 sm:grid-cols-2 sm:items-stretch md:grid-cols-[minmax(19rem,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]" data-party={group.id} data-group="merge">
    <div className="min-w-0 sm:col-span-2 md:col-span-1 flex flex-col gap-1">
      <Stats years={groupYears(group.ids26, group.letters22)} what={r26?.name ?? ""} head={head} />
      <p className="text-[11px] text-ink-soft leading-snug">{parts.filter(Boolean).join(" · ")}</p>
    </div>
    {r26 && <FlowCard className="sm:h-full" title={fromTitle("party", r26)} data={r26} view="from" colorOf={fromColor} />}
    {/* בטלפון "לאן הלכו" של שתי הרשימות זה לצד זה (הכרעת בעלים 29.10.2026) */}
    <div className="min-w-0 grid grid-cols-2 sm:grid-cols-1 gap-3 auto-rows-fr" data-side="to">
      {to.map((r) => <FlowCard key={r.id} narrow className="sm:h-full" title={toTitle("party", r)} data={r} view="to" colorOf={toColor} />)}
    </div>
  </li>;
}

function Lines({ rows, kind, same, fromColor, toColor }: { rows: Rows; kind: Kind; same: (id: string) => string | undefined; fromColor: (id: string) => string; toColor: (id: string) => string }) {
  const c = useFlowCtx(), GROUPS = c.groups;
  if (kind !== "party") return <ul className="mt-2">{pairedRows(rows, same, false, c).map((line) => <Line key={line.key} line={line} kind={kind} fromColor={fromColor} toColor={toColor} />)}</ul>;
  // משפחות של פיצול או איחוד — שורה אחת במקום הרשימה הראשונה שלהן; השאר כמו קודם
  const group26 = new Map(GROUPS.flatMap((g) => g.ids26.map((id) => [id, g] as const)));
  const letters = new Set(GROUPS.flatMap((g) => g.letters22));
  const singles = new Map(pairedRows({ cameFrom: rows.cameFrom.filter((r) => !group26.has(r.id)), wentTo: rows.wentTo.filter((w) => !letters.has(w.id)) }, same, true, c).map((l) => [l.key, l]));
  const out: ReactNode[] = [];
  const seen = new Set<string>();
  for (const r of rows.cameFrom) {
    const g = group26.get(r.id);
    if (g) { if (!seen.has(g.id)) { seen.add(g.id); out.push(<GroupLine key={g.id} group={g} rows={rows} fromColor={fromColor} toColor={toColor} />); } continue; }
    const line = singles.get(r.id);
    if (line) { out.push(<Line key={line.key} line={line} kind={kind} fromColor={fromColor} toColor={toColor} />); singles.delete(r.id); }
  }
  for (const line of singles.values()) out.push(<Line key={line.key} line={line} kind={kind} fromColor={fromColor} toColor={toColor} />);
  return <ul className="mt-2">{out}</ul>;
}

/** בלי השורות שאינן אמינות (הכרעת בעלים 28.10.2026): "רשימות אחרות" — בהשוואה לקלפיות המצביעים של 2026 בהן יוצאים 100% "לא הצביעו" (חוסר יציבות בקבוצה זעירה); "לא הצביעו" בחלק המפלגות */
const without = (r: Rows, ids: string[]): Rows => ({ cameFrom: r.cameFrom.filter((x) => !ids.includes(x.id)), wentTo: r.wentTo.filter((x) => !ids.includes(x.id)) });

/** ארבעת הנתונים הכלליים של מערכת מול הקודמת לה; 2026 — לפי הספירה (overview) */
function overviewPair(id: string) {
  if (id === K26_ID) { const o = overview(); return o.y2026 ? { prev: o.y2022, cur: o.y2026 } : undefined; }
  const e = results.find((x) => x.id === id);
  const prevId = previousElection(id)?.id, prev = prevId ? results.find((x) => x.id === prevId) : undefined;
  const before = previousSummary(id);
  const prevOverview = prev ? overviewOf(prev)
    : before ? { eligible: before.eligible, voted: before.voted, invalid: before.invalid, belowThreshold: before.belowThreshold, inKnesset: before.valid - before.belowThreshold } : null;
  return e ? { prev: prevOverview, cur: overviewOf(e) } : undefined;
}

/**
 * מה השתנה — אותו מסך לכל מערכת (הכרעת בעלים 04.11.2026): הערך והשינוי מהמערכת הקודמת, מעבר בין מפלגות ובין גושים,
 * חיפוש לפי עיר או קלפי, ותוצאות לפי יישוב. מעבר המצביעים לפי השוואת קלפיות (הכרעות בעלים 28.10.2026); מערכת שאין לה עדיין נתוני מעבר —
 * "נתון חסר · נשלים בהמשך" באותו מקום.
 * afterHeader — מה שמוצג מתחת לכרטיס הכותרת (הכרעת בעלים 02.11.2026)
 */
export default function VoterFlow({ id = K26_ID, afterHeader }: { id?: string; afterHeader?: ReactNode } = {}) {
  const withFlow = hasVoterFlow(id);
  // מערכת קודמת: הקובץ נטען לפי דרישה (src/lib/flowFiles.ts); 2026 — מיד
  const [loaded, setLoaded] = useState<{ id: string; ctx: FlowCtx } | null>(null);
  useEffect(() => {
    if (id === K26_ID || !withFlow) return;
    let live = true;
    loadHistoryFlow(id)?.then((f) => { if (live) setLoaded({ id, ctx: flowCtxFrom(f as FlowFile) }); });
    return () => { live = false; };
  }, [id, withFlow]);
  const ctx = id === K26_ID ? flowCtx2026() : loaded?.id === id ? loaded.ctx : null;
  const [sharing, setSharing] = useState(false);
  const openSharing = useCallback(() => setSharing(true), []);
  // כפתור השיתוף של המסך — יצירת הפוסט ממעבר המצביעים (2026); בלי — השיתוף הכללי של האתר
  useRegisterNavShare(openSharing, false, withFlow && id === K26_ID);
  const prevLabel = previousElection(id)?.label ?? "הבחירות הקודמות";
  if (withFlow && !ctx) return <p className="text-ink-soft">טוען…</p>;
  return withFlow && ctx ? <Ctx.Provider value={ctx}><FlowScreen id={id} prevLabel={prevLabel} afterHeader={afterHeader} openSharing={openSharing} sharing={sharing} closeSharing={() => setSharing(false)} /></Ctx.Provider>
    : <Shell id={id} prevLabel={prevLabel} afterHeader={afterHeader} />;
}

/** כרטיס הכותרת: "מה השתנה: הקודמת מול הנוכחית" וארבעת הנתונים */
function Header({ id, prevLabel }: { id: string; prevLabel: string }) {
  return <section className="rounded-theme border border-paper-line bg-paper-card shadow-sm p-3 md:p-4">
    <div className="flex items-center justify-between gap-2"><h1 className="text-2xl font-display leading-tight">מה השתנה: {prevLabel} מול {electionOption(id).label}</h1></div>
    <OverviewCards pair={overviewPair(id)} />
  </section>;
}

/** אותו מבנה בלי נתוני מעבר: אותן מגירות, ובכל אחת "נתון חסר" */
function Shell({ id, prevLabel, afterHeader }: { id: string; prevLabel: string; afterHeader?: ReactNode }) {
  return <div>
    <Header id={id} prevLabel={prevLabel} />
    {afterHeader}
    <Fold title="מעבר בין מפלגות"><Missing what="מעבר המצביעים" /></Fold>
    <Fold title="מעבר בין גושים"><Missing what="המעבר בין גושים" /></Fold>
    <Fold title="חיפוש לפי עיר או קלפי"><Missing what="תוצאות לפי קלפי" /></Fold>
    <Fold title="תוצאות לפי יישוב"><LocalityResults key={id} electionId={id} /></Fold>
  </div>;
}

function FlowScreen({ id, prevLabel, afterHeader, openSharing, sharing, closeSharing }: { id: string; prevLabel: string; afterHeader?: ReactNode; openSharing: () => void; sharing: boolean; closeSharing: () => void }) {
  const c = useFlowCtx(), is26 = id === K26_ID;
  const raw = flowsFor(c);
  const data = { lists: without(raw.lists, ["other", "abstain"]), blocs: raw.blocs ? without(raw.blocs, ["other"]) : null };
  const sameRow: Record<string, string> = { ...c.same, other: "other", abstain: "abstain" };
  // בלי שיוך גושים (עד שיתווסף ל-results.json) — הפסים בצבע אחיד של האתר (--accent)
  const fromColor = c.hasBlocs ? c.blocOld : () => "none", toColor = c.hasBlocs ? c.blocNew : () => "none";
  const years: [string, string] = [c.prevLabel, c.curLabel];
  return (
    <div>
      {/* חלון ההסבר בראש המסך (הכרעת בעלים 30.10.2026) */}
      {/* חלון ההסבר ויצירת הפוסט — של 2026 (הנתונים והתמונות שלהם הם של 2022⇐2026) */}
      {is26 && <div className="mb-3"><FlowExplain /></div>}
      {is26 && <RotatingPromo messages={FLOW_SHARE_MESSAGES} callToAction={FLOW_SHARE_CTA} label="יצירת תמונה או פוסט מותאם אישית — לחצו וצרו פוסט מעוצב בדיוק על מה שמעניין אתכם!" onClick={openSharing} />}
      {/* הכותרת ככרטיס עם ארבעת הנתונים הכלליים, כל אחד בכרטיס (הכרעת בעלים 29.10.2026); חלון ההסבר שבראש המסך הוא ההסבר היחיד (02.11.2026) */}
      <Header id={id} prevLabel={prevLabel} />
      {afterHeader}
      <Explained
        kind="השוואה"
        source={is26 ? "תוצאות האמת לפי קלפי: 2022 (data.gov.il) ו-2026 (ועדת הבחירות המרכזית)" : `תוצאות האמת לפי קלפי של ועדת הבחירות המרכזית: ${c.prevLabel} ו-${c.curLabel}`}
        asOf="התוצאות הסופיות"
        assumption={is26 ? "כל קלפי מושווית לאותה קלפי; קלפי שחלוקתה השתנתה — לפי הקלפי השלמה, אחר כך לפי מיקום הקלפי, ולבסוף לפי היישוב. הסכום של כל מפלגה הוא הספירה הרשמית; קלפיות שעדיין לא נספרו ב-2026 — לפי השינוי באותו יישוב; יישוב בלי קלפי ב-2022 — ״יישובים חדשים״. אין שימוש בסקרים."
          : `כל קלפי מושווית לאותה קלפי; קלפי שחלוקתה השתנתה — לפי מיקום הקלפי כשהוא בקובץ, ולבסוף לפי היישוב. הסכום של כל מפלגה הוא הספירה הרשמית; יישוב בלי קלפי ב-${c.prevLabel} — ״יישובים חדשים״. נקודת המוצא אחידה, בלי שיוך מוקדם בין הרשימות. אין שימוש בסקרים.`}
        methodAnchor="voter-flow"
        inFooter
      >
        {/* שלושה חלקים נפתחים (הכרעת בעלים 29.10.2026) */}
        <Fold title="מעבר בין מפלגות">
          {/* כפתור "הצגה בגרף" — גרף זרימה במקום הכרטיסים (הכרעת בעלים 30.10.2026) */}
          <GraphSwitch defaultOn graph={is26 ? {} : { T: c.file.national.flowsTo, oldIds: c.file.old, newIds: c.file.new, oldName: c.oldName, newName: c.newName, years }}><Lines rows={data.lists} kind="party" same={(id) => sameRow[id]} fromColor={fromColor} toColor={toColor} /></GraphSwitch>
        </Fold>
        <Fold title="מעבר בין גושים">
          {data.blocs ? <GraphSwitch defaultOn graph={{ ...blocGraph(c), years }}><Lines rows={data.blocs} kind="bloc" same={(id) => id} fromColor={(id) => id} toColor={(id) => id} /></GraphSwitch> : <Missing what="המעבר בין גושים" />}
        </Fold>
        {/* ״איך זה חושב?״ בתחתית העמוד (הכרעת בעלים 29.10.2026) */}
        <Fold title="חיפוש לפי עיר או קלפי">
          <Suspense fallback={<p className="text-ink-soft">טוען…</p>}><BallotLookup key={id} ctx={c} /></Suspense>
        </Fold>
        <Fold title="תוצאות לפי יישוב"><LocalityResults key={id} electionId={id} /></Fold>
      </Explained>
      <DrawerTop />
      {sharing && <Suspense fallback={null}><FlowShare onClose={closeSharing} /></Suspense>}
    </div>
  );
}

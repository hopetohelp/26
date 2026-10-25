import { HAGZARA_GROUP_ID, KNESSET_GROUPS } from "../../lib/simpleSources";
import { HagzaraCount } from "../simple/shared";
import SourcePicker from "../../components/SourcePicker";
import { useSourcePreference } from "../../lib/sourcePreference";
import { createContext, useContext } from "react";
import { resolveDataset, resolveData, type Selection } from "../../lib/dataResolver";
import CommunityShare, { type GroupShareInfo } from "./CommunityShare";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePersonalBlocs } from "../../components/PersonalBlocs";
import { Card } from "../../components/ui";
import { Segmented } from "../../components/Choice";
import { MODEL_AVERAGE, useCrowdDashboard } from "../../lib/sources";
import { call, type Cell, type Dashboard as D, type GroupDashboard, type GroupPublic, type SeatStat, type SeatsPayload } from "../../lib/crowdApi";
import { SAVED_EVENT } from "../../lib/outbox";
import { date, pctValue, rng, seatsFmt } from "../../lib/format";
import { DEFAULT_BLOCS, GOV_IDS, k25VoteName, nameOf, V2022_LABEL, V2026_LABEL } from "./model";
import { voteContinuity } from "./voteContinuity";
import { votingRows } from "./votingRows";
import { Notice } from "./ui";
import { candleProfiles, quantileSegs } from "../../lib/chartLanguage";
import ChartLegend, { rangeLine } from "../../components/ChartLegend";
import { AxisLabels, CapsuleMarks, ProfileCandle, Track } from "../../components/marks";
import { PartyAvatar } from "../../components/PartyAvatar";
import EditBlocsButton from "../../components/EditBlocsButton";
import GroupBanner from "../../components/GroupBanner";
import { groupImageUrl, groupUrl } from "../../lib/groupLink";
import { blankDashboard, blankStat, listsFromPolls } from "../../lib/groupBlank";
import { BlocAvatar } from "../../components/BlocAvatar";
import type { useSession } from "./useCrowd";


type View = "table" | "chart";

const range = (s: SeatStat) => s.min === s.max ? "" : rng(seatsFmt(s.min), seatsFmt(s.max));
const v2026Name = (k: string) => V2026_LABEL[k] ?? nameOf(k);
const v2022Name = (k: string) => V2022_LABEL[k] ?? k25VoteName(k);
const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const pctOf = (cell: Cell) => cell.of ? cell.n / cell.of * 100 : 0;
const ComparisonContext = createContext<Selection>({ product: "polls.mean" });
function usePollSummary() {
  const selection = useContext(ComparisonContext);
  return (ids: string[]) => {
    const r = resolveData(selection, ids, "community");
    return r.value === null || !r.range ? null : { mean: r.value, range: r.range };
  };
}


export default function Dashboard({ session, landing = null, mine }: { session: ReturnType<typeof useSession>; landing?: GroupPublic | null; mine: SeatsPayload | null }) {
  // ממוצע המשתתפים — מהמקור האחד (src/lib/sources.ts): מתעדכן כל דקה, בחזרה לדף ואחרי כל שמירה
  const preference = useSourcePreference("community");
  const [temporary, setTemporary] = useState<Selection | null>(null);
  const selection = temporary ?? preference.selection;
  const SIMPLE_POLL_MEANS = resolveDataset(selection, "community").seats;
  const crowd = useCrowdDashboard();
  // פילוח לפי קבוצה (docs/פילוח-קבוצות-תכנון.md): הכפתור מוצג רק לחבר בקבוצה; השרת בודק את החברות ואוכף את הסף
  const groups = session.me?.groups ?? [];
  const [picked, setPicked] = useState(landing?.id ?? "all");
  // בלי מתג "כל המשתתפים / הגזרה" (הכרעת בעלים 25.10.2026): לחבר הגזרה — נתוני חברי הגזרה, וטור "כל הניחושים" לפי מתג
  void setPicked;
  const scope = groups.some((g) => g.id === HAGZARA_GROUP_ID) ? HAGZARA_GROUP_ID : groups.some((g) => g.id === picked) ? picked : "all";
  const [group, setGroup] = useState<{ id: string; data: GroupDashboard | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (scope === "all" || !session.token) return;
    let live = true;
    const load = () => call<GroupDashboard>(`/dashboard?group=${encodeURIComponent(scope)}`, { token: session.token })
      .then((data) => { if (live) setGroup({ id: scope, data, failed: false }); })
      .catch(() => { if (live) setGroup((g) => ({ id: scope, data: g?.id === scope ? g.data : null, failed: true })); });
    void load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener(SAVED_EVENT, load);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener(SAVED_EVENT, load); };
  }, [scope, session.token]);
  const groupData = scope !== "all" && group?.id === scope ? group.data : null;
  const isHagzara = scope === HAGZARA_GROUP_ID;
  const d0 = scope === "all" ? crowd.dashboard : groupData && !groupData.belowMin ? groupData : null;
  // טור הסקרים: ממוצע פשוט של הסקר האחרון של כל מכון, מאותו מקור שממנו מחושב הטווח.
  // קבוצה מתחת לסף: המסך כולו עם אפסים בטורי המשתתפים, והמונה הוא הספירה האמיתית (הכרעת בעלים 12.10.2026)
  const blank = groupData?.belowMin ? groupData : null;
  const blankLists = crowd.dashboard?.seats?.everPassedLists ?? listsFromPolls(SIMPLE_POLL_MEANS);
  const d: D | null = blank
    ? blankDashboard(blank.participants ?? 0, blankLists, SIMPLE_POLL_MEANS, MODEL_AVERAGE.asOf)
    : d0 && d0.seats ? { ...d0, seats: { ...d0.seats, polls: SIMPLE_POLL_MEANS, pollsAsOf: MODEL_AVERAGE.asOf } } : d0;
  const err = (scope === "all" ? crowd.failed : group?.id === scope && group.failed && !groupData) ? "הסטטיסטיקות אינן זמינות כרגע. נסו שוב בעוד כמה דקות." : null;
  const [view, setView] = useState<View>("table");
  // השוואה לכלל המשתתפים בתצוגת קבוצה: טורי ממוצע וטווח של כולם, אחרי קו הפרדה
  const [compare, setCompare] = useState(false);
  const all = crowd.dashboard;
  const comparing = scope !== "all" && compare && view === "table" && !!all?.open;
  const groupName = groups.find((g) => g.id === scope)?.name ?? "הקבוצה";
  const overallSeats: Overall | undefined = comparing && all?.seats ? { name: groupName, of: (id) => all.seats!.full.find((x) => x.list === id) } : undefined;
  const allBlocs = useMemo(() => comparing && all?.blocs ? blocStats(all) : null, [comparing, all]);
  const overallBlocs: Overall | undefined = allBlocs ? { name: groupName, of: (k) => allBlocs.get(k) } : undefined;

  useEffect(() => { void session.refresh(); }, [session.refresh]);
  // העותק שבאתר מוצג לכולם, גם בלי חיבור לשרת; הנתונים מהשרת מחליפים אותו כשהם חדשים יותר.
  const personal = usePersonalBlocs();

  const scopeBar = null;
  // ראש המסך: תמונת הקבוצה הנבחרת, או של הקבוצה שהקישור הוביל אליה; השם רק אם אין לגולש מתג עם שמה
  const shownGroup = scope !== "all" ? groups.find((g) => g.id === scope) : landing;
  const banner = shownGroup && <GroupBanner id={shownGroup.id} name={shownGroup.name} image={shownGroup.image} showName={!groups.some((g) => g.id === shownGroup.id)} />;
  // שיתוף של הקבוצה (הכרעת בעלים 12.10.2026): עם שמה ולוגו; נתוני הקבוצה בתמונות רק מ-50 משתתפים, ובקישור מהאורח — רק הזמנה וקישור
  const groupShare: GroupShareInfo | undefined = shownGroup?.slug ? { name: shownGroup.name ?? "הקבוצה", url: groupUrl(shownGroup.slug), logoUrl: groupImageUrl({ slug: shownGroup.slug }, shownGroup.image), dataReady: scope !== "all" && !blank } : undefined;
  // בקבוצה: תמונה בראש המסך והמתג אחריה; פס השיתוף צף בתחתית.
  const top = <>{banner}{isHagzara && <HagzaraCount members={groupData && !groupData.belowMin ? groupData.seats?.n ?? null : null} total={crowd.dashboard?.seats?.n} />}{groupShare && d && <CommunityShare selection={selection} d={d} group={groupShare} />}{scopeBar}</>;
  if (err) return <>{top}<Notice tone="warn">{err}</Notice></>;
  if (!d) return <>{top}<p className="text-ink-soft">טוען…</p></>;

  const asOf = d.publishedAt ? `${date(d.publishedAt)}, ${time(d.publishedAt)}` : "הפרסום האחרון";
  // "נכון ל" מוצג רק כשהפרסום ישן בשעתיים לפחות
  const stale = !!d.publishedAt && Date.now() - Date.parse(d.publishedAt) >= 2 * 3600_000;
  // במקום הגושים האישיים הישנים — חמש הקבוצות הקבועות (הכרעת בעלים 25.10.2026)
  void personal;
  const userBlocs = KNESSET_GROUPS;
  return (
    <div>
      {top}
      {blank && <section className="border-2 border-ink rounded-theme p-4 mb-4" aria-labelledby="group-small"><h2 id="group-small" className="text-xl font-display leading-tight">לשמירה על חוק סקרי הבחירות, אי אפשר לפרסם נתונים על קבוצה קטנה. לכן הנתונים יוצגו רק אחרי {blank.min} משתתפים.</h2></section>}
      {/* שיתוף: של כלל המשתתפים, או של הקבוצה (עם שמה ולוגו) כשהמסך פתוח עליה */}
      {!groupShare && scope === "all" && <CommunityShare selection={selection} d={d} />}
      {!blank && d.participants < 30 && <div className="mb-4"><Notice tone="warn">מעט משתתפים — הנתונים אינם מייצגים את הציבור.</Notice></div>}
      {(stale || scope !== "all") && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-4">
        <div>
          {stale && <p className="text-sm text-ink-soft">נכון ל-{asOf}</p>}
        </div>
        {scope !== "all" && view === "table" && <Toggle value={compare ? "on" : "off"} setValue={(v) => setCompare(v === "on")} options={[["off", isHagzara ? "הגזרה והסקרים" : "הקבוצה בלבד"],["on","גם כל הניחושים"]]} label="טור כל הניחושים" />}
      </div>}
      <SourcePicker screen="community" selection={selection} onChange={setTemporary} notice={preference.notice} />
      <ComparisonContext.Provider value={selection}>
      {d.seats ? <SeatsStats onView={setView} rows={d.seats.full} polls={d.seats.polls} mine={mine} view={view} passedLists={d.seats.everPassedLists} overall={overallSeats} /> : <Notice>עדיין אין ניחושי מנדטים להצגה.</Notice>}
      <BlocStats d={d} blank={!!blank} view={view} mineBlocs={userBlocs} mineSeats={mine} overall={overallBlocs} overallD={comparing ? all ?? undefined : undefined} />
      {(blank || d.vote2026 || d.vote2022 || d.matrix || d.byVote) && <VotingStats d={d} blankLists={blank ? blankLists : undefined} />}
      </ComparisonContext.Provider>
    </div>
  );
}

/**
 * כותרת קטע סטטיסטיקה (הכרעת בעלים 12.10.2026): הכותרת באמצע, ומתחתיה שורה — מתג מימין ומספר המשתתפים משמאל.
 * אותה כותרת למנדטים ולהצבעה. `action`: כפתור באותה שורה של הכותרת, לצידה (עריכת הגושים; הכרעת בעלים 12.10.2026). בגושים אין מספר כללי: המספר מוצג בכל גוש בנפרד.
 */
function SectionTitle({ title, count, toggle, action }: { title: string; count?: number; toggle?: ReactNode; action?: ReactNode }) {
  return <>
    {action
      ? <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mb-3"><h2 className="text-2xl font-display leading-tight">{title}</h2>{action}</div>
      : <h2 className="text-2xl font-display leading-tight text-center mb-3">{title}</h2>}
    {(toggle || count !== undefined) && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
      {toggle ?? <span />}
      {count !== undefined && <span className="text-2xl tabular font-display">{count} משתתפים</span>}
    </div>}
  </>;
}

function Toggle<T extends string>({ value, setValue, options, label }: { value: T; setValue: (v:T)=>void; options: readonly (readonly [T,string])[]; label:string }) {
  return <Segmented value={value} onChange={setValue} label={label} className="min-w-[12rem]" options={options.map(([id, text]) => ({ id, label: text }))} />;
}

/** רוחב הטורים: הראשון רחב, ושאר טורי המספרים שווים (סקרים, משתתפים, "שלך", וכל המשתתפים בהשוואה) */
const StatCols = ({ data }: { data: number }) => {
  const first = data >= 4 ? 28 : data === 3 ? 34 : 40;
  return <colgroup><col style={{ width: `${first}%` }} />{Array.from({ length: data }, (_, i) => <col key={i} style={{ width: `${(100 - first) / data}%` }} />)}</colgroup>;
};
/** השוואה לכלל המשתתפים (בתצוגת קבוצה): קו הפרדה עבה לפני הטור של הכלל */
const SEP = "border-s-2 border-ink-faint ps-1";
/** בהשוואה הטורים צרים: כותרות קטנות */
const CMP_HEAD = "text-xs sm:text-sm leading-tight";
/**
 * תא ממוצע וטווח (הכרעת בעלים 12.10.2026): הממוצע בגופן גדול מעט (16px), הטווח קטן מעט (12px).
 * במסך צר הטווח מתחת לממוצע, ובמסך רחב הוא לידו.
 */
const AvgRange = ({ mean, range: rangeText = "", bold = false }: { mean: ReactNode; range?: string; bold?: boolean }) => (
  <span className="flex flex-col items-center sm:flex-row sm:items-baseline sm:justify-center sm:gap-1.5">
    <span className={`text-base leading-tight ${bold ? "font-bold" : ""}`}>{mean}</span>
    {rangeText ? <bdi dir="ltr" className="text-xs leading-tight text-ink-soft whitespace-nowrap">{rangeText}</bdi> : null}
  </span>
);
/** טווח הסקרים כטקסט, או ריק (אין טווח, או שהנמוך שווה לגבוה) */
const pollRangeText = (r: [number, number] | null) => r && r[0] !== r[1] ? rng(seatsFmt(r[0]), seatsFmt(r[1])) : "";
type Overall = { name: string; of: (key: string) => SeatStat | null | undefined };

export function SeatsStats({ rows, polls, mine, view, onView, passedLists, overall }: { onView?: (v: View) => void; passedLists?: string[]; rows: SeatStat[]; polls: Record<string,number>; mine?: SeatsPayload | null; view: View; overall?: Overall }) {
  const pollSummary = usePollSummary();
  const sorted = useMemo(() => rows.filter(s => passedLists ? passedLists.includes(s.list) : s.max >= 4).sort((a,b)=>b.mean-a.mean || b.max-a.max), [rows, passedLists]);
  const suffix = "";
  const format = (n: number) => `${seatsFmt(n)}${suffix}`;
  const myValue = (id: string) => mine?.seats[id]?.v;
  const head = <SectionTitle title="חלוקת המנדטים" count={rows[0]?.n ?? 0} toggle={onView && <Segmented size="sm" tight value={view} onChange={onView} label="צורת תצוגה" options={[{ id: "table", label: "טבלה" }, { id: "chart", label: "גרף" }]} />} />;
  if (view === "chart") return <><Bars suffix={suffix} head={head} rows={sorted.map(s=>({key:s.list,label:nameOf(s.list),mean:s.mean,lo:s.min,hi:s.max,q:[s.min,s.p25,s.median,s.p75,s.max],poll:polls[s.list] ?? 0}))} /></>;
  const dataCols = 2 + (mine ? 1 : 0) + (overall ? 1 : 0);
  return <Card className="!border-t-0">{head}<div className="overflow-x-auto"><table className="w-full table-fixed text-sm tabular">
    <StatCols data={dataCols} />
    <thead><tr className={`text-ink-soft ${overall ? CMP_HEAD : ""}`}><th className="text-start font-normal">רשימה</th><th className="font-normal">סקרים</th><th className="font-normal">{overall ? overall.name : "משתתפים"}</th>{mine && <th className="font-normal">שלך</th>}{overall && <th className={`font-normal ${SEP}`}>כל המשתתפים</th>}</tr></thead>
    <tbody>{sorted.map(s=>{ const o = overall?.of(s.list); return <tr key={s.list} className="border-t border-paper-line"><td className="py-2 pe-2"><span className="flex items-center gap-2"><PartyAvatar id={s.list} size={28} />{nameOf(s.list)}</span></td><td className="text-center"><AvgRange mean={format(polls[s.list] ?? 0)} range={pollRangeText(pollSummary([s.list])?.range ?? null)} /></td><td className="text-center"><AvgRange bold mean={format(s.mean)} range={range(s) ? `${range(s)}${suffix}` : ""} /></td>{mine && <td className="text-center">{myValue(s.list) === undefined ? "—" : format(myValue(s.list)!)}</td>}{overall && <td className={`text-center ${SEP}`}><AvgRange bold mean={o ? format(o.mean) : "—"} range={o && Number.isFinite(o.min) ? range(o) : ""} /></td>}</tr>; })}</tbody>
  </table></div></Card>;
}

const compKey = (lists: string[]) => [...new Set(lists)].sort().join(",");

/**
 * הנתון של כל הרכב גוש אצל כלל המשתתפים: הגושים הקבועים, וגוש מותאם שלפחות חמישה משתתפים הגדירו (הכרעת בעלים 11.10.2026)
 * וכשיש לו לפחות שתי רשימות וממוצע של 4 מנדטים לרשימה. הרכב שאין לו נתון — אין במפה.
 */
function blocStats(d: D): Map<string, SeatStat> {
  const b = d.blocs!;
  const fixed = b.fixed ?? [{ id: "government", name: "הממשלה היוצאת", lists: GOV_IDS, stat: b.derived?.gov ?? null }, ...DEFAULT_BLOCS.blocs.filter(g => g.id !== "government").map(g => ({ id: g.id, name: g.name, lists: g.lists, stat: null }))];
  const map = new Map<string, SeatStat>();
  for (const g of fixed) if (g.stat) map.set(compKey(g.lists), g.stat);
  for (const g of b.custom ?? []) {
    const eligible = g.eligible ?? (new Set(g.lists).size >= 2 && g.derived != null && g.derived.mean >= 4 * new Set(g.lists).size);
    if (g.derived && g.n >= 5 && eligible && !map.has(compKey(g.lists))) map.set(compKey(g.lists), g.derived);
  }
  return map;
}

/**
 * שורות טבלת הגושים (הכרעת בעלים 12.10.2026): לכל משתתף מוצגים רק הגושים שהגדיר אישית, בשמות שנתן להם;
 * מחק חלק או הכול — יוצגו לו פחות. הנתון של כל גוש הוא של כלל המשתתפים באותו הרכב (או חסר כשאין מספיק מגדירים).
 */
/** ממוצע הקבוצה מתוך ממוצעי המפלגות (ממוצע של סכומים = סכום הממוצעים); בלי טווח — הטווח דורש חישוב בשרת */
function derivedStat(d: D | undefined, lists: string[]): SeatStat | null {
  const full = d?.seats?.full;
  if (!full?.length) return null;
  const rows = [...new Set(lists)].map(id => full.find(x => x.list === id)).filter(x => x && x.n > 0) as SeatStat[];
  if (!rows.length) return null;
  const mean = rows.reduce((n, x) => n + x.mean, 0);
  return { list: "", n: Math.max(0, ...full.map(x => x.n)), mean, min: NaN, max: NaN, median: NaN, p25: NaN, p75: NaN };
}
function blocRows(d: D, mineBlocs: { name: string; lists: string[] }[], blank = false): BlocRow[] {
  const stats = d.blocs ? blocStats(d) : new Map<string, SeatStat>();
  return mineBlocs.filter(g => g.lists.length > 0)
    .map((g, i) => ({ key: `own-${i}-${compKey(g.lists)}`, lists: g.lists, label: g.name.trim() || `גוש ${i + 1}`, stat: blank ? blankStat("", 0) : stats.get(compKey(g.lists)) ?? derivedStat(d, g.lists) }))
    .sort((a, b) => (b.stat?.mean ?? -Infinity) - (a.stat?.mean ?? -Infinity));
}

export function BlocStats({ d, blank = false, view, mineBlocs = [], mineSeats, editReturnTo, overall, overallD }: { d:D; blank?: boolean; view:View; mineBlocs?: { name: string; lists: string[] }[]; mineSeats?: SeatsPayload | null; editReturnTo?: string; overall?: Overall; overallD?: D }) {
  const pollSummary = usePollSummary();
  const rows = blocRows(d, mineBlocs, blank);
  const mineOf = (lists: string[]) => mineSeats ? [...new Set(lists)].reduce((sum, id) => sum + (mineSeats.seats[id]?.v ?? 0), 0) : undefined;
  const head = <SectionTitle title="חלוקת הכנסת" action={editReturnTo ? <EditBlocsButton returnTo={editReturnTo} compact /> : undefined} />;
  if (!rows.length) return <Card className="!border-t-0">{head}<Notice>אין לך גושים מוגדרים. אפשר להוסיף גוש בעריכת הגושים.</Notice></Card>;
  if (view==="chart") return <Bars head={head} rows={rows.map(r=>({key:r.key,label:r.label,lists:r.lists,mean:r.stat?.mean ?? null,lo:r.stat && Number.isFinite(r.stat.min) ? r.stat.min : r.stat?.mean ?? 0,hi:r.stat && Number.isFinite(r.stat.max) ? r.stat.max : r.stat?.mean ?? 0,q:r.stat && Number.isFinite(r.stat.min) ? [r.stat.min,r.stat.p25,r.stat.median,r.stat.p75,r.stat.max] as BarRow["q"] : undefined,poll:pollSummary(r.lists)?.mean}))} />;
  const dataCols = 2 + (mineSeats ? 1 : 0) + (overall ? 1 : 0);
  return <Card className="!border-t-0">{head}<div className="overflow-x-auto"><table className="w-full table-fixed text-sm tabular">
    <StatCols data={dataCols} />
    <thead><tr className={`text-ink-soft ${overall ? CMP_HEAD : ""}`}><th className="text-start font-normal">גוש</th><th className="font-normal">סקרים</th><th className="font-normal">{overall ? overall.name : "משתתפים"}</th>{mineSeats && <th className="font-normal">שלך</th>}{overall && <th className={`font-normal ${SEP}`}>כל המשתתפים</th>}</tr></thead>
    <tbody>{rows.map(r=>{ const o = overall ? overall.of(compKey(r.lists)) ?? derivedStat(overallD, r.lists) : undefined; const poll = pollSummary(r.lists); return <tr key={r.key} className="border-t border-paper-line"><th className="text-start py-2 pe-2 font-normal"><BlocName id={r.key} name={r.label} lists={r.lists} /></th><td className="text-center"><AvgRange mean={poll ? seatsFmt(poll.mean) : "—"} range={pollRangeText(poll?.range ?? null)} /></td><td className="text-center"><AvgRange bold mean={r.stat ? seatsFmt(r.stat.mean) : "—"} range={r.stat && Number.isFinite(r.stat.min) ? range(r.stat) : ""} /></td>{mineSeats && <td className="text-center">{seatsFmt(mineOf(r.lists) ?? 0)}</td>}{overall && <td className={`text-center ${SEP}`}><AvgRange bold mean={o ? seatsFmt(o.mean) : "—"} range={o && Number.isFinite(o.min) ? range(o) : ""} /></td>}</tr>; })}</tbody>
  </table></div></Card>;
}

interface BlocRow { key: string; lists: string[]; label: string; stat: SeatStat | null; n?: number; own?: boolean }

function BlocName({ id, name, lists, own = false }: { id: string; name: string; lists: string[]; own?: boolean }) {
  return <details><summary className="cursor-pointer min-h-[44px] py-1 flex flex-col items-start justify-center font-bold" aria-label={`מפלגות ${name}`}><span>{name}{own && <span className="ms-1.5 text-xs font-normal text-ink-soft">שלך</span>}</span><BlocAvatar id={id} lists={lists} /></summary><p className="text-xs font-normal text-ink-soft py-1 whitespace-normal">{lists.map(nameOf).join(" · ")}</p></details>;
}

interface BarRow { key: string; label: string; lists?: string[]; own?: boolean; mean: number | null; lo: number; hi: number; q?: [number, number, number, number, number]; poll?: number }

/**
 * סקר האתר בגרף (הכרעת בעלים 9.10.2026): נר כחול = הנמוך והגבוה בין השערות המשתתפים (טווח מלא), שעוביו משתנה לאורכו:
 * הסיכום של המשתתפים כולל רבעונים (נמוך, רבעון תחתון, חציון, רבעון עליון, גבוה), ובכל קטע ביניהם 25% מהמשתתפים, ולכן הנר עבה היכן שהם צפופים ודק בזנבות.
 * עיגול ריק שחור = ממוצע המשתתפים (אינו סקר), עיגול מלא כתום = ממוצע הסקרים, כשיש.
 */
function Bars({ rows, suffix = "", title = "גושים", head }: { rows: BarRow[]; suffix?: string; title?: import("react").ReactNode; head?: import("react").ReactNode }) {
  const top = Math.max(1, ...rows.flatMap(r => [r.hi, r.mean ?? 0, r.poll ?? 0]));
  const step = suffix ? 5 : top > 60 ? 20 : 10;
  const axisMax = Math.max(step * 2, Math.ceil(top / step) * step);
  const at = (v: number) => (v / axisMax) * 100;
  const withPoll = rows.some(r => r.poll !== undefined);
  const levels = candleProfiles(rows.map(r => r.q ? quantileSegs(r.q, suffix ? 0.25 : 0.5) : []), true);
  const COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]";
  return <Card className="!border-t-0" title={head ? undefined : title}>
    {head}
    <ChartLegend
      entries={[
        { kind: "mean", text: "ממוצע הניחושים (אינו סקר)" },
        { kind: "candle", text: rangeLine("full", "הניחושים") },
        ...(withPoll ? [{ kind: "result" as const, text: "ממוצע הסקרים" }] : []),
      ]}
    />
    <div aria-hidden="true" className={`grid ${COLS} gap-2 text-xs text-ink-soft`}><div className="col-start-2"><AxisLabels axisMax={axisMax} step={step} format={v => `${v}${suffix}`} /></div></div>
    <ul className="mt-1">{rows.map((r, i) => <li key={r.key} className={`grid ${COLS} gap-2 items-center text-sm min-h-12 py-1 border-t border-paper-line last:border-b`}>
      <span className="flex items-center gap-2 min-w-0">
        {!r.lists && <PartyAvatar id={r.key} size={28} />}
        <span className="min-w-0 break-words">{r.lists ? <BlocName id={r.key} name={r.label} lists={r.lists} /> : r.label}</span>
      </span>
      <Track axisMax={axisMax} step={step} className="h-6" title={`${r.label}: הטווח המלא של ניחושי המשתתפים`}>
        {r.mean !== null && <ProfileCandle segs={levels[i]} x={at} />}
        <CapsuleMarks primary={r.mean !== null ? { at: at(r.mean), value: r.mean, label: "ממוצע הניחושים", text: `${seatsFmt(r.mean)}${suffix}` } : undefined} secondary={r.poll !== undefined ? { at: at(r.poll), value: r.poll, label: "ממוצע הסקרים", text: `${seatsFmt(r.poll)}${suffix}` } : undefined} />
      </Track>
      <span className="font-num tabular whitespace-nowrap">{r.mean === null ? "חסר נתון" : <>{r.lo !== r.hi ? `טווח ${rng(seatsFmt(r.lo), seatsFmt(r.hi))}${suffix}` : ""}</>}</span>
      <span className="sr-only">; {r.mean === null ? "חסר נתון" : `ממוצע הניחושים ${seatsFmt(r.mean)}${suffix}, בין ${seatsFmt(r.lo)} ל-${seatsFmt(r.hi)}`}{r.poll !== undefined ? `; ממוצע הסקרים ${seatsFmt(r.poll)}${suffix}` : ""}</span>
    </li>)}</ul>
  </Card>;
}


type Unit = "pct" | "num";
/** עד שתי ספרות אחרי הנקודה, בלי אפסים מיותרים: 1.65, 3, 0.5 */
const fmtNum = (v: number) => String(Math.round(v * 100) / 100);

export function VotingStats({ d, blankLists }: { d: D; blankLists?: string[] }) {
  const [unit, setUnit] = useState<Unit>("num");
  const count = d.sectionParticipants?.vote2026 ?? d.sectionParticipants?.vote2022;
  return <Card className="!border-t-0">
    <SectionTitle title="הצבעה אז והיום" count={count} toggle={<Segmented size="sm" tight value={unit} onChange={setUnit} label="יחידת התצוגה" options={[{ id: "pct", label: "אחוז" }, { id: "num", label: "מספר" }]} />} />
    <VoteComparison d={d} unit={unit} participants={count ?? 0} blankLists={blankLists} />
    {unit === "num" && <p className="text-xs text-ink-soft mt-2">המספר בבחירות קודמות הוא התוצאה הרשמית באחוזים ביחס למשתתפים בסקר.</p>}
    {d.matrix && <section className="mt-6"><Matrix d={d} unit={unit} /></section>}
  </Card>;
}

export function VoteComparison({ d, unit, participants, blankLists }: { d: D; unit: Unit; participants: number; blankLists?: string[] }) {
  const rows = votingRows(d, blankLists);
  const cell = (v: number | null, n: number | null) => v === null ? "—" : unit === "pct" ? `${pctValue(v)}%` : n === null ? "—" : fmtNum(n);
  return <div className="overflow-x-auto"><table className="w-full table-fixed text-xs sm:text-sm tabular">
    <thead><tr className="text-ink-soft"><th className="text-start w-[28%]">רשימה</th><th className="font-normal">בחירות קודמות<br />כלל המצביעים</th><th className="font-normal">בחירות קודמות<br />הצביעו מהמשתתפים</th><th className="font-normal">בחירות הבאות<br />מתכננים להצביע</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.key} className="border-t border-paper-line"><th className="text-start font-normal py-2 pe-1 break-words">{r.name}</th>
      <td className="text-center">{r.official === null ? "—" : unit === "pct" ? `${r.official}%` : fmtNum(r.official * participants / 100)}</td>
      <td className="text-center">{cell(r.previous, r.previousN)}</td>
      <td className="text-center">{cell(r.next, r.nextN)}</td></tr>)}</tbody>
  </table></div>;
}

export function Matrix({ d, unit }: { d: D; unit: Unit }) {
  const m = d.matrix!;
  const continuity = voteContinuity(m);
  const show = (n: number) => unit === "pct" ? `${pctValue(n / continuity.total * 100)}%` : String(n);
  // סדר (הכרעת בעלים 12.10.2026): שורות לפי מספר המשתתפים שבחרו בתשובה בבחירות קודמות, וטורים לפי מספר אלה שבחרו בה לבחירות הבאות
  const colTotal = (col: string) => d.vote2026?.all[col]?.n ?? Object.values(m.rows).reduce((a, r) => a + (r.cells[col]?.n ?? 0), 0);
  const rowTotal = (key: string, n: number) => d.vote2022?.all[key]?.n ?? n;
  const cols = [...new Set(Object.values(m.rows).flatMap((r) => Object.keys(r.cells)))].sort((a, b) => colTotal(b) - colTotal(a));
  const rowsSorted = Object.entries(m.rows).sort(([ka, a], [kb, b]) => rowTotal(kb, b.n) - rowTotal(ka, a.n));
  return <div>
    {continuity.total > 0 && <p className="text-base text-center mb-3"><strong>{unit === "pct" ? show(continuity.changed) : `${continuity.changed}/${continuity.total}`}</strong> מהמצביעים בבחירות קודמות עברו מפלגה</p>}
    <div className="overflow-x-auto">
    <table className="text-xs tabular min-w-full border-collapse">
      <thead>
        <tr>
          <th rowSpan={2} className="text-center p-1 sticky start-0 bg-paper-card align-bottom border-b border-e-2 border-paper-line border-e-ink-faint/60 min-w-24 font-bold">
            מתוך המצביעים בבחירות קודמות למפלגה:
          </th>
          <th colSpan={Math.max(cols.length, 1)} className="p-1 text-center font-bold">מתכננים להצביע בבחירות הקרובות למפלגה</th>
        </tr>
        <tr className="border-b border-paper-line">
          {cols.map((col) => <th key={col} className="p-1 font-normal text-ink-soft whitespace-nowrap">{v2026Name(col)}</th>)}
        </tr>
      </thead>
      <tbody>
        {rowsSorted.map(([key, row]) => <tr key={key} className="border-t border-paper-line">
          <th className="text-center p-1 font-bold whitespace-nowrap sticky start-0 bg-paper-card border-e-2 border-e-ink-faint/60">{v2022Name(key)}</th>
          {cols.map((col) => {
            const cell = row.cells[col];
            const hidden = row.hidden || !cell || cell.hidden;
            return <td key={col} className={`p-1 text-center ${hidden ? "text-ink-faint" : ""}`}>{hidden ? "—" : unit === "pct" ? `${pctValue(pctOf(cell))}%` : cell.n}</td>;
          })}
        </tr>)}
      </tbody>
    </table>
    </div>
  </div>;
}

// תאימות לבדיקות הרכיבים הוותיקות בזמן המעבר לדשבורד המאוחד.
export const StatTable = ({ rows, polls, mine }: { rows: SeatStat[]; polls: Record<string, number>; mine?: SeatsPayload | null }) => <SeatsStats rows={rows} polls={polls} mine={mine} view="table" />;
export const BlocsBlock = ({ d }: { d: D }) => <BlocStats d={d} view="table" />;

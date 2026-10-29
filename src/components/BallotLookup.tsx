import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "./Choice";
import InfoTip from "./InfoTip";
import BallotCards from "./BallotCards";
import { Delta } from "./ParamCard";
import { PartyAvatar } from "./PartyAvatar";
import SearchField, { type Suggestion } from "./SearchField";
import { changeOf } from "../lib/changeMark";
import { num, pctOne } from "../lib/format";
import { ballotOptions, ballotView, leadParty, lookupScopes, matchingPlaces, sortLookupScopes, subBallotOptions, type BallotFilter, type BallotLocations, type BallotUnits, type LeadParty, type LookupLevel, type LookupScope, type LookupSort } from "../lib/ballotLookup";

const ALL: Suggestion = { id: "all", value: "הכל", label: "הכל" };
const query = (value: string) => value === ALL.value ? "" : value;
const SORTS: { id: LookupSort; label: string }[] = [
  { id: "name", label: "לפי א-ב" }, { id: "voters", label: "לפי מספר מצביעים" }, { id: "turnout", label: "לפי אחוז הצבעה" },
];

interface Fields { city: string; ballot: string; sub: string }
/** שם הכפתור שחוזר לרשימה או ליחידה שממנה נכנסו (הכרעת בעלים 29.10.2026) */
const backLabel = (prev: Fields) =>
  prev.city === ALL.value ? "חזרה לרשימת הערים" : prev.ballot === ALL.value ? "חזרה לרשימת הקלפיות" : prev.sub === ALL.value ? "חזרה לרשימת תתי הקלפי" : prev.city ? `חזרה ל${prev.city}` : "חזרה";

const Icon = ({ d, className = "w-5 h-5" }: { d: string; className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const CHEVRON = "M15 5l-7 7 7 7", BACK = "M9 5l7 7-7 7", UP = "M12 19V5M5.5 11.5L12 5l6.5 6.5";

/** מפלגה מובילה בשורה קומפקטית: ברוחב — סמל, שם, אחוז ומנדטים; בצר — שם ומספר מנדטים בלבד, ומי שלא עברה — אחוז */
function Lead({ lead, narrow }: { lead: LeadParty; narrow: boolean }) {
  const seats = lead.seats > 0;
  if (narrow) return <span className="sm:hidden font-bold text-xs whitespace-nowrap">{lead.name} <bdi dir="ltr">{seats ? lead.seats : pctOne(lead.ofValid)}</bdi></span>;
  return <span className="hidden sm:flex items-center gap-2 min-w-0">
    <PartyAvatar id={lead.id} size={30} fallback={lead.name.slice(0, 1)} />
    <span className="min-w-0 leading-tight"><b className="block text-sm truncate">{lead.name}</b>
      <span className="block text-xs text-ink-soft tabular-nums"><bdi dir="ltr">{pctOne(lead.ofValid)}</bdi>{seats && <> · <bdi dir="ltr">{lead.seats}</bdi> מנדטים</>}</span></span>
  </span>;
}

/** שורה קומפקטית ליחידה ברשימה: שם, מצביעים ואחוז הצבעה ב־2026 והפער מ־2022, והמפלגה המובילה; לחיצה פותחת את כרטיסי היחידה */
function ScopeRow({ units, scope, onOpen }: { units: BallotUnits; scope: LookupScope; onOpen: (scope: LookupScope) => void }) {
  const scopedUnits = useMemo(() => ({ ...units, places: { [scope.code]: units.places[scope.code] } }), [units, scope.code]);
  const view = useMemo(() => ballotView(scopedUnits, { city: "", ballot: scope.ballot, sub: scope.sub }), [scopedUnits, scope.ballot, scope.sub]);
  const lead = useMemo(() => leadParty(view), [view]);
  const { old, now } = view;
  const both = old.present && now.present;
  const dVoters = both ? changeOf(now.voters - old.voters, "count") : null;
  const dTurnout = both && old.turnout !== null && now.turnout !== null ? changeOf(now.turnout - old.turnout, "pct") : null;
  const stat = (label: string, value: string | null, change: ReturnType<typeof changeOf>) => (
    <span className="min-w-0"><span className="block text-[11px] text-ink-soft">{label}</span>
      <span className="font-bold tabular-nums text-sm">{value === null ? "—" : <bdi dir="ltr">{value}</bdi>}</span>{change && <>{" "}<span className="text-xs"><Delta change={change} /></span></>}</span>
  );
  return <li>
    <button type="button" onClick={() => onOpen(scope)} aria-label={`פתיחת ${scope.label}`}
      className="w-full text-start rounded-theme border border-paper-line bg-paper-card shadow-sm px-3 py-2 min-h-[44px] grid items-center gap-x-3 gap-y-1.5 hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent grid-cols-[minmax(0,1fr)_auto_1.25rem] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)_minmax(0,1.3fr)_1.25rem]">
      <span className="col-start-1 row-start-1 min-w-0"><b className="block leading-tight break-words">{scope.label}</b>{scope.location && <span className="block text-xs text-ink-soft truncate">{scope.location}</span>}</span>
      {lead && <span className="col-start-2 row-start-1 sm:hidden"><Lead lead={lead} narrow /></span>}
      <span className="col-start-3 row-start-1 sm:col-start-4 text-accent"><Icon d={CHEVRON} className="w-5 h-5" /></span>
      <span className="col-span-3 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 grid grid-cols-2 gap-3">
        {stat("מצביעים", now.present ? num(now.voters) : null, dVoters)}
        {stat("אחוז הצבעה", now.present && now.turnout !== null ? pctOne(now.turnout) : null, dTurnout)}
      </span>
      {lead && <span className="hidden sm:flex sm:col-start-3 sm:row-start-1"><Lead lead={lead} narrow={false} /></span>}
    </button>
  </li>;
}

/** כל הרשומות נגישות בגלילה רציפה; השורות מתווספות בהדרגה כדי לא להקפיא רשימה ארצית. */
function ScopeList({ units, scopes, onOpen }: { units: BallotUnits; scopes: LookupScope[]; onOpen: (scope: LookupScope) => void }) {
  const [visible, setVisible] = useState(24);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!end.current || visible >= scopes.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => Math.min(v + 24, scopes.length));
    }, { rootMargin: "800px" });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [visible, scopes.length]);
  if (!scopes.length) return <p role="status">לא נמצאו יחידות מתאימות.</p>;
  return <div className="space-y-2">
    <ul className="space-y-2">{scopes.slice(0, visible).map((scope) => <ScopeRow key={scope.id} units={units} scope={scope} onOpen={onOpen} />)}</ul>
    {visible < scopes.length && <div ref={end} role="status" className="py-4 text-sm text-ink-soft">טוען המשך…</div>}
  </div>;
}

/** כפתור חץ צף לחזרה לראש המגירה; מופיע רק אחרי גלילה בתוך המגירה */
function BackToTop({ target }: { target: React.RefObject<HTMLElement> }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = target.current?.getBoundingClientRect();
      setShown(!!r && r.height > 0 && r.top < -240 && r.bottom > 160);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [target]);
  if (!shown) return null;
  const go = () => {
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };
  return <button type="button" onClick={go} aria-label="חזרה לראש החיפוש לפי עיר או קלפי"
    className="fixed left-3 z-30 w-11 h-11 rounded-full bg-accent text-paper-card shadow-lg grid place-items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent bottom-[calc(6rem+env(safe-area-inset-bottom))] lg:bottom-6">
    <Icon d={UP} className="w-6 h-6" />
  </button>;
}

export default function BallotLookup() {
  const [units, setUnits] = useState<BallotUnits | null>(null), [failed, setFailed] = useState(false);
  const [locations, setLocations] = useState<BallotLocations>();
  const [city, setCity] = useState(""), [ballot, setBallot] = useState(""), [sub, setSub] = useState("");
  const [trail, setTrail] = useState<Fields[]>([]);
  const [sort, setSort] = useState<LookupSort>("name");
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}flow-units.json`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("fetch"))).then(setUnits)
      .catch((e) => { if (e.name !== "AbortError") setFailed(true); });
    fetch(`${import.meta.env.BASE_URL}ballot-locations.json`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("fetch"))).then(setLocations)
      .catch((e) => { if (e.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, []);
  const filter = useMemo<BallotFilter>(() => ({ city: query(city), ballot: query(ballot), sub: query(sub) }), [city, ballot, sub]);
  const hasAll = [city, ballot, sub].includes(ALL.value);
  const level: LookupLevel | null = !hasAll ? null : sub === ALL.value || filter.sub ? "sub" : ballot === ALL.value || filter.ballot ? "ballot" : "city";
  const places = useMemo(() => units ? matchingPlaces(units, filter.city) : [], [units, filter.city]);
  const cities = useMemo(() => units ? matchingPlaces(units, filter.city, false)
    .sort((a, b) => a[1].name.localeCompare(b[1].name, "he")).map(([code, p]) => ({ id: code, value: p.name, label: p.name })) : [], [units, filter.city]);
  const ballots = useMemo(() => ballotOptions(places, filter.ballot, locations), [places, filter.ballot, locations]);
  const subs = useMemo(() => subBallotOptions(places, filter.ballot, filter.sub, locations), [places, filter.ballot, filter.sub, locations]);
  const scopes = useMemo(() => units && level ? sortLookupScopes(lookupScopes(units, filter, level, locations), sort) : [], [units, locations, filter, level, sort]);
  if (failed) return <p role="status">הנתונים לא נטענו.</p>;
  if (!units || !locations) return <p role="status" className="text-ink-soft">טוען…</p>;

  const here: Fields = { city, ballot, sub };
  /** כניסה ליחידה או לרשימה, ושמירת המקום הקודם לכפתור החזרה */
  const go = (next: Fields) => { setTrail((t) => [...t, here]); setCity(next.city); setBallot(next.ballot); setSub(next.sub); top.current?.scrollIntoView({ block: "start" }); };
  const back = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1)); setCity(prev.city); setBallot(prev.ballot); setSub(prev.sub);
  };
  const open = (scope: LookupScope) => go({ city: scope.city, ballot: scope.ballot, sub: scope.sub });
  const edit = (apply: () => void) => { setTrail([]); apply(); };
  const selectedLocations = (filter.sub ? ballotOptions(places, filter.ballot, locations, filter.sub) : ballots).filter((b) => b.number === filter.ballot);
  const nothing = !level && !city.trim() && !ballot.trim() && !sub.trim();
  const unit = !level && !nothing;
  const prev = trail[trail.length - 1];
  return <div className="space-y-4" ref={top}>
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] gap-3">
      <SearchField label="עיר / יישוב" value={city} options={[ALL, ...cities]} onChange={(v) => edit(() => { setCity(v); setBallot(""); setSub(""); })} />
      <SearchField label="מספר קלפי" value={ballot} numeric options={[ALL, ...ballots.map((b) => ({ id: b.id, value: b.number, label: `${b.number} · ${b.place} · ${b.location}` }))]}
        onChange={(v) => edit(() => { setBallot(v); setSub(""); })} onSelect={(o) => { if (o.id !== ALL.id) setCity(ballots.find((b) => b.id === o.id)!.place); }} />
      <SearchField label="תת קלפי" value={sub} numeric options={[ALL, ...subs.map((b) => ({ id: b.id, value: b.sub, label: `${b.fullNumber} · ${b.place} · ${b.location}` }))]}
        onChange={(v) => edit(() => setSub(v))} onSelect={(o) => { if (o.id !== ALL.id) { const b = subs.find((b) => b.id === o.id)!; setCity(b.place); setBallot(b.number); } }} />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {prev && <button type="button" onClick={back} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-theme border border-accent text-accent bg-paper-card text-sm font-bold"><Icon d={BACK} className="w-4 h-4" />{backLabel(prev)}</button>}
      {unit && filter.city && !filter.ballot && <button type="button" onClick={() => go({ city: filter.city, ballot: ALL.value, sub: "" })} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-theme bg-accent text-paper-card text-sm font-bold">רשימת הקלפיות בעיר<Icon d={CHEVRON} className="w-4 h-4" /></button>}
      {unit && filter.city && filter.ballot && !filter.sub && subs.length > 0 && <button type="button" onClick={() => go({ city: filter.city, ballot: filter.ballot, sub: ALL.value })} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-theme bg-accent text-paper-card text-sm font-bold">רשימת תתי הקלפי<Icon d={CHEVRON} className="w-4 h-4" /></button>}
    </div>
    <div role="status" className="text-sm text-ink-soft">
      {filter.city || "כל היישובים"}{ballot && ` · ${ballot === ALL.value ? "כל הקלפיות" : `קלפי ${ballot}`}`}{sub && ` · ${sub === ALL.value ? "כל תתי הקלפי" : `תת קלפי ${sub}`}`}
      {!level && selectedLocations.length === 1 && <span className="block">{selectedLocations[0].location}</span>}
    </div>
    {level && <div className="flex items-center gap-2"><Segmented className="flex-1" label="מיון התוצאות" value={sort} onChange={setSort} options={SORTS} /><InfoTip label="מקור נתוני המיון">מספר המצביעים ואחוז ההצבעה למיון לפי נתוני 2026.</InfoTip></div>}
    {!nothing && <div className="flex items-center gap-2"><span className="text-sm">נתוני ההשוואה</span><InfoTip label="הסבר נתוני ההשוואה">אחוז הצבעה: המצביעים מבעלי זכות הבחירה. מזכות בחירה: אחוז הקולות של המפלגה מבעלי זכות הבחירה ביחידה. מהכשרים: אחוז הקולות הכשרים, כמו בוועדת הבחירות. הפער: 2026 פחות 2022, בחץ למעלה או למטה; כשאין שינוי לא מוצג כלום. המפלגה המובילה מוצגת עם מנדטיה הארציים, ומפלגה שלא עברה — באחוז.</InfoTip></div>}
    {nothing && <p role="status" className="rounded-theme border border-dashed border-paper-line p-6 text-center text-ink-soft">בחרו עיר, קלפי או תת קלפי.<span className="block text-sm">הנתונים הארציים של כל מפלגה מופיעים למעלה, בכרטיסי המפלגות.</span></p>}
    {level && <ScopeList key={`${level}:${filter.city}:${filter.ballot}:${filter.sub}:${sort}`} units={units} scopes={scopes} onOpen={open} />}
    {unit && <BallotCards units={units} filter={filter} label={[filter.city, filter.ballot && `קלפי ${filter.ballot}`, filter.sub && `תת קלפי ${filter.sub}`].filter(Boolean).join(" · ")} />}
    <BackToTop target={top} />
  </div>;
}

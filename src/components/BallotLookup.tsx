import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Segmented } from "./Choice";
import BallotComparisonTable from "./BallotComparisonTable";
import { ballotOptions, lookupScopes, matchingPlaces, sortLookupScopes, subBallotOptions, type BallotFilter, type BallotLocations, type BallotUnits, type LookupLevel, type LookupScope, type LookupSort } from "../lib/ballotLookup";

interface Suggestion { id: string; value: string; label: string }

/** רשימה מלאה וגלילה, עם בחירה בעכבר, במגע ובמקלדת. */
function SearchField({ label, value, onChange, options, onSelect, disabled = false, numeric = false }: {
  label: string; value: string; onChange: (v: string) => void; options: Suggestion[];
  onSelect?: (o: Suggestion) => void; disabled?: boolean; numeric?: boolean;
}) {
  const id = useId(), list = `${id}-options`;
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const expanded = open && !disabled;
  const choose = (o: Suggestion) => { onChange(o.value); onSelect?.(o); setOpen(false); setActive(-1); };
  useEffect(() => { root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);
  return <div ref={root} className="relative min-w-0" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="block text-sm mb-1">{label}</label>
    <input id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={expanded ? list : undefined} aria-activedescendant={expanded && active >= 0 ? `${list}-${active}` : undefined}
      disabled={disabled} inputMode={numeric ? "numeric" : "text"} value={value}
      onFocus={(e) => { setOpen(true); setActive(-1); if (value === "הכל") e.currentTarget.select(); }} onClick={() => setOpen(true)}
      onChange={(e) => { onChange(e.target.value); setActive(-1); setOpen(true); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setOpen(false); setActive(-1); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); setOpen(true);
          setActive((a) => !options.length ? -1 : a < 0 ? e.key === "ArrowDown" ? 0 : options.length - 1 : (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if (e.key === "Enter" && expanded && options[active]) { e.preventDefault(); choose(options[active]); }
      }}
      className="w-full min-w-0 border border-paper-line rounded-theme bg-paper px-3 py-2 min-h-[44px] disabled:opacity-40" />
    {expanded && <ul id={list} role="listbox" aria-label={label} className="absolute z-20 top-full mt-1 w-full max-h-64 overflow-y-auto overscroll-contain rounded-theme border border-paper-line bg-paper-card shadow-lg">
      {options.map((o, i) => <li id={`${list}-${i}`} key={o.id} role="option" aria-selected={active === i}
        onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}
        className={`px-3 py-2 min-h-[44px] cursor-pointer text-sm break-words ${active === i ? "bg-accent-soft" : "hover:bg-accent-soft"}`}>{o.label}</li>)}
      {!options.length && <li role="presentation" className="p-3 text-sm text-ink-soft">אין התאמות</li>}
    </ul>}
  </div>;
}

const ALL: Suggestion = { id: "all", value: "הכל", label: "הכל" };
const query = (value: string) => value === ALL.value ? "" : value;
const SORTS: { id: LookupSort; label: string }[] = [
  { id: "name", label: "לפי א-ב" }, { id: "voters", label: "לפי מספר מצביעים" }, { id: "turnout", label: "לפי אחוז הצבעה" },
];

function ScopeComparison({ units, scope }: { units: BallotUnits; scope: LookupScope }) {
  const scopedUnits = useMemo(() => ({ ...units, places: { [scope.code]: units.places[scope.code] } }), [units, scope.code]);
  const filter = useMemo(() => ({ city: "", ballot: scope.ballot, sub: scope.sub }), [scope.ballot, scope.sub]);
  return <section className="space-y-2 border-t border-paper-line pt-4" aria-label={scope.label} data-scope={scope.id}>
    <h3 className="font-bold text-lg">{scope.label}</h3>
    {scope.location && <p className="text-sm text-ink-soft">{scope.location}</p>}
    <BallotComparisonTable units={scopedUnits} filter={filter} label={scope.label} />
  </section>;
}

/** כל הרשומות נגישות בגלילה רציפה; הטבלאות מתווספות בהדרגה כדי לא להקפיא רשימה ארצית. */
function ComparisonStream({ units, scopes }: { units: BallotUnits; scopes: LookupScope[] }) {
  const [visible, setVisible] = useState(6);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!end.current || visible >= scopes.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => Math.min(v + 6, scopes.length));
    }, { rootMargin: "800px" });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [visible, scopes.length]);
  if (!scopes.length) return <p role="status">לא נמצאו יחידות מתאימות.</p>;
  return <div className="space-y-6">
    {scopes.slice(0, visible).map((scope) => <ScopeComparison key={scope.id} units={units} scope={scope} />)}
    {visible < scopes.length && <div ref={end} role="status" className="py-4 text-sm text-ink-soft">טוען המשך…</div>}
  </div>;
}

export default function BallotLookup() {
  const [units, setUnits] = useState<BallotUnits | null>(null), [failed, setFailed] = useState(false);
  const [locations, setLocations] = useState<BallotLocations>();
  const [city, setCity] = useState(""), [ballot, setBallot] = useState(""), [sub, setSub] = useState("");
  const [sort, setSort] = useState<LookupSort>("name");
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
  const selectedLocations = (filter.sub ? ballotOptions(places, filter.ballot, locations, filter.sub) : ballots).filter((b) => b.number === filter.ballot);
  return <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] gap-3">
      <SearchField label="עיר / יישוב" value={city} options={[ALL, ...cities]} onChange={(v) => { setCity(v); setBallot(""); setSub(""); }} />
      <SearchField label="מספר קלפי" value={ballot} numeric options={[ALL, ...ballots.map((b) => ({ id: b.id, value: b.number, label: `${b.number} · ${b.place} · ${b.location}` }))]}
        onChange={(v) => { setBallot(v); setSub(""); }} onSelect={(o) => { if (o.id !== ALL.id) setCity(ballots.find((b) => b.id === o.id)!.place); }} />
      <SearchField label="תת קלפי" value={sub} numeric options={[ALL, ...subs.map((b) => ({ id: b.id, value: b.sub, label: `${b.fullNumber} · ${b.place} · ${b.location}` }))]}
        onChange={setSub} onSelect={(o) => { if (o.id !== ALL.id) { const b = subs.find((b) => b.id === o.id)!; setCity(b.place); setBallot(b.number); } }} />
    </div>
    <div role="status" className="text-sm text-ink-soft">
      {filter.city || "כל היישובים"}{ballot && ` · ${ballot === ALL.value ? "כל הקלפיות" : `קלפי ${ballot}`}`}{sub && ` · ${sub === ALL.value ? "כל תתי הקלפי" : `תת קלפי ${sub}`}`}
      {!level && selectedLocations.length === 1 && <span className="block">{selectedLocations[0].location}</span>}
    </div>
    {level && <div className="space-y-1"><Segmented label="מיון התוצאות" value={sort} onChange={setSort} options={SORTS} /><p className="text-xs text-ink-soft">מספר המצביעים ואחוז ההצבעה למיון לפי נתוני 2026.</p></div>}
    <p className="text-xs text-ink-soft">מצביעים: אחוז מבעלי זכות הבחירה. כשרים: אחוז מהמצביעים. מפלגות: אחוז מהקולות הכשרים. הפער: 2026 פחות 2022; נ״א = נקודות אחוז. קו מסמן שאין נתון להשוואה.</p>
    {level ? <ComparisonStream key={`${level}:${filter.city}:${filter.ballot}:${filter.sub}:${sort}`} units={units} scopes={scopes} /> : <BallotComparisonTable units={units} filter={filter} />}
  </div>;
}

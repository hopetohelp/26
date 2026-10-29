import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PartyAvatar } from "./PartyAvatar";
import { PARTY_IMAGES } from "../lib/partyImages";
import { num, pctValue } from "../lib/format";
import { ballotOptions, ballotPartyRows, ballotShare, ballotSummary, comparisonBallots, matchingPlaces, subOptions, type BallotLocations, type BallotUnits } from "../lib/ballotLookup";

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
      onFocus={() => { setOpen(true); setActive(-1); }}
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

const signed = (n: number, percent = false) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${percent ? pctValue(Math.abs(n)) : num(Math.abs(n))}`;
function Value({ votes, share, gap = false }: { votes: number | null; share?: number | null; gap?: boolean }) {
  if (votes === null) return <span aria-label="אין נתון להשוואה">—</span>;
  return <span className="block tabular-nums text-xs sm:text-sm leading-snug">
    <bdi dir="ltr" className="block">{gap ? signed(votes) : num(votes)}</bdi>
    {share !== undefined && <span className="block text-xs text-ink-soft"><bdi dir="ltr">{share === null ? "—" : `${gap ? signed(share, true) : pctValue(share)}${gap ? "" : "%"}`}</bdi>{gap && share !== null && <span className="ms-1">נ״א</span>}</span>}
  </span>;
}
const difference = (a: number | null, b: number | null) => a === null || b === null ? null : b - a;

export default function BallotLookup() {
  const [units, setUnits] = useState<BallotUnits | null>(null), [failed, setFailed] = useState(false);
  const [locations, setLocations] = useState<BallotLocations>();
  const [city, setCity] = useState(""), [ballot, setBallot] = useState(""), [sub, setSub] = useState("");
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
  const places = useMemo(() => units ? matchingPlaces(units, city) : [], [units, city]);
  const cities = useMemo(() => Object.entries(units?.places ?? {}).filter(([, p]) => p.name.includes(city.trim()))
    .sort((a, b) => a[1].name.localeCompare(b[1].name, "he")).map(([code, p]) => ({ id: code, value: p.name, label: p.name })), [units, city]);
  const ballots = useMemo(() => ballotOptions(places, ballot, locations), [places, ballot, locations]);
  const subs = useMemo(() => subOptions(places, ballot).filter((s) => s.startsWith(sub.trim())).map((s) => ({ id: s, value: s, label: `${ballot}.${s}` })), [places, ballot, sub]);
  const selected = useMemo(() => units ? comparisonBallots(units, { city, ballot, sub }) : null, [units, city, ballot, sub]);
  const rows = useMemo(() => units && selected ? ballotPartyRows(units, selected.y22, selected.y26) : [], [units, selected]);
  if (failed) return <p role="status">הנתונים לא נטענו.</p>;
  if (!units || !locations || !selected) return <p role="status" className="text-ink-soft">טוען…</p>;
  const old = ballotSummary(selected.y22, units.letters22), now = ballotSummary(selected.y26, units.letters26);
  const summary = [
    { label: "בעלי זכות בחירה", a: old.eligible, b: now.eligible, ap: undefined, bp: undefined },
    { label: "מצביעים", a: old.voters, b: now.voters, ap: old.turnout, bp: now.turnout },
    { label: "קולות כשרים", a: old.valid, b: now.valid, ap: old.validShare, bp: now.validShare },
  ];
  const selectedLocations = (sub.trim() ? ballotOptions(places, ballot, locations, sub) : ballots).filter((b) => b.number === ballot.trim());
  return <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] gap-3">
      <SearchField label="עיר / יישוב" value={city} options={cities} onChange={(v) => { setCity(v); setBallot(""); setSub(""); }} />
      <SearchField label="מספר קלפי" value={ballot} numeric options={ballots.map((b) => ({ id: b.id, value: b.number, label: `${b.number} · ${b.place} · ${b.location}` }))}
        onChange={(v) => { setBallot(v); setSub(""); }} onSelect={(o) => { const b = ballots.find((b) => b.id === o.id)!; setCity(b.place); }} />
      <SearchField label="תת קלפי" value={sub} numeric options={subs} disabled={!ballot.trim()} onChange={setSub} />
    </div>
    <div role="status" className="text-sm text-ink-soft">
      {city.trim() || "כל היישובים"}{ballot.trim() && ` · קלפי ${ballot}${sub.trim() ? `.${sub}` : ""}`}
      {selectedLocations.length === 1 && <span className="block">{selectedLocations[0].location}</span>}
    </div>
    {!old.present && !now.present ? <p role="status">לא נמצאו קלפיות מתאימות.</p> : <>
      <table className="w-full table-fixed text-sm text-center">
        <caption className="sr-only">השוואת קולות לפי מפלגה בסינון הנבחר, 2022 מול 2026. הפער הוא 2026 פחות 2022; נ״א = נקודות אחוז.</caption>
        <colgroup><col className="w-[34%] sm:w-[40%]" /><col /><col /><col /></colgroup>
        <thead><tr className="border-b border-paper-line align-top">
          <th scope="col" className="text-start py-2">מפלגה</th>
          <th scope="col" className="py-2">2022{selected.estimated && <span className="block mt-1 text-xs font-normal text-ink-soft">אומדן מותאם</span>}</th>
          <th scope="col" className="py-2">2026</th>
          <th scope="col" className="py-2"><span className="flex flex-wrap items-baseline justify-center gap-x-2"><span>הפער</span><span className="text-xs">{selected.status.label}</span></span>
            <span className="block mt-1 text-[10px] sm:text-xs font-normal text-ink-soft">({selected.status.reason})</span>
          </th>
        </tr></thead>
        <tbody>
          <tr className="bg-accent-soft font-bold border-b-2 border-paper-line align-top">
            <th scope="row" className="text-start py-3 pe-1">נתוני הצבעה<div className="mt-2 grid gap-3 text-xs font-normal">{summary.map((s) => <span key={s.label} className={s.ap !== undefined ? "min-h-[2.5rem]" : "min-h-[1.5rem]"}>{s.label}</span>)}</div></th>
            {["old", "now", "gap"].map((side) => <td key={side} className="py-3 align-top"><span aria-hidden="true" className="block h-5" /><div className="mt-2 grid gap-3">{summary.map((s) => <div key={s.label} className={s.ap !== undefined ? "min-h-[2.5rem]" : "min-h-[1.5rem]"}>
              <Value votes={side === "old" ? old.present ? s.a : null : side === "now" ? now.present ? s.b : null : old.present && now.present ? s.b - s.a : null}
                share={side === "old" ? s.ap : side === "now" ? s.bp : s.ap === undefined ? undefined : difference(s.ap, s.bp ?? null)} gap={side === "gap"} />
            </div>)}</div></td>)}
          </tr>
          {rows.map((r) => {
            const a = r.votes22 === null ? null : ballotShare(r.votes22, old.valid), b = r.votes26 === null ? null : ballotShare(r.votes26, now.valid);
            return <tr key={r.id} className="border-b border-paper-line">
              <th scope="row" className="py-3 pe-2 text-start font-normal"><span className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 break-words">
                {PARTY_IMAGES[r.image] ? <PartyAvatar id={r.image} size={32} /> : <span aria-hidden="true" className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full bg-paper-line text-xs font-bold">{r.letters === "other" ? "…" : r.letters}</span>}
                <span>{r.name}{r.previousName && r.previousName !== r.name && <span className="block text-xs text-ink-soft">2022: {r.previousName}</span>}</span>
              </span></th>
              <td><Value votes={r.votes22} share={a} /></td><td><Value votes={r.votes26} share={b} /></td>
              <td><Value votes={difference(r.votes22, r.votes26)} share={difference(a, b)} gap /></td>
            </tr>;
          })}
        </tbody>
      </table>
      <p className="text-xs text-ink-soft">מצביעים: אחוז מבעלי זכות הבחירה. כשרים: אחוז מהמצביעים. מפלגות: אחוז מהקולות הכשרים. הפער: 2026 פחות 2022; נ״א = נקודות אחוז. קו מסמן שאין נתון להשוואה.</p>
    </>}
  </div>;
}

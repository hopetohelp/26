import { useEffect, useMemo, useState } from "react";
import { Segmented } from "./Choice";
import { flow, newName, oldName, type Tier } from "../lib/voterFlow";
import { num, pctValue } from "../lib/format";

/** public/flow-units.json (pipeline/voter_flow.py): לכל יישוב — קלפיות 2022 ו-2026: [מספר, ריכוז, בעלי זכות, מצביעים, ...קולות] */
type Ballot = [string, string, number, number, ...number[]];
interface Units { letters22: string[]; letters26: string[]; places: Record<string, { name: string; y22: Ballot[]; y26: Ballot[] }> }

const LEVELS: { id: Tier; label: string }[] = [
  { id: "sub", label: "תת קלפי" },
  { id: "ballot", label: "קלפי" },
  { id: "center", label: "מיקום" },
  { id: "city", label: "יישוב" },
];

function pick(rows: Ballot[], level: Tier, number: string, center: string | null) {
  if (level === "city") return rows;
  if (level === "center") return center ? rows.filter((r) => r[1] === center) : [];
  const n = Number(number);
  return rows.filter((r) => (level === "sub" ? Number(r[0]) === n : Math.trunc(Number(r[0])) === Math.trunc(n)));
}

function Side({ title, rows, letters, name }: { title: string; rows: Ballot[]; letters: string[]; name: (l: string) => string }) {
  if (!rows.length) return <div><h3 className="font-bold">{title}</h3><p className="text-sm text-ink-soft">אין קלפי מתאימה.</p></div>;
  const sum = (k: number) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const votes = letters.map((l, k) => ({ l, v: sum(4 + k) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const valid = votes.reduce((a, x) => a + x.v, 0) || 1;
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <p className="text-xs text-ink-soft mb-2">קלפיות: {rows.map((r) => r[0]).join(", ")} · בעלי זכות: {num(sum(2))} · הצביעו: {num(sum(3))}</p>
      <table className="w-full text-sm"><tbody>
        {votes.map((x) => <tr key={x.l} className="border-t border-paper-line"><th scope="row" className="text-start font-normal py-1">{name(x.l)}</th><td className="tabular-nums text-end">{num(x.v)}</td><td className="tabular-nums text-end w-14">{pctValue((x.v / valid) * 100)}%</td></tr>)}
      </tbody></table>
    </div>
  );
}

/** בדיקה לפי תת קלפי / קלפי / מיקום / יישוב: התוצאות של אותה יחידה בשתי השנים */
export default function BallotLookup() {
  const [units, setUnits] = useState<Units | null>(null);
  const [failed, setFailed] = useState(false);
  const [level, setLevel] = useState<Tier>("ballot");
  const [place, setPlace] = useState("");
  const [number, setNumber] = useState("");
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}flow-units.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setUnits).catch(() => setFailed(true));
  }, []);
  const byName = useMemo(() => new Map(Object.values(units?.places ?? {}).map((p) => [p.name, p])), [units]);
  if (failed) return <p role="status">הנתונים לא נטענו.</p>;
  if (!units) return <p role="status" className="text-ink-soft">טוען…</p>;
  const p = byName.get(place.trim());
  // מיקום: מרכז הקלפיות של הקלפי שהוזנה (לפי 2026, ואם אין — לפי 2022)
  const ref = p && [...p.y26, ...p.y22].find((r) => Math.trunc(Number(r[0])) === Math.trunc(Number(number)) && (level !== "sub" || Number(r[0]) === Number(number)));
  const center = ref ? ref[1] : null;
  const needsNumber = level !== "city";
  const new26 = (l: string) => newName(flow.letters26[l] ?? l);
  return (
    <div className="space-y-3">
      <Segmented label="רמת הבדיקה" value={level} onChange={setLevel} options={LEVELS} />
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col text-sm">יישוב
          <input list="flow-places" value={place} onChange={(e) => setPlace(e.target.value)} className="border border-paper-line rounded-theme bg-paper px-2 py-1 min-h-[44px] w-56" />
        </label>
        <datalist id="flow-places">{[...byName.keys()].sort().map((n) => <option key={n} value={n} />)}</datalist>
        {needsNumber && (
          <label className="flex flex-col text-sm">מספר קלפי
            <input inputMode="decimal" value={number} onChange={(e) => setNumber(e.target.value)} className="border border-paper-line rounded-theme bg-paper px-2 py-1 min-h-[44px] w-28" />
          </label>
        )}
      </div>
      {p && (!needsNumber || number) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Side title="2022" rows={pick(p.y22, level, number, center)} letters={units.letters22} name={oldName} />
          <Side title="2026" rows={pick(p.y26, level, number, center)} letters={units.letters26} name={new26} />
        </div>
      )}
    </div>
  );
}

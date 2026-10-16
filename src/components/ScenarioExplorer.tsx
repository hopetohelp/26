import { useState } from "react";
import { Link } from "react-router-dom";
import { HOME } from "../lib/homeData";
import type { HomeRow } from "../lib/home";
import { pctValue, rng, seatsFmt } from "../lib/format";

// The existing model output supplies both quantiles and histogram counts.
// No distribution is reconstructed from a range or from a published poll.
const rows = [...HOME.safe, ...HOME.edge, ...HOME.below].sort((a, b) => b.central - a.central);
const max = Math.max(1, ...rows.map(r => Math.max(r.hi, r.central)));
function Interval({ row }: { row: HomeRow }) {
  const x = (n: number) => 12 + n / max * 276;
  return <svg viewBox="0 0 300 36" role="img" aria-label={`טווח 80%: ${rng(row.lo, row.hi)}; ממוצע המודל כיום: ${row.central}`}>
    <line x1={x(row.lo)} x2={x(row.hi)} y1="18" y2="18" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <circle cx={x(row.central)} cy="18" r="6" fill="rgb(var(--card))" stroke="rgb(var(--ink))" strokeWidth="2" />
  </svg>;
}
function Distribution({ row }: { row: HomeRow }) {
  const bins = row.hist.map((count, n) => ({ count, n })).filter(b => b.n >= row.lo && b.n <= row.hi);
  const peak = Math.max(1, ...bins.map(b => b.count));
  const lo = Math.min(row.lo, row.central), hi = Math.max(row.hi, row.central);
  const x = (n: number) => 24 + (n - lo) / Math.max(1, hi - lo) * 312;
  const width = Math.min(18, 260 / Math.max(1, hi - lo + 1));
  if (!row.hist.length) return <p>אין התפלגות זמינה לרשימה זו.</p>;
  return <svg viewBox="0 0 360 205" role="img" aria-label={`${row.name}: שכיחות המנדטים בטווח המרכזי ${rng(row.lo, row.hi)}, 80% מהתרחישים`}>
    {bins.map(({ n, count }, i) => <g key={n}><rect x={x(n) - width / 2} y={170 - count / peak * 130} width={width} height={count / peak * 130} fill="rgb(var(--band-soft))" />{(i % Math.max(1, Math.ceil(bins.length / 12)) === 0 || i === bins.length - 1) && <text x={x(n)} y="192" textAnchor="middle" fill="currentColor" fontSize="11">{n}</text>}</g>)}
    <line x1={x(row.central)} x2={x(row.central)} y1="18" y2="170" stroke="currentColor" strokeDasharray="3 4" />
    <circle cx={x(row.central)} cy="18" r="5" fill="rgb(var(--band))" stroke="currentColor" strokeWidth="2" />
  </svg>;
}
export default function ScenarioExplorer() {
  const [selected, setSelected] = useState(rows[0]?.id ?? "");
  const [edgeOnly, setEdgeOnly] = useState(false);
  const row = rows.find(r => r.id === selected);
  if (!row) return null;
  const visible = edgeOnly ? rows.filter(r => HOME.scenarioEdge.some(e => e.id === r.id)) : rows;
  return <div className="c-scenario-grid">
    <section aria-label="השוואת טווחי התרחישים">
      <div className="c-scenario-tools"><h3 className="font-display text-xl">כל הרשימות במבט אחד</h3><label><input type="checkbox" checked={edgeOnly} onChange={e => setEdgeOnly(e.target.checked)} /> סביב אחוז החסימה</label></div>
      <p className="text-xs text-ink-soft my-3">פס: 80% מרכזיים (אחוזונים 10–90) · עיגול: ממוצע המודל כיום. לחצו על רשימה להעמקה.</p>
      {visible.map(r => <button type="button" className="c-scenario-row" key={r.id} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}><span>{r.name}<b>{seatsFmt(r.central)}</b></span><Interval row={r} /><bdi>{rng(r.lo, r.hi)}</bdi></button>)}
      <p className="text-xs text-ink-soft mt-3">10% מכל קצה אינם מוצגים. בערכים בדידים הטווח עשוי להכיל יותר מ־80%. תוצאה בפועל יכולה להיות מחוץ לטווח.</p>
    </section>
    <aside className="c-scenario-detail" aria-label="פירוט הרשימה הנבחרת">
      <div className="c-distribution">
        <label htmlFor="scenario-list">מבט מקרוב</label>
        <select id="scenario-list" value={selected} onChange={e => setSelected(e.target.value)}>{rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <p className="my-5"><strong className="font-num text-5xl">{seatsFmt(row.central)}</strong><span className="text-sm ms-3">מנדטים · ממוצע המודל כיום</span></p>
        <Distribution row={row} />
        <p className="text-xs mt-3">גובה העמודות: מספר התרחישים. מוצג רק טווח 80% המרכזיים. העיגול מסמן את ממוצע המודל כיום.</p>
      </div>
      <dl className="c-scenario-facts"><div><dt>80% מהתרחישים</dt><dd><bdi>{rng(row.lo, row.hi)}</bdi></dd></div><div><dt>עוברת את הסף בתרחישים</dt><dd>{pctValue(row.pass * 100)}%</dd></div></dl>
      <Link to="/method#model" className="c-chart-link">איך חושבו התרחישים? ←</Link>
    </aside>
  </div>;
}

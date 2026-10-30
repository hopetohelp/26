import { useEffect, useMemo, useRef, useState } from "react";
import { flow, newName as listNew, oldName as listOld } from "../lib/voterFlow";
import { num } from "../lib/format";

/** רשימה מתחת לחלק הזה מהקולות מצטרפת לצומת "רשימות אחרות", כדי שהגרף יישאר קריא */
const SMALL = 0.02;
const OTHER = "other";

interface Node { id: string; name: string; v: number; y: number; h: number }

/** בפירוט מתחת לגרף — תמיד, כשיש להן קולות, גם מתחת ל-3% (הכרעת בעלים 30.10.2026) */
const ALWAYS = new Set(["reservists", "amcha", "noam", "code_black", "haredi_public"]);

/** מקבצים את הרשימות הקטנות לצומת אחד; "לא הצביעו" תמיד בסוף ומוצג (הכרעת בעלים 30.10.2026).
 * order — סדר הצמתים (מזהי הקבוצות), "רשימות אחרות" ו"לא הצביעו" אחריהם */
function groups(ids: string[], totals: number[], order: (keys: string[]) => string[]) {
  const all = totals.reduce((a, b) => a + b, 0);
  const key = ids.map((id, i) => (id === "abstain" || totals[i] >= SMALL * all ? id : OTHER));
  const keys = [...order([...new Set(key.filter((k) => k !== OTHER && k !== "abstain"))]), ...(key.includes(OTHER) ? [OTHER] : []), ...(key.includes("abstain") ? ["abstain"] : [])];
  return { keys, of: key.map((k) => keys.indexOf(k)) };
}

type Sel = { kind: "node"; side: "a" | "b"; i: number } | { kind: "link"; i: number; j: number };

/** גרף זרימה: 2022 מימין, 2026 משמאל; רוחב כל פס = הקולות שעברו (flowsTo — כל קול של 2022 לפי יעדו) */
export interface FlowSankeyProps {
  /** flowsTo: שורה לכל מקור ב-2022, עמודה לכל יעד ב-2026 */
  T?: number[][]; oldIds?: string[]; newIds?: string[];
  oldName?: (id: string) => string; newName?: (id: string) => string;
}

export default function FlowSankey({ T = flow.national.flowsTo, oldIds = flow.old, newIds = flow.new, oldName = listOld, newName = listNew }: FlowSankeyProps) {
  const m = useMemo(() => {
    const rowT = T.map((r) => r.reduce((a, b) => a + b, 0));
    const colT = newIds.map((_, j) => T.reduce((s, r) => s + r[j], 0));
    // הסדר: 2026 מהגדולה לקטנה (הכרעת בעלים 30.10.2026); כל רשימה של 2022 — ליד היעד העיקרי שלה ב-2026
    const colOf = (id: string) => colT[newIds.indexOf(id)];
    const B = groups(newIds, colT, (keys) => [...keys].sort((x, y) => colOf(y) - colOf(x)));
    const rank = (i: number) => {
      const row = T[i].map((v, j) => (newIds[j] === "abstain" ? -1 : v));
      const top = B.of[row.indexOf(Math.max(...row))];
      return top < 0 ? B.keys.length : top;
    };
    const A = groups(oldIds, rowT, (keys) => [...keys].sort((x, y) => {
      const ix = oldIds.indexOf(x), iy = oldIds.indexOf(y);
      return rank(ix) - rank(iy) || rowT[iy] - rowT[ix];
    }));
    const M = A.keys.map(() => B.keys.map(() => 0));
    T.forEach((r, i) => r.forEach((v, j) => { M[A.of[i]][B.of[j]] += v; }));
    return { M, a: A.keys, b: B.keys, aOf: A.of, bOf: B.of };
  }, [T, oldIds, newIds]);
  const [sel, setSel] = useState<Sel>({ kind: "node", side: "a", i: 0 });
  // רוחב אמיתי, כדי שהשמות יישארו בגודל קריא גם בטלפון
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(340, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [T, oldIds, newIds]);

  const nw = 10, gap = 5, lab = W < 520 ? 120 : 150, top = 26;
  const H = Math.max(m.a.length, m.b.length) * 36;
  const rowT = m.M.map((r) => r.reduce((x, y) => x + y, 0));
  const colT = m.b.map((_, j) => m.M.reduce((s, r) => s + r[j], 0));
  const all = rowT.reduce((x, y) => x + y, 0);
  const place = (ids: string[], tot: number[], name: (id: string) => string): Node[] => {
    const k = (H - gap * (ids.length - 1)) / all;
    let y = top;
    return ids.map((id, i) => { const n = { id, name: id === OTHER ? "רשימות אחרות" : name(id), v: tot[i], y, h: tot[i] * k }; y += n.h + gap; return n; });
  };
  const A = place(m.a, rowT, oldName), B = place(m.b, colT, newName);
  const xA = W - lab - nw, xB = lab, mid = (xA + xB + nw) / 2;
  const offA = A.map((n) => n.y), offB = B.map((n) => n.y);
  const links: { i: number; j: number; v: number; d: string }[] = [];
  m.M.forEach((r, i) => r.forEach((v, j) => {
    const ta = (v / rowT[i]) * A[i].h, tb = (v / colT[j]) * B[j].h;
    const y1 = offA[i], y2 = offB[j];
    offA[i] += ta; offB[j] += tb;
    if (v / all < 0.0005) return;
    const x1 = xA, x2 = xB + nw;
    links.push({ i, j, v, d: `M${x1},${y1}C${mid},${y1} ${mid},${y2} ${x2},${y2}L${x2},${y2 + tb}C${mid},${y2 + tb} ${mid},${y1 + ta} ${x1},${y1 + ta}Z` });
  }));
  const hit = (l: { i: number; j: number }) => (sel.kind === "link" ? l.i === sel.i && l.j === sel.j : sel.side === "a" ? l.i === sel.i : l.j === sel.i);
  // הפירוט — מהמטריצה המלאה, לפני קיבוץ הרשימות הקטנות
  const parts = (() => {
    if (sel.kind !== "node") return [];
    const members = (sel.side === "a" ? m.aOf : m.bOf).map((g, k) => (g === sel.i ? k : -1)).filter((k) => k >= 0);
    const vals = sel.side === "a" ? newIds.map((_, j) => members.reduce((s, i) => s + T[i][j], 0)) : oldIds.map((_, i) => members.reduce((s, j) => s + T[i][j], 0));
    const ids = sel.side === "a" ? newIds : oldIds, name = sel.side === "a" ? newName : oldName;
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    return ids.map((id, k) => ({ id, name: name(id), s: vals[k] / total }))
      .filter((p) => p.s >= 0.03 || (ALWAYS.has(p.id) && p.s >= 0.0005)).sort((x, y) => y.s - x.s);
  })();
  const pct = (s: number) => (s >= 0.01 ? `${Math.round(100 * s)}%` : `${(100 * s).toFixed(1)}%`);
  const node = (n: Node, side: "a" | "b", i: number) => {
    const on = sel.kind === "node" && sel.side === side && sel.i === i;
    const pick = () => setSel({ kind: "node", side, i });
    return (
      <g key={`${side}${n.id}`}>
        <rect x={side === "a" ? xA : xB} y={n.y} width={nw} height={Math.max(n.h, 1)} rx={2} tabIndex={0} role="button" aria-pressed={on}
          aria-label={`${n.name} ${side === "a" ? 2022 : 2026}: ${num(n.v)} קולות`}
          className={`cursor-pointer outline-none focus-visible:stroke-signal ${on ? "fill-signal" : n.id === "abstain" ? "fill-ink-soft" : "fill-ink"}`}
          onClick={pick} onMouseEnter={pick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }} />
        <text x={side === "a" ? xA + nw + 6 : xB - 6} y={n.y + n.h / 2} dominantBaseline="middle" direction="rtl" textAnchor={side === "a" ? "end" : "start"}
          className={`cursor-pointer ${W < 520 ? "text-[11px]" : "text-[13px]"} ${on ? "fill-ink font-bold" : "fill-ink"}`} onClick={pick}>{n.name}</text>
      </g>
    );
  };
  return (
    <figure className="mt-3">
      <div ref={box} className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H + top + 8}`} width={W} height={H + top + 8} className="block" style={{ direction: "ltr" }} role="img" aria-label="גרף מעבר המצביעים בין 2022 ל-2026">
          <text x={W - 4} y={14} textAnchor="end" className="fill-ink-soft text-[13px] font-bold">2022</text>
          <text x={4} y={14} textAnchor="start" className="fill-ink-soft text-[13px] font-bold">2026</text>
          {links.map((l) => (
            <path key={`${l.i}-${l.j}`} d={l.d} onClick={() => setSel({ kind: "link", i: l.i, j: l.j })}
              className={`cursor-pointer transition-[fill] motion-reduce:transition-none ${hit(l) ? "fill-signal/55" : "fill-ink/[.06]"}`}>
              <title>{`${A[l.i].name} ← ${B[l.j].name}: ${num(l.v)} קולות`}</title>
            </path>
          ))}
          {A.map((n, i) => node(n, "a", i))}
          {B.map((n, j) => node(n, "b", j))}
        </svg>
      </div>
      <figcaption className="mt-2 text-sm text-ink-soft min-h-[3em]" aria-live="polite">
        {sel.kind === "link" ? (() => {
          // לחיצה על פס — רק המעבר הזה (הכרעת בעלים 30.10.2026)
          const v = m.M[sel.i][sel.j];
          return <><b className="text-ink">{`${A[sel.i].name} 2022 ← ${B[sel.j].name} 2026: ${num(v)} קולות`}</b><br />
            {`${pct(v / rowT[sel.i])} ממצביעי ${A[sel.i].name} ב-2022 · ${pct(v / colT[sel.j])} מקולות ${B[sel.j].name} ב-2026`}</>;
        })() : <>
          <b className="text-ink">{sel.side === "a" ? `מתוך כל 100 מצביעי ${A[sel.i].name} ב-2022:` : `מאיפה הגיעו קולות ${B[sel.i].name} ב-2026:`}</b>{" "}
          {parts.map((p) => `${p.name} ${pct(p.s)}`).join(" · ")}
        </>}
      </figcaption>
    </figure>
  );
}

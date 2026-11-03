import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * כרטיס אחיד לכל סקר וניחוש ברשימה (הכרעת בעלים 03.11.2026):
 * שורה 1 — מספר, סוג וכותרת; שורה 2 — "נסגר ב…" / "ייסגר ב…"; בצד שמאל תגית; מתחת — גרף התשובות.
 */
export type CardTag = "join" | "update" | "joined" | null;
export function SurveyCard({ to, title, when, tag, children }: { to: string; title: string; when?: string | null; tag: CardTag; children?: ReactNode }) {
  return (
    <li className="f-card !p-0">
      <Link to={to} className="block px-4 py-3.5 no-underline text-ink">
        <span className="flex items-center gap-3">
          <span className="flex-1 min-w-0">
            <span className="block font-bold">{title}</span>
            {when && <span className="block text-[12.5px] text-ink-soft">{when}</span>}
          </span>
          {tag === "join" && <span className="f-btn sm shrink-0">להשתתף</span>}
          {tag === "update" && <span className="f-btn sm shrink-0">לעדכן</span>}
          {tag === "joined" && <span className="shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent-soft text-signal">השתתפת</span>}
        </span>
        {children}
      </Link>
    </li>
  );
}

let canvas: HTMLCanvasElement | null = null;
const textWidth = (t: string) => {
  canvas ??= document.createElement("canvas");
  const c = canvas.getContext("2d");
  if (!c) return t.length * 7;
  c.font = `700 11px ${getComputedStyle(document.body).fontFamily}`;
  return c.measureText(t).width;
};
const PAD = 12; // px-1.5 משני הצדדים

/** פס התשובות: מהגדולה לקטנה; בכל חלק — האחוז אם יש מקום, והשם לפניו אם יש עוד מקום */
/** pctOf — כשהאחוז נמדד מול מספר אחר (למשל משתתפים) ולא מול סכום החלקים */
export function ShareBar({ parts, pctOf }: { parts: { id: string; label: string; n: number }[]; pctOf?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return null;
  const rows = parts.filter((p) => p.n > 0).sort((a, b) => b.n - a.n).map((p) => ({ ...p, pct: Math.round((p.n / (pctOf || total)) * 100) }));
  return (
    <div ref={ref} className="flex h-5 rounded-md overflow-hidden text-[11px] font-bold" role="img" aria-label={rows.map((p) => `${p.label} ${p.pct}%`).join(", ")}>
      {rows.map((p, i) => {
        const room = (p.n / total) * w - PAD;
        const pct = `${p.pct}%`, full = `${p.label} ${pct}`;
        const text = w && room >= textWidth(full) ? full : w && room >= textWidth(pct) ? pct : "";
        return <span key={p.id} className={`${i % 2 ? "bg-[rgb(var(--bloc-5))] text-paper" : "bg-signal text-signal-ink"} flex items-center justify-center px-1.5 whitespace-nowrap overflow-hidden`} style={{ width: `${(p.n / total) * 100}%` }}>{text}</span>;
      })}
    </div>
  );
}

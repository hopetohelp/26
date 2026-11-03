import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

/** צבעים מתחלפים בפס (הכרעת בעלים 03.11.2026): בלי חזרה צמודה על אותו צבע; ניטרליים, לא צבעי מפלגות */
const BAR_COLORS = ["bg-signal text-signal-ink", "bg-[rgb(var(--bloc-2))] text-paper", "bg-[rgb(var(--bloc-4))] text-paper", "bg-[rgb(var(--bloc-3))] text-paper", "bg-[rgb(var(--bloc-5))] text-paper"];
const PAD = 12; // px-1.5 משני הצדדים

/**
 * חלק אחד בפס (הכרעות בעלים 03.11.2026): מנסים לפי הסדר — שם ואחוז; ברשימה: אות הפתק ואחוז, ואז רק האות; אחרת רק האחוז; ואם אין מקום — כלום.
 * המדידה היא על הטקסט האמיתי במסך (גלישה מהחלק ⇐ הצעה הבאה), כך שהכיתוב לא עולה על החלק שלידו.
 */
function Segment({ texts, width, className }: { texts: string[]; width: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [level, setLevel] = useState(0);
  useLayoutEffect(() => { setLevel(0); }, [width, texts.join("|")]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && level < texts.length && el.scrollWidth > el.clientWidth + 0.5) setLevel(level + 1);
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLevel(0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <span ref={ref} className={className} style={{ width, paddingInline: PAD / 2 }}>{texts[level] ?? ""}</span>;
}

/** פס התשובות: מהגדולה לקטנה. short — אות הפתק לרשימה */
export function ShareBar({ parts, pctOf }: { parts: { id: string; label: string; n: number; short?: string }[]; pctOf?: number }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return null;
  const rows = parts.filter((p) => p.n > 0).sort((a, b) => b.n - a.n).map((p) => ({ ...p, pct: Math.round((p.n / (pctOf || total)) * 100) }));
  return (
    <div className="flex h-5 rounded-md overflow-hidden text-[11px] font-bold" role="img" aria-label={rows.map((p) => `${p.label} ${p.pct}%`).join(", ")}>
      {rows.map((p, i) => {
        const pct = `${p.pct}%`;
        const texts = p.short ? [`${p.label} ${pct}`, `${p.short} ${pct}`, p.short] : [`${p.label} ${pct}`, pct];
        return <Segment key={p.id} texts={texts} width={`${(p.n / total) * 100}%`} className={`${BAR_COLORS[i % BAR_COLORS.length]} flex items-center justify-center whitespace-nowrap overflow-hidden min-w-0 shrink-0`} />;
      })}
    </div>
  );
}

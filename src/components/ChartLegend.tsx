import { useId, useState, type ReactNode } from "react";
import { Swatch, type MarkKind } from "./marks";

/**
 * כפתור "מקרא" ליד כל גרף (הכרעת בעלים 9.10.2026): סגור כברירת מחדל, ובלחיצה נפתח הסבר על כל הסימונים בגרף.
 * רשימת הסימונים קבועה לכל גרף (`entries`), ואם נר שעוביו משתנה מופיע בגרף — `thickness` מסביר על מה העובי (שלוש הרמות כתובות כאן, פעם אחת).
 * הצבעים והצורות מגיעים מאותם רכיבים של הגרפים (`Swatch`), כך שהמקרא לא יכול להיות שונה ממה שמצויר.
 */
export type LegendKind = MarkKind | "line" | "lineList" | "dash" | "pass" | "seatGov" | "seatMiss" | "seatOther";

export interface LegendEntry {
  kind: LegendKind;
  text: ReactNode;
}

const MARKS: readonly LegendKind[] = ["candle", "mean", "result", "dot"];

function LegendSwatch({ kind }: { kind: LegendKind }) {
  if ((MARKS as readonly string[]).includes(kind)) return <Swatch kind={kind as MarkKind} />;
  switch (kind) {
    case "line":
      return <i aria-hidden="true" className="mk-sw h-[3px] w-6 rounded-full bg-accent" />;
    case "lineList":
      return <i aria-hidden="true" className="mk-sw h-[3px] w-6 rounded-full bg-ink-soft" />;
    case "dash":
      return <i aria-hidden="true" className="mk-sw w-6 border-t-2 border-dashed border-ink" />;
    case "pass":
      return (
        <span aria-hidden="true" dir="ltr" className="inline-flex align-middle h-[.7rem] w-12 rounded-full overflow-hidden shadow-[inset_0_0_0_1.5px_rgb(var(--ink-faint)/.6)]">
          <i className="bg-neg w-1/3" />
          <i className="bg-pos w-2/3" />
        </span>
      );
    case "seatGov":
      return <i aria-hidden="true" className="mk-sw size-[.9rem] rounded-full sw-a" />;
    case "seatMiss":
      return <i aria-hidden="true" className="mk-sw size-[.9rem] rounded-full sw-miss" />;
    default:
      return <i aria-hidden="true" className="mk-sw size-[.9rem] rounded-full sw-b" />;
  }
}

/** שלוש רמות עובי הנר, כל אחת בעובי האמיתי שלה (3, 10 ו-18 פיקסלים) */
const LEVELS = [
  { cls: "mk-c1", text: "דק: פחות משליש מהקטע העמוס ביותר" },
  { cls: "mk-c3", text: "בינוני: משליש עד שני שלישים" },
  { cls: "mk-c5", text: "עבה: שני שלישים ומעלה" },
] as const;

/** תוכן המקרא הפתוח: הסימונים, ואם יש נר שעוביו משתנה — שלוש הרמות */
export function LegendPanel({ id, entries, thickness, children }: { id?: string; entries: LegendEntry[]; thickness?: string; children?: ReactNode }) {
  return (
    <div id={id} className="mt-2 rounded-theme border border-paper-line bg-paper-card p-3 text-sm text-ink-soft">
      <ul className="grid gap-y-2">
        {entries.map((e, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <span className="w-12 shrink-0 flex justify-center">
              <LegendSwatch kind={e.kind} />
            </span>
            <span className="min-w-0">{e.text}</span>
          </li>
        ))}
      </ul>
      {thickness && (
        <div className="mt-3 pt-3 border-t border-paper-line">
          <p>עובי הנר בכל קטע: {thickness}</p>
          <ul className="mt-2 grid gap-y-1.5">
            {LEVELS.map((l) => (
              <li key={l.cls} className="flex items-center gap-2.5">
                <span className="w-12 shrink-0 flex justify-center">
                  <i aria-hidden="true" className={`mk-sw mk-candle ${l.cls}`} style={{ width: "2.2rem" }} />
                </span>
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">העובי הוא ביחס לקטע העמוס ביותר באותו נר, והמעבר בין הרמות חלק.</p>
        </div>
      )}
      {children && <div className="mt-3 pt-3 border-t border-paper-line">{children}</div>}
    </div>
  );
}

export default function ChartLegend({
  entries,
  thickness,
  children,
  action,
  className = "",
}: {
  entries: LegendEntry[];
  thickness?: string;
  children?: ReactNode;
  /** פקד של הגרף באותה שורה עם הכפתור, בקצה השני (למשל מתג קו/נרות) */
  action?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`my-1 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 min-h-[34px] px-3.5 rounded-full bg-paper-card text-sm font-semibold text-ink ring-[1.5px] ring-inset ring-ink/[.35]"
        >
          מקרא
          <svg aria-hidden="true" viewBox="0 0 12 12" width="10" height="10" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4.5l4 4 4-4" />
          </svg>
        </button>
        {action}
      </div>
      {open && (
        <LegendPanel id={id} entries={entries} thickness={thickness}>
          {children}
        </LegendPanel>
      )}
    </div>
  );
}

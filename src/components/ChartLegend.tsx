import { useId, useState, type ReactNode } from "react";
import { Swatch, type MarkKind } from "./marks";

/**
 * כפתור "מקרא" ליד כל גרף (הכרעת בעלים 9.10.2026): סגור כברירת מחדל, ובלחיצה נפתח הסבר על כל הסימונים בגרף.
 * רשימת הסימונים קבועה לכל גרף (`entries`). נר שעוביו משתנה מוסבר בשורה אחת בלבד (`rangeLine`), בלי פירוט הרמות (הכרעת בעלים 9.10.2026).
 * הצבעים והצורות מגיעים מאותם רכיבים של הגרפים (`Swatch`), כך שהמקרא לא יכול להיות שונה ממה שמצויר.
 */
export type LegendKind = MarkKind | "line" | "lineList" | "dash" | "pass" | "seatGov" | "seatMiss" | "seatOther";

export interface LegendEntry {
  kind: LegendKind;
  text: ReactNode;
}

/**
 * שורת המקרא של נר: איזה טווח, ועל מה העובי. אחת בלבד, בכל הגרפים (הכרעת בעלים 9.10.2026):
 * "טווח מלא - עובי הקו מראה את כמות הנתונים או הסקרים שנמצאים בטווח הזה". טווח של תרחישים הוא 80% (כלל הטווחים לפי מקור הנתון).
 * `what` = מה נספר, עם ה' הידיעה ("הסקרים", "התרחישים"). `window` = חלון הזמן, כשיש ("ב-14 הימים האחרונים").
 */
export const rangeLine = (range: "full" | "p80", what: string, window = "") =>
  `${range === "p80" ? "טווח 80%" : "טווח מלא"}${window ? ` ${window}` : ""} - עובי הקו מראה את כמות ${what} שנמצאים בטווח הזה`;

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

/** תוכן המקרא הפתוח: הסימונים */
export function LegendPanel({ id, entries, children }: { id?: string; entries: LegendEntry[]; children?: ReactNode }) {
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
      {children && <div className="mt-3 pt-3 border-t border-paper-line">{children}</div>}
    </div>
  );
}

export default function ChartLegend({
  entries,
  children,
  action,
  className = "",
}: {
  entries: LegendEntry[];
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
        <LegendPanel id={id} entries={entries}>
          {children}
        </LegendPanel>
      )}
    </div>
  );
}

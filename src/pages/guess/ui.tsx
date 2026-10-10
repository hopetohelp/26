/** רכיבים קטנים שחוזרים בכל יחידות "שלי" */
import type { ReactNode } from "react";
import { STATUS_LABEL } from "./useCrowd";

/** queued = נשמר בדפדפן ויישלח לשרת אוטומטית כשהחיבור יחזור (src/lib/outbox.ts) */
export function StatusPill({ status, queued = false }: { status: keyof typeof STATUS_LABEL; queued?: boolean }) {
  const tone = status === "saved" ? "border-ink-faint text-ink" : status === "dirty" ? "bg-warn-soft text-warn border-warn/40" : "text-ink-soft border-paper-line";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold border rounded-full px-2.5 py-1 ${tone}`} role="status">
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${status === "saved" ? "bg-ink" : status === "dirty" ? "bg-warn" : "border border-ink-faint"}`} />
      {status === "saved" && queued ? "נשמר אצלך — יישלח כשיחזור החיבור" : STATUS_LABEL[status]}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  kind = "ghost",
  disabled,
  type = "button",
  className = "",
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
}) {
  const cls =
    kind === "primary"
      ? "bg-ink text-paper-card border-ink"
      : kind === "danger"
        ? "bg-paper-card text-warn border-warn"
        : "bg-paper-card text-ink border-paper-line hover:border-ink-faint";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`min-h-[44px] px-4 rounded-full border-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed ${cls} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Notice({ children, tone = "calm" }: { children: ReactNode; tone?: "calm" | "warn" }) {
  return <p className={`text-sm rounded-theme px-3 py-2 ${tone === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-ink"}`}>{children}</p>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="font-bold block mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-soft mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full min-h-[44px] rounded-theme border border-paper-line bg-paper-card text-ink px-3";

/**
 * כרטיס הפעולות הצף של "הכנסת שלי" (הכרעת בעלים 10.10.2026): בכל לשונית, בתחתית המסך, צמוד לשמאל וברוחב הכפתורים.
 * הילדים נכתבים בסדר הקריאה (מימין לשמאל), כך ש״שמור״ — האחרון — יוצא הכי שמאלי. `above` — התראות מעל הכרטיס.
 */
export function ActionBar({ children, above }: { children: ReactNode; above?: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="h-24" />
      <div className="fixed z-20 left-4 bottom-[calc(76px+env(safe-area-inset-bottom))] md:bottom-4 max-w-[calc(100%-2rem)] md:max-w-lg flex flex-col items-end gap-2">
        {above}
        <div role="group" aria-label="פעולות" className="bg-paper-card border-2 border-ink rounded-theme shadow-lg px-2 py-2 flex items-center gap-1.5 flex-wrap justify-end [&_button]:px-3 [&_button]:whitespace-nowrap">
          {children}
        </div>
      </div>
    </>
  );
}

/** תווית מקוצרת בטלפון צר (הכרעת בעלים 10.10.2026): "השלם", "אפס", "מחק" */
export function ShortLabel({ short, full }: { short: string; full: string }) {
  return <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{full}</span></>;
}

/** רכיבים קטנים שחוזרים בכל יחידות "שלי" */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
      ? "bg-signal text-signal-ink border-signal"
      : kind === "danger"
        ? "bg-paper-card text-warn border-warn"
        : "bg-paper-card text-ink border-paper-line hover:border-ink-faint";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`c-button min-h-[44px] px-4 rounded-full border text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed ${cls} ${className}`} {...rest}>
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

/** ריווח בקצה אזור הגלילה לפי הגובה בפועל, גם כשהכפתורים או הודעה נשברים לשורה. */
export function FloatingPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const main = document.getElementById("main");
    if (!main || !panel.current) return;
    const update = () => main.style.setProperty("--floating-height", `${panel.current?.getBoundingClientRect().height ?? 0}px`);
    main.setAttribute("data-floating", "true");
    const observer = new ResizeObserver(update);
    observer.observe(panel.current);
    update();
    return () => { observer.disconnect(); main.removeAttribute("data-floating"); main.style.removeProperty("--floating-height"); };
  }, []);
  return createPortal(<div ref={panel} className={`c-floating-panel ${className}`}>{children}</div>, document.body);
}

/** פעולות בסדר הקריאה מימין לשמאל; שמירה אחרונה, משמאל. */
export function ActionBar({ children, above, note }: { children: ReactNode; above?: ReactNode; note?: ReactNode }) {
  return (
    <FloatingPanel>
      {above}
      <div role="group" aria-label="פעולות" className="c-action-bar bg-paper-card border border-paper-line rounded-theme shadow-lg px-2 py-2 flex items-center gap-1.5 flex-wrap justify-end [&_button]:px-3 [&_button]:whitespace-nowrap">
        {children}
        {note && <p className="basis-full w-0 min-w-full text-xs text-ink leading-relaxed px-1 pt-1 border-t border-paper-line [overflow-wrap:anywhere]">{note}</p>}
      </div>
    </FloatingPanel>
  );
}

/** תווית מקוצרת בטלפון צר (הכרעת בעלים 10.10.2026): "השלם", "אפס", "מחק" */
export function ShortLabel({ short, full }: { short: string; full: string }) {
  return <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{full}</span></>;
}

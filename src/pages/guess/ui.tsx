/** רכיבים קטנים שחוזרים בכל יחידות "שלי" */
import type { ReactNode } from "react";
import { STATUS_LABEL } from "./useCrowd";

export function StatusPill({ status }: { status: keyof typeof STATUS_LABEL }) {
  const tone = status === "saved" ? "border-ink-faint text-ink" : status === "dirty" ? "bg-warn-soft text-warn border-warn/40" : "text-ink-soft border-paper-line";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold border rounded-full px-2.5 py-1 ${tone}`} role="status">
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${status === "saved" ? "bg-ink" : status === "dirty" ? "bg-warn" : "border border-ink-faint"}`} />
      {STATUS_LABEL[status]}
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

import type { ReactNode } from "react";

/** מגירה נפתחת: כותרת בשורה של 56px, תוכן מתחת. נשלטת מבחוץ כדי לפתוח אוטומטית. משמשת באזור האישי ובמסך הניהול. */
export function Drawer({ title, open, onToggle, children, badge, className = "" }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; badge?: ReactNode; className?: string }) {
  return (
    <section className={`c-drawer border-b border-paper-line ${className}`}>
      <h2>
        <button type="button" aria-expanded={open} onClick={onToggle} className="w-full flex items-center justify-between gap-3 min-h-[56px] text-start font-bold text-lg">
          <span className="flex items-center gap-2">{title}{badge}</span>
          <span aria-hidden="true" className={`text-ink-soft text-xl transition-transform ${open ? "rotate-45" : ""}`}>+</span>
        </button>
      </h2>
      {open && <div className="pb-5">{children}</div>}
    </section>
  );
}

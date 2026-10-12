import { useState, type ReactNode } from "react";

/**
 * מגירה בצורת כרטיס עם מסגרת (הכרעת בעלים 11.10.2026): סגורה כברירת מחדל, בשורה הסגורה רק הכותרת והסימן.
 * אותו עיצוב כמו `BlocsDrawer`, לכרטיס ההצבעה בראש "הכנסת שלי".
 * `actions` — כפתורים בשורת הכותרת, רק כשהמגירה פתוחה. `open`/`onOpenChange` — שליטה מבחוץ (בלי זה המגירה מנהלת את עצמה).
 */
export default function CardDrawer({ title, actions, dot, open, onOpenChange, className = "mt-8 mb-5", children }: {
  title: string; actions?: ReactNode; dot?: boolean; open?: boolean; onOpenChange?: (v: boolean) => void; className?: string; children: ReactNode;
}) {
  const [own, setOwn] = useState(false);
  const expanded = open ?? own;
  const toggle = () => { const v = !expanded; setOwn(v); onOpenChange?.(v); };
  return (
    <section aria-label={title} className={`bg-paper-card [--mk-bg:var(--card)] border border-paper-line rounded-theme px-4 md:px-5 ${className}`}>
      <div className="flex items-center gap-2 min-h-[56px]">
        <h2 className="flex-1 min-w-0 text-base font-bold leading-tight">
          <button type="button" aria-expanded={expanded} onClick={toggle} className="w-full min-h-[56px] text-start font-bold flex items-center gap-2">
            {title}
            {dot && !expanded && <span aria-label="(לא נשמר)" className="w-2 h-2 rounded-full bg-warn shrink-0" />}
          </button>
        </h2>
        {expanded && actions}
        <button type="button" aria-label={expanded ? "סגירה" : "פתיחה"} aria-expanded={expanded} onClick={toggle} className="min-h-[56px] w-8 text-ink-soft text-xl">
          <span aria-hidden="true" className={`inline-block transition-transform ${expanded ? "rotate-45" : ""}`}>+</span>
        </button>
      </div>
      {expanded && <div className="pb-4">{children}</div>}
    </section>
  );
}

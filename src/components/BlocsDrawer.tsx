import { useState, type ReactNode } from "react";

/**
 * מגירה אחת לכל "הגושים שלי" באתר (הכרעת בעלים 11.10.2026): סגורה כברירת מחדל, מעוצבת ככרטיס עם מסגרת (כמו `Card boxed`);
 * בשורה הסגורה רק הכותרת והסימן; כפתור "עריכת הגושים" מופיע רק אחרי הפתיחה; ובלי פירוט המפלגות שבכל גוש.
 */
export default function BlocsDrawer({ title, children }: { title: string; returnTo: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section aria-label={title} className="c-card-drawer bg-paper-card [--mk-bg:var(--card)] border border-paper-line rounded-theme px-4 md:px-5 mt-8 mb-5">
      <div className="flex items-center gap-2 min-h-[56px]">
        <h2 className="flex-1 min-w-0 text-base font-bold leading-tight">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="w-full min-h-[56px] text-start font-bold">{title}</button>
        </h2>
        <button type="button" aria-label={expanded ? "סגירה" : "פתיחה"} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="min-h-[56px] w-8 text-ink-soft text-xl">
          <span aria-hidden="true" className={`inline-block transition-transform ${expanded ? "rotate-45" : ""}`}>+</span>
        </button>
      </div>
      {expanded && <div className="pb-4">{children}</div>}
    </section>
  );
}

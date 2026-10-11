import { useState, type ReactNode } from "react";
import EditBlocsButton from "./EditBlocsButton";

/**
 * מגירה אחת לכל "הגושים שלי" באתר (הכרעת בעלים 11.10.2026, לפי "המצב היום"): סגורה כברירת מחדל; כותרת, כפתור "עריכת הגושים" נמוך
 * וחץ באותה שורה; קו מעל ומתחת שמסמנים שזה כפתור (כמו `Fold`); ובלי פירוט המפלגות שבכל גוש (בשביל זה יש את "עריכת הגושים").
 */
export default function BlocsDrawer({ title, returnTo, children }: { title: string; returnTo: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section aria-label={title} className="border-y border-paper-line mt-8">
      <div className="flex items-center gap-2 min-h-[56px]">
        <h2 className="flex-1 min-w-0 text-base font-bold leading-tight">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="w-full min-h-[56px] text-start font-bold">{title}</button>
        </h2>
        <EditBlocsButton returnTo={returnTo} compact />
        <button type="button" aria-label={expanded ? "סגירה" : "פתיחה"} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="min-h-[56px] w-8 text-ink-soft text-xl">
          <span aria-hidden="true" className={`inline-block transition-transform ${expanded ? "rotate-45" : ""}`}>+</span>
        </button>
      </div>
      {expanded && <div className="pb-4">{children}</div>}
    </section>
  );
}

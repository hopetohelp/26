import type { ReactNode } from "react";

/**
 * רשימת בחירה אחת לכל האתר (הכרעת בעלים 11.10.2026: "רכיב מקור אמת" מ"הכנסת שלי"): תווית מעל, `<select>` מקורי
 * (מקלדת, קורא מסך וגלגלת בטלפון בלי קוד נוסף), בגובה מגע של 44 פיקסלים ובטוקנים בלבד.
 * הילדים: `<option>` ו-`<optgroup>` רגילים.
 */
export const selectCls =
  "w-full min-h-[44px] rounded-theme border border-paper-line bg-paper-card text-ink px-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal";

export default function Select({ id, label, value, onChange, children, hint, className = "" }: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block font-bold">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {children}
      </select>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

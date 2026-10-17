import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * תפריט מגירות ותוכן (הכרעת בעלים 12.10.2026, המבנה "תפריט ותוכן" מקרובים מתמיד; רכיב אחיד שאפשר להעתיק למסכים אחרים).
 * מ-768 פיקסלים: מימין טור ברוחב קבוע (הגדול מבין שליש ו-24rem) — הכותרת ורשימת כותרות המגירות;
 * משמאל — התוכן של המגירה שנבחרה. כל טור בגובה המסך ונגלל לבד, ובחירה אינה מזיזה דבר.
 * 🔴 הגובה נמדד ממקום הרכיב בדף עד תחתית המסך, כך שהדף עצמו אינו נגלל והקו בין הטורים מלא מהסרגל ועד התחתית
 * (ניחוש קבוע של גובה הכותרת נכשל בטאבלט: הדף כולו זז והטור הימני נגלל בלי צורך).
 * מתחת ל-768 הרכיב לא מצייר כלום מזה — המסך מציג את הצורה הצרה שלו (`narrow`).
 */
export type MenuItem = { id: string; title: string; badge?: ReactNode; content: ReactNode };

const QUERY = "(min-width: 768px)";
const read = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

export function useWide() {
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function DrawerMenu({ title, items, selected, onSelect, after, label, className = "" }: {
  title: ReactNode;
  items: MenuItem[];
  selected: string;
  onSelect: (id: string) => void;
  /** שורות נוספות בסוף התפריט (למשל קישור למסך אחר) */
  after?: ReactNode;
  /** שם נגיש לחלונית התוכן */
  label: string;
  className?: string;
}) {
  const current = items.find((i) => i.id === selected) ?? items[0];
  const root = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    // הדף עצמו אינו נגלל כל עוד הרכיב מוצג — רק הטורים (בטאבלט 100dvh ומיקום הגלילה הפילו את המדידה)
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    window.scrollTo(0, 0);
    const measure = () => { if (root.current) setHeight(window.innerHeight - (root.current.getBoundingClientRect().top + window.scrollY)); };
    measure();
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); html.style.overflow = prev; };
  }, []);
  return (
    // ‎-mt-6: מבטלים את הריווח העליון של <main>, כדי שהקו בין הטורים יתחיל מתחת לסרגל (בתחתית אין ריווח במסך הזה)
    <div ref={root} style={height === null ? undefined : { height }} className={`c-drawer-menu -mt-6 grid grid-cols-[max(24rem,calc(100%/3))_minmax(0,1fr)] ${className}`}>
      <nav aria-label="תפריט" className="min-w-0 min-h-0 overflow-y-auto pt-6 pe-6 border-e border-paper-line">
        {title}
        <ul className="border-t border-paper-line">
          {items.map((i) => (
            <li key={i.id} className="border-b border-paper-line">
              <button type="button" aria-current={i.id === current?.id ? "true" : undefined} onClick={() => onSelect(i.id)}
                className={`w-full flex items-center justify-between gap-3 min-h-[56px] text-start font-bold text-lg ${i.id === current?.id ? "text-signal" : ""}`}>
                <span className="flex items-center gap-2">{i.title}{i.badge}</span>
                <span aria-hidden="true" className="text-ink-soft">←</span>
              </button>
            </li>
          ))}
        </ul>
        {after}
      </nav>
      <section aria-label={label} className="min-w-0 min-h-0 flex flex-col overflow-y-auto ps-6 pt-6">{current?.content}</section>
    </div>
  );
}

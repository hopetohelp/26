import { useCallback, useEffect, useState } from "react";

/**
 * האנימציות של האתר מתחילות רק כשהרכיב גלוי במסך (הכרעת בעלים 11.10.2026), ולא כשהמסך נפתח: חלק מהגרפים מתחת לקפל.
 * מחזיר `[ref, seen]`: `ref` על אלמנט הרכיב, ו-`seen` נהיה `true` פעם אחת, כשרוב הרכיב (30%) נכנס לתצוגה, ונשאר כך.
 * בלי `IntersectionObserver` (דפדפן ישן, בדיקות) — מיד `true`, כדי שלא יישאר רכיב מוסתר.
 * ב-CSS: אלמנט עם `when-visible` מושהה (`animation-play-state: paused`) עד שנוסף לו `is-seen`.
 */
export function useSeen<T extends Element>(threshold = 0.3): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (seen || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen, threshold]);
  return [ref, seen];
}

/** מחלקות ה-CSS של רכיב עם אנימציית כניסה: `when-visible`, ו-`is-seen` אחרי שנראה */
export const whenVisible = (seen: boolean) => (seen ? "when-visible is-seen" : "when-visible");

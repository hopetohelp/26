import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { siteUrl } from "../lib/siteUrls";

/**
 * קישור נפרד לקטע (הכרעת בעלים 12.10.2026): כפתור קטן ליד הכותרת שמעתיק את הכתובת של הקטע בלבד (המסך, הלשונית והעוגן),
 * כדי לשלוח או לשמור קישור ישיר אליו. הכתובת נפתחת בלשונית הנכונה וגוללת לקטע (`useAnchor` ב-`Method.tsx`).
 * מהטוקנים בלבד; ההודעה "הועתק" נקראת גם בקורא מסך (`aria-live`). אם ההעתקה נחסמת — חלון עם הכתובת להעתקה ידנית.
 */
export default function SectionLink({ id, tab, label }: { id: string; tab?: string; label: string }) {
  const { pathname } = useLocation();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(t);
  }, [done]);
  const copy = () => {
    const href = `${siteUrl()}#${pathname}${tab ? `?tab=${tab}` : ""}#${id}`;
    const ask = () => window.prompt("העתיקו את הקישור לקטע", href);
    if (!navigator.clipboard) return void ask();
    navigator.clipboard.writeText(href).then(() => setDone(true), ask);
  };
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <button
        type="button"
        onClick={copy}
        aria-label={`העתקת קישור לקטע: ${label}`}
        title="העתקת קישור לקטע"
        className="inline-flex items-center justify-center w-11 h-11 -my-2 rounded-full text-ink-soft hover:text-ink"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>
      </button>
      <span role="status" className="text-xs text-ink-soft">{done ? "הקישור הועתק" : ""}</span>
    </span>
  );
}

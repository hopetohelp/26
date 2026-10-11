import { Link } from "react-router-dom";

/** כפתור "עריכת הגושים" — מקור אמת אחד לכל כרטיסי הגושים (הכרעת בעלים 11.10.2026): מסגרת ואייקון, ומוביל לעריכה ואז חזרה למסך הנוכחי. */
export default function EditBlocsButton({ returnTo }: { returnTo: string }) {
  return (
    <Link
      to={`/guess?section=blocs&return=${encodeURIComponent(returnTo)}`}
      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border-2 border-ink text-sm font-bold no-underline text-ink hover:bg-paper"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      עריכת הגושים
    </Link>
  );
}

/** שם גוש עם חץ קטן שפותח את רשימת המפלגות שלו (ברירת מחדל: סגור) */
export function BlocNameToggle({ name, lists, className = "" }: { name: string; lists: string; className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className="cursor-pointer list-none flex items-center gap-1.5 min-h-[32px] font-bold [&::-webkit-details-marker]:hidden" aria-label={`מפלגות ${name}`}>
        <span className="break-words">{name}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-soft transition-transform group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <p className="text-xs font-normal text-ink-soft py-1 break-words">{lists || "אין מפלגות"}</p>
    </details>
  );
}

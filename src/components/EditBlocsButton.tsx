import { Link } from "react-router-dom";

/** כפתור "עריכת הגושים" — מקור אמת אחד לכל כרטיסי הגושים (הכרעת בעלים 11.10.2026): מסגרת ואייקון, ומוביל לעריכה ואז חזרה למסך הנוכחי. */
export default function EditBlocsButton({ returnTo, compact = false }: { returnTo: string; compact?: boolean }) {
  return (
    <Link
      to={`/guess?section=blocs&return=${encodeURIComponent(returnTo)}`}
      className={`inline-flex items-center gap-1.5 ${compact ? "min-h-[34px]" : "min-h-[44px]"} px-3 rounded-full border-2 border-ink text-sm font-bold no-underline text-ink hover:bg-paper`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
      עריכת הגושים
    </Link>
  );
}

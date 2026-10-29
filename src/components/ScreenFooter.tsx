import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** פעולות התחתית נשארות באותה שורה כשיש מקום; קוד הטמעה פתוח יורד לשורה מלאה. */
/** `info`: קישור ״מידע ומקורות״; ב״מה השתנה״ בלעדיו (הכרעת בעלים 29.10.2026) */
export default function ScreenFooter({ children, sourceUrl, info = true }: { children: ReactNode; sourceUrl?: string; info?: boolean }) {
  return (
    <footer className={`screen-footer mt-6 flex flex-wrap items-center ${info ? "" : "justify-center"} gap-x-5 gap-y-3 text-sm text-ink-soft`}>
      {/* מקום ל״איך זה חושב?״ של המסך (Explained עם inFooter) */}
      <span data-footer-slot className="contents" />
      {children}
      {info && <Link to="/method" className="inline-flex items-center gap-2 whitespace-nowrap"><span className="f-info" aria-hidden="true">i</span>מידע ומקורות</Link>}
      {sourceUrl && <span>מקור: <a href={sourceUrl} target="_blank" rel="noopener" className="underline">בחירות 2026 — 26.hopetohelp.net</a></span>}
    </footer>
  );
}

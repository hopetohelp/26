import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * חוזה ההסבר הצמוד לכל מספר מחושב (הכרעת בעלים 9.10.2026, החלטה 9). כל השדות חובה (הטיפוסים אוכפים זאת): סוג המספר, מקור,
 * נכון ל-, ההנחה המרכזית, וקישור לערך במילון המספרים. כך אי אפשר להוסיף מספר בלי מקור.
 * מה שמוצג בגרף: הסוג, התאריך, וקישור "איך זה חושב?" אל הערך. המקור וההנחה המלאים נמצאים במילון (`src/pages/Method.tsx`),
 * ולכן `source` ו-`assumption` כאן הם התיעוד של מה שהערך מבטיח, ועליהם להתאים לו.
 * `details`: פירוט החישוב עצמו (למשל טבלת תוצאות המחשבון), נפתח בכפתור אמיתי (מקלדת ומגע), לא בריחוף.
 */
export interface ExplainProps {
  kind:
    | "נתון רשמי"
    | "חישוב לפי החוק"
    | "סיכום סקרים"
    | "תרחיש"
    | "השוואה"
    | "תחזית"
    | "השערות משתתפים, אינן סקר"
    | "תשובות משתתפים במדגם עצמי, לא מייצג, ללא דגימה וללא שקלול";
  source: string;
  asOf: string;
  assumption: string;
  /** העוגן של הערך במילון: /method#<methodAnchor> (נבדק בבדיקה שהוא קיים) */
  methodAnchor: string;
  children: ReactNode;
  details?: ReactNode;
}

export default function Explained({ kind, asOf, methodAnchor, children, details }: ExplainProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      {children}
      <p className="mt-2 text-sm text-ink-soft">
        {kind} · {asOf} · <Link to={`/method#${methodAnchor}`} className="font-semibold">איך זה חושב?</Link>
        {details && (
          <>
            {" · "}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => setOpen((o) => !o)}
              className="min-h-[44px] -my-3 font-semibold text-accent underline underline-offset-2"
            >
              {open ? "סגירת הפירוט" : "פירוט החישוב"}
            </button>
          </>
        )}
      </p>
      {details && open && <div id={id} className="mt-2 text-sm">{details}</div>}
    </div>
  );
}

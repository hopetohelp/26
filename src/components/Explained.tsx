import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * חוזה ההסבר הצמוד לכל מספר מחושב. כל השדות חובה (הטיפוסים אוכפים זאת):
 * סוג המספר, מקור, נכון ל-, ההנחה המרכזית, וקישור לפסקה בעמוד השיטה.
 * ההסבר נפתח בכפתור אמיתי (מקלדת ומגע), לא בריחוף.
 */
export interface ExplainProps {
  kind: "נתון רשמי" | "חישוב לפי החוק" | "סיכום סקרים" | "תרחיש" | "השוואה" | "תחזית";
  source: string;
  asOf: string;
  assumption: string;
  methodAnchor: string;
  children: ReactNode;
}

export default function Explained({ kind, source, asOf, assumption, methodAnchor, children }: ExplainProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <div className="flex flex-col-reverse lg:flex-row lg:items-start gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="self-end lg:self-auto shrink-0 text-xs border border-paper-line rounded-full px-2 py-1 text-ink-soft hover:text-ink hover:border-ink-faint"
        >
          {open ? "סגירת ההסבר" : "איך זה חושב?"}
        </button>
      </div>
      {open && (
        <dl id={id} className="mt-2 text-sm bg-accent-soft rounded-md p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-bold">סוג</dt>
          <dd>{kind}</dd>
          <dt className="font-bold">מקור</dt>
          <dd>{source}</dd>
          <dt className="font-bold">נכון ל-</dt>
          <dd>{asOf}</dd>
          <dt className="font-bold">הנחה מרכזית</dt>
          <dd>{assumption}</dd>
          <dt className="font-bold">פירוט</dt>
          <dd>
            <Link to={`/method#${methodAnchor}`}>בעמוד השיטה</Link>
          </dd>
        </dl>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { CLOSED_LISTS } from "../../lib/data";
import { nameOf } from "./model";

/** פתיחת מגירת "ההצבעה שלי" מכל מקום במסך (המגירה מאזינה דרך useOpenVote) */
const OPEN_VOTE = "elections26:open-vote";
export function useOpenVote(open: () => void) {
  useEffect(() => { window.addEventListener(OPEN_VOTE, open); return () => window.removeEventListener(OPEN_VOTE, open); }, [open]);
}

/** בתחתית רשימת הניחוש: רשימות שלא עברו באף סקר אינן לניחוש, אבל אפשר לסמן הצבעה להן (הכרעת בעלים 24.10.2026) */
export default function ClosedNote({ className = "" }: { className?: string }) {
  if (!CLOSED_LISTS.length) return null;
  return (
    <p className={`text-sm text-ink-soft ${className}`}>
      אי אפשר לנחש על מפלגה שלא עברה את אחוז החסימה באף סקר ({CLOSED_LISTS.map(nameOf).join(", ")}). עדיין אפשר לסמן שאתם מצביעים לה{" "}
      <button type="button" className="underline text-ink" onClick={() => window.dispatchEvent(new Event(OPEN_VOTE))}>במגירת ההצבעה</button>.
    </p>
  );
}

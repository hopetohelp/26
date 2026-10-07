import { useState } from "react";
import { createPortal } from "react-dom";
import { FeedbackSheet } from "./Feedback";
import { FEEDBACK_URL } from "../lib/feedback";

/** דיווח יזום של הגולש מתוך התקלה; הלוג מוצג לפני השליחה. */
export default function ErrorReport({ error, errorLog }: { error: string | null; errorLog?: string | null }) {
  const [report, setReport] = useState(false);
  if (!error) return null;
  return (
    <div className="bg-paper-card rounded-theme px-3 py-2 mt-1 space-y-1">
      <p role="alert" className="text-sm text-warn">{error}</p>
      {FEEDBACK_URL && errorLog && (
        <button type="button" aria-haspopup="dialog" onClick={() => setReport(true)} className="min-h-[44px] px-3 rounded-full border border-ink-faint text-ink text-sm font-bold">
          שליחת הערה עם לוג התקלה
        </button>
      )}
      {report && errorLog && createPortal(<FeedbackSheet diagnostic={errorLog} onClose={() => setReport(false)} />, document.body)}
    </div>
  );
}


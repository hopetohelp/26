import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * כפתור פידבק בלי מייל: טופס קצר ⇐ שרת קטן ב-Cloudflare (worker/feedback) ⇐ מאגר פרטי (D1).
 * לא נשמר שום פרט מזהה. הכתובת נקבעת בבנייה (VITE_FEEDBACK_URL); בלעדיה הכפתור אינו מוצג.
 */
const ENDPOINT = import.meta.env.VITE_FEEDBACK_URL as string | undefined;
const TOPICS = [
  { id: "data", label: "נתון שגוי" },
  { id: "idea", label: "רעיון" },
  { id: "design", label: "עיצוב ונוחות" },
  { id: "other", label: "אחר" },
] as const;
const MAX = 2000;

type Status = "idle" | "sending" | "sent" | "error";

export default function Feedback() {
  const [open, setOpen] = useState(false);
  if (!ENDPOINT) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed z-20 left-4 bottom-[84px] md:bottom-6 flex items-center gap-2 min-h-[48px] px-4 rounded-full border-2 border-ink/80 bg-signal text-signal-ink font-extrabold shadow-lg"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="md:hidden">הערה?</span>
        <span className="hidden md:inline">הערה? ספרו לנו</span>
      </button>
      {open && <Sheet onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const [topic, setTopic] = useState<string>("data");
  const [text, setText] = useState("");
  const [trap, setTrap] = useState(""); // שדה מלכודת לרובוטים — גולש אמיתי לא רואה אותו
  const [status, setStatus] = useState<Status>("idle");
  const titleId = useId();
  const textId = useId();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    if (!text.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch(ENDPOINT!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, text: text.trim().slice(0, MAX), page: pathname, theme: document.documentElement.dataset.theme ?? "board", website: trap }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg bg-paper-card text-ink rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-4"
      >
        {status === "sent" ? (
          <div role="status" className="flex flex-col gap-3 items-start py-2">
            <h2 id={titleId} className="font-display text-4xl leading-none">תודה. ההערה התקבלה.</h2>
            <p className="text-base leading-relaxed">כל הערה נקראת. תיקון נתון מופיע בהיסטוריה של האתר, עם הסבר.</p>
            <button type="button" onClick={onClose} className="font-extrabold underline underline-offset-2 min-h-[44px]">
              חזרה לאתר
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center gap-3">
              <h2 id={titleId} className="font-display text-3xl leading-none">יש לך הערה? הארה? טעות?</h2>
              <button type="button" onClick={onClose} aria-label="סגירה" className="shrink-0 w-11 h-11 rounded-full bg-paper flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="text-sm font-bold mb-2">על מה?</legend>
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={topic === t.id}
                  onClick={() => setTopic(t.id)}
                  className={`min-h-[40px] px-3.5 rounded-full text-sm font-semibold border ${topic === t.id ? "bg-ink text-paper-card border-ink" : "border-ink-faint"}`}
                >
                  {t.label}
                </button>
              ))}
            </fieldset>
            <label htmlFor={textId} className="text-sm font-bold -mb-2">
              מה תרצו להגיד?
            </label>
            <textarea
              id={textId}
              ref={area}
              rows={5}
              maxLength={MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="למשל: סקר מסוים מופיע עם תאריך לא נכון"
              className="text-base border border-ink-faint rounded-theme p-3 bg-paper-card resize-y"
            />
            <label className="sr-only" aria-hidden="true">
              אתר
              <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} className="hidden" />
            </label>
            <p className="text-sm text-ink-soft leading-relaxed">
              בלי מייל ובלי הרשמה. ההערה נשמרת אצלנו בלבד, לא מתפרסמת, ולא נשמר שום פרט מזהה. העמוד שממנו שלחתם מצורף.
            </p>
            {status === "error" && (
              <p role="alert" className="text-sm font-bold text-warn">
                השליחה לא הצליחה. בדקו את החיבור לאינטרנט ונסו שוב.
              </p>
            )}
            <button
              type="button"
              onClick={send}
              disabled={!text.trim() || status === "sending"}
              className="min-h-[52px] rounded-theme bg-ink text-paper-card text-lg font-extrabold disabled:opacity-50"
            >
              {status === "sending" ? "שולחים…" : "שליחה"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

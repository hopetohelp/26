import { FEEDBACK_TOPICS as TOPICS, topicMessage } from "../lib/feedbackTopics";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getLink } from "../lib/crowdSession";
import { FEEDBACK_URL, mergeSavedThreads, replyToThread, saveThread, savedThreads, sendFeedback, threadLink } from "../lib/feedback";

/**
 * כפתור פידבק בלי מייל: טופס קצר ⇐ שרת קטן ב-Cloudflare (worker/feedback) ⇐ מאגר פרטי (D1).
 * לא נשמר שום פרט מזהה. אחרי השליחה הגולש מקבל קישור אישי לשיחה (עמוד "ההערות שלי").
 * הכתובת נקבעת בבנייה (VITE_FEEDBACK_URL); בלעדיה הכפתור אינו מוצג.
 */
const MAX = 2000;

type Status = "idle" | "sending" | "sent" | "error";

export default function Feedback() {
  const [open, setOpen] = useState(false);
  if (!FEEDBACK_URL) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="hidden md:flex relative z-10 mx-auto my-3 items-center gap-2 min-h-[48px] px-4 rounded-full border-2 border-ink/80 bg-signal text-signal-ink font-extrabold shadow-lg"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>הערה? ספרו לנו</span>
      </button>
      {open && <FeedbackSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function FeedbackSheet({ onClose, diagnostic }: { onClose: () => void; diagnostic?: string }) {
  const { pathname } = useLocation();
  const [topic, setTopic] = useState<string>(diagnostic ? "other" : "data");
  const [text, setText] = useState(diagnostic ? "לא הצלחתי לשמור את ההשערה שלי." : "");
  const [trap, setTrap] = useState(""); // שדה מלכודת לרובוטים — גולש אמיתי לא רואה אותו
  const [status, setStatus] = useState<Status>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mine = savedThreads().length;
  const titleId = useId();
  const textId = useId();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); back?.focus(); };
  }, [onClose]);

  async function send() {
    if (!text.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const body = text.trim().slice(0, MAX);
      // שיחה אחת לכל משתמש: אם כבר יש שיחה בדפדפן הזה — ההערה מצטרפת אליה (עם הנושא בראשה)
      const prim = await mergeSavedThreads();
      if (prim) {
        const res = await replyToThread(prim.token, topicMessage(topic, body).slice(0, MAX), trap, diagnostic);
        if (res.ok) {
          setToken(prim.token);
          setStatus("sent");
          return;
        }
        if (res.error !== "not found") return setStatus("error");
      }
      const res = await sendFeedback({ topic, text: body, page: pathname, theme: document.documentElement.dataset.theme ?? "board", website: trap, diagnostic });
      if (res.ok && res.token) {
        saveThread({ token: res.token, created: new Date().toISOString(), preview: body.slice(0, 80) });
        setToken(res.token);
      }
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[92dvh] overflow-y-auto bg-paper-card text-ink rounded-t-2xl md:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-4"
      >
        {status === "sent" ? (
          <div role="status" className="flex flex-col gap-3 items-start py-2">
            <h2 id={titleId} className="font-display text-4xl leading-none">תודה. ההערה התקבלה.</h2>
            <p className="text-base leading-relaxed">כל הערה נקראת. תיקון נתון מופיע בהיסטוריה של האתר, עם הסבר.</p>
            {token && (
              <div className="w-full flex flex-col gap-2 bg-paper rounded-theme p-3">
                <p className="text-sm font-bold">הקישור האישי שלך — שם תופיע התשובה, ושם אפשר להמשיך לכתוב. כל ההערות שלך נמצאות באותה שיחה:</p>
                <p className="text-xs break-all tabular bg-paper-card rounded p-2" dir="ltr">{threadLink(token)}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(threadLink(token)).then(() => setCopied(true), () => setCopied(false));
                    }}
                    className="min-h-[44px] px-4 rounded-full bg-ink text-paper-card text-sm font-bold"
                  >
                    {copied ? "הועתק" : "העתקת הקישור"}
                  </button>
                  <Link to={`/feedback/${token}`} onClick={onClose} className="min-h-[44px] px-4 rounded-full border border-ink-faint text-sm font-bold flex items-center no-underline text-ink">
                    לשיחה
                  </Link>
                </div>
                <p className="text-xs text-ink-soft">
                  הקישור נשמר גם בדפדפן הזה. מי שמחזיק בו יכול לקרוא את השיחה — אל תפרסמו אותו.
                  {getLink() ? " הקישור האישי להשערות שלך פותח גם את השיחה הזו — שמרו אותו מחדש מ\"הנתונים שלי\"." : ""}
                </p>
              </div>
            )}
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
              {diagnostic && "לוג התקלה ופרטי הדפדפן מצורפים, בלי סיסמה, קישור אישי או תוכן ההשערה. "}
              בלי מייל ובלי הרשמה. ההערה נשמרת אצלנו בלבד, לא מתפרסמת, ולא נשמר שום פרט מזהה. העמוד שממנו שלחתם מצורף. אחרי
              השליחה תקבלו קישור אישי לתשובה.
            </p>
            {mine > 0 && (
              <Link to="/feedback" onClick={onClose} className="text-sm font-bold">
                ההערות הקודמות שלי ({mine})
              </Link>
            )}
            {diagnostic && (
              <details className="text-sm text-ink-soft">
                <summary className="cursor-pointer min-h-[44px] flex items-center">לוג התקלה מצורף — אפשר לעיין בו</summary>
                <pre dir="ltr" className="text-xs whitespace-pre-wrap break-all bg-paper rounded-theme p-3">{diagnostic}</pre>
                <button type="button" className="min-h-[44px] underline font-bold" onClick={() => {
                  const url = URL.createObjectURL(new Blob([diagnostic], { type: "text/plain;charset=utf-8" }));
                  const link = document.createElement("a");
                  link.href = url; link.download = "elections26-error-log.txt"; link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>הורדת לוג התקלה</button>
              </details>
            )}
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

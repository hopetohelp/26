import { useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, Note, PageTitle } from "../components/ui";
import { FeedbackSheet } from "../components/Feedback";
import { FEEDBACK_URL, getThread, mergeSavedThreads, replyToThread, saveThread, savedThreads, threadLink, type Thread } from "../lib/feedback";
import { dateLong } from "../lib/format";

const TOPIC: Record<string, string> = { data: "נתון שגוי", idea: "רעיון", design: "עיצוב ונוחות", other: "אחר" };
const STATUS: Record<Thread["status"], string> = { new: "ממתינה לתשובה", answered: "נענתה", closed: "נסגרה" };
const when = (iso: string) => {
  const d = new Date(iso);
  return `${dateLong(iso)}, ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}`;
};

/** "ההערות שלי": רשימת הקישורים שנשמרו בדפדפן, או שיחה אחת לפי הקישור האישי */
export default function MyFeedback() {
  const { token } = useParams();
  if (!FEEDBACK_URL) return <PageTitle lead="כפתור ההערות אינו פעיל כרגע.">ההערות שלי</PageTitle>;
  return token ? <ThreadView token={token} /> : <List />;
}

export function LegacyFeedback() {
  return FEEDBACK_URL && savedThreads().length > 0 ? <section aria-labelledby="legacy-feedback-title">
    <h2 id="legacy-feedback-title" className="font-display text-3xl leading-none text-center mb-4">השיחות הקודמות שלכם</h2>
    <List embedded />
  </section> : null;
}

function List({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState(savedThreads);
  const [open, setOpen] = useState(false);
  const [mergeError, setMergeError] = useState(false);
  const [loading, setLoading] = useState(items.length > 1);
  async function sync() {
    setMergeError(false);
    try { await mergeSavedThreads(); } catch { setMergeError(true); }
    setItems(savedThreads());
    setLoading(false);
  }
  useEffect(() => { void sync(); }, []);
  return (
    <>
      {items.length === 1 && !loading ? <ThreadView token={items[0].token} embedded={embedded} /> : <>
      {!embedded && <PageTitle lead="ההערות והתשובות שלכם בשיחה אחת.">ההערות שלי</PageTitle>}
      <Card>
        {loading ? <p role="status">מאחדים את השיחות…</p> : items.length === 0 ? (
          <p className="text-base">אין כאן הערות. אפשר לשלוח את ההערה הראשונה כאן.</p>
        ) : (
          <ul className="divide-y divide-paper-line">
            {items.map((t) => (
              <li key={t.token} className="py-3">
                <Link to={`/feedback/${t.token}`} className="font-bold">
                  {t.preview || "הערה"}
                </Link>
                <p className="text-sm text-ink-soft">{when(t.created)}</p>
              </li>
            ))}
          </ul>
        )}
        <Note>הרשימה שמורה רק בדפדפן הזה. בדפדפן אחר — פותחים את הקישור האישי ששמרתם.</Note>
      </Card>
      </>}
      {mergeError && <p role="alert" className="text-sm text-warn mb-3">איחוד השיחות לא הצליח. כל השיחות נשמרו. <button type="button" onClick={() => void sync()} className="underline min-h-[44px]">לנסות שוב</button></p>}
      {!embedded && <button type="button" onClick={() => setOpen(true)} className="min-h-[48px] px-5 rounded-theme bg-ink text-paper-card font-bold">שליחת הערה</button>}
      {open && <FeedbackSheet onClose={() => { setOpen(false); void sync(); }} />}
    </>
  );
}

function ThreadView({ token, embedded = false }: { token: string; embedded?: boolean }) {
  const [thread, setThread] = useState<Thread | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const fieldId = useId();

  async function load() {
    try {
      const t = await getThread(token);
      setThread(t);
      if (t && !savedThreads().some((x) => x.token === token)) saveThread({ token, created: t.created_at, preview: t.text.slice(0, 80) });
    } catch {
      setThread(null);
    }
  }
  useEffect(() => {
    load();
  }, [token]);

  async function send() {
    if (!text.trim() || state === "sending") return;
    setState("sending");
    try {
      const res = await replyToThread(token, text.trim(), trap);
      if (!res.ok) throw new Error(res.error);
      setText("");
      setState("idle");
      await load();
    } catch {
      setState("error");
    }
  }

  if (thread === undefined) return <p role="status">טוענים את השיחה…</p>;
  if (thread === null)
    return (
      <PageTitle lead="הקישור אינו תקין, או שאין חיבור לאינטרנט. בדקו שהעתקתם את הקישור המלא.">
        השיחה לא נמצאה
      </PageTitle>
    );

  return (
    <>
      {embedded ? <p className="text-sm text-ink-soft mb-3">{STATUS[thread.status]} · {when(thread.created_at)}</p> : <PageTitle lead={`נשלחה ב-${when(thread.created_at)} · ${TOPIC[thread.topic] ?? "אחר"} · ${STATUS[thread.status]}`}>ההערה שלי</PageTitle>}
      <Card>
        <ol className="flex flex-col gap-3" aria-label="השיחה">
          <Bubble author="visitor" text={thread.text} at={thread.created_at} />
          {thread.messages.map((m, i) => (
            <Bubble key={i} author={m.author} text={m.text} at={m.created_at} />
          ))}
        </ol>
        {thread.status === "new" && thread.messages.every((m) => m.author !== "team") && (
          <Note>התשובה תופיע כאן. בדרך כלל תוך כמה שעות.</Note>
        )}
      </Card>

      {!embedded && thread.status !== "closed" && (
        <Card title="להוסיף">
          <label htmlFor={fieldId} className="text-sm font-bold">
            מה תרצו להוסיף?
          </label>
          <textarea
            id={fieldId}
            rows={4}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full mt-1 text-base border border-ink-faint rounded-theme p-3 bg-paper-card resize-y"
          />
          <label className="sr-only" aria-hidden="true">
            אתר
            <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} className="hidden" />
          </label>
          {state === "error" && (
            <p role="alert" className="text-sm font-bold text-warn mt-2">
              השליחה לא הצליחה. בדקו את החיבור לאינטרנט ונסו שוב.
            </p>
          )}
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || state === "sending"}
            className="mt-3 min-h-[48px] px-6 rounded-theme bg-ink text-paper-card font-extrabold disabled:opacity-50"
          >
            {state === "sending" ? "שולחים…" : "שליחה"}
          </button>
        </Card>
      )}
      <Note>
        הקישור האישי לשיחה: <span className="break-all" dir="ltr">{threadLink(token)}</span>. מי שמחזיק בו יכול לקרוא את השיחה — אל תפרסמו
        אותו. <Link to="/feedback">כל ההערות שלי</Link>
      </Note>
    </>
  );
}

function Bubble({ author, text, at }: { author: "team" | "visitor"; text: string; at: string }) {
  const team = author === "team";
  return (
    <li className={`max-w-[85%] rounded-theme px-3.5 py-2.5 ${team ? "self-end bg-accent-soft" : "self-start bg-paper-line/50"}`}>
      <p className="text-xs font-bold text-ink-soft mb-1">
        {team ? "צוות האתר" : "אתם"} · {when(at)}
      </p>
      <p className="text-base leading-relaxed whitespace-pre-wrap break-words">{text}</p>
    </li>
  );
}

import { FEEDBACK_TOPICS, topicMessage, type FeedbackTopic } from "../lib/feedbackTopics";
import { useEffect, useRef, useState } from "react";
import MyData from "./guess/MyData";
import { Btn, Notice } from "./guess/ui";
import { Split } from "../components/ui";
import { errorText, useSession } from "./guess/useCrowd";
import { FEEDBACK_URL, accountSupport, mergeSavedThreads, replyToThread, saveThread, sendFeedback } from "../lib/feedback";
import { LegacyFeedback } from "./MyFeedback";

type Message = { author: "visitor" | "team"; text: string; created_at: string };
type Thread = { status: "new" | "answered" | "closed"; created_at: string; updated_at: string; messages: Message[] };

function Bubble({ m }: { m: Message }) {
  const team = m.author === "team";
  return <li className={`max-w-[85%] rounded-theme px-3.5 py-2.5 ${team ? "self-end bg-accent-soft" : "self-start bg-paper-line/50"}`}>
    <p className="text-xs font-bold text-ink-soft mb-1">{team ? "צוות האתר" : "אתם"}</p>
    <p className="whitespace-pre-wrap break-words">{m.text}</p>
  </li>;
}

export default function Support() {
  const session = useSession();
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState<FeedbackTopic>("other");
  const maxText = 2000 - topicMessage(topic, "").length;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trap, setTrap] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = useRef<{ token: string; text: string; op_id: string } | null>(null);

  useEffect(() => {
    let current = true;
    setThread(null); setError(null); pending.current = null;
    if (session.token) void accountSupport(session.token).then(value => { if (current) setThread(value); }).catch(e => { if (current) setError(errorText(e)); });
    return () => { current = false; };
  }, [session.token]);

  async function send() {
    if (!text.trim() || busy || text.trim().length > maxText) return;
    const message = topicMessage(topic, text);
    setBusy(true); setError(null);
    try {
      if (session.token) {
        if (pending.current?.text !== message || pending.current.token !== session.token) pending.current = { token: session.token, text: message, op_id: crypto.randomUUID() };
        setThread(await accountSupport(session.token, { text: message, op_id: pending.current.op_id, website: trap }));
        pending.current = null;
      } else {
        const primary = await mergeSavedThreads();
        let res = primary ? await replyToThread(primary.token, message, trap) : null;
        if (!res || res.error === "not found") {
          res = await sendFeedback({ topic, text: message, page: "/support", theme: document.documentElement.dataset.theme ?? "board", website: trap });
          if (res.ok && res.token) saveThread({ token: res.token, created: new Date().toISOString(), preview: text.trim().slice(0, 80) });
        }
        if (!res.ok) throw new Error("send failed");
        setRevision(n => n + 1);
      }
      setText("");

    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (!session.online && !FEEDBACK_URL) return <Notice>התמיכה תיפתח יחד עם השמירה באתר.</Notice>;

  return <div className="space-y-8">
    <Split title="תמיכה" lead="כאן נמצאת השיחה האישית שלכם עם צוות האתר, וגם כל הנתונים שלכם." primary={
      <section className="bg-paper-card border border-paper-line rounded-theme p-5 sm:p-6 space-y-4">
        <h2 className="font-display text-3xl leading-none text-center">השיחה עם צוות האתר</h2>
        {!thread ? <p className="text-sm text-ink-soft">אפשר לכתוב לנו גם בלי חשבון.</p> : (
          <ol className="flex flex-col gap-3" aria-label="שיחת תמיכה">{thread.messages.map((m, i) => <Bubble key={i} m={m} />)}</ol>
        )}
        {thread?.status !== "closed" && <div className="space-y-2">
          <fieldset disabled={busy} className="space-y-2">
            <legend className="font-bold">סוג הפנייה</legend>
            <div className="flex flex-wrap gap-2">{FEEDBACK_TOPICS.map(option => <label key={option.id} className={`flex items-center gap-2 min-h-[44px] px-3 rounded-full border cursor-pointer ${topic === option.id ? "bg-ink text-paper-card border-ink" : "border-paper-line"}`}><input type="radio" name="support-topic" value={option.id} checked={topic === option.id} onChange={() => setTopic(option.id)} />{option.label}</label>)}</div>
          </fieldset>
          <label htmlFor="support-message" className="sr-only">הודעה לתמיכה</label>
          <textarea id="support-message" value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={maxText} placeholder="איך אפשר לעזור?" className="w-full border border-ink-faint rounded-theme p-3 bg-paper-card" />
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={trap} onChange={e => setTrap(e.target.value)} />
          {text.trim().length > maxText && <p role="alert" className="text-sm text-warn">ההודעה ארוכה מדי לסוג הפנייה שנבחר.</p>}
          {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
          <div className="flex justify-center"><Btn kind="primary" disabled={!text.trim() || busy || text.trim().length > maxText} onClick={send}>{busy ? "שולחים…" : "שליחת הודעה"}</Btn></div>
        </div>}
      </section>
    } secondary={<div className="space-y-8">
    <LegacyFeedback key={revision} />
    <section>
      <h2 className="font-display text-4xl leading-none mb-5 text-center">הנתונים שלי</h2>
      <MyData session={session} />
    </section>
    </div>} />
  </div>;
}

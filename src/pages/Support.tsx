import { useEffect, useState } from "react";
import MyData from "./guess/MyData";
import { Btn, Notice } from "./guess/ui";
import { call } from "../lib/crowdApi";
import { errorText, useSession } from "./guess/useCrowd";
import { FEEDBACK_URL, mergeSavedThreads, replyToThread, saveThread, sendFeedback } from "../lib/feedback";
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trap, setTrap] = useState("");
  const [revision, setRevision] = useState(0);

  const load = async () => {
    if (!session.token) return setThread(null);
    try { setThread((await call<{thread: Thread | null}>("/support", { token: session.token })).thread); }
    catch (e) { setError(errorText(e)); }
  };
  useEffect(() => { void load(); }, [session.token]);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      if (session.token) {
        await call("/support", { token: session.token, body: { text: text.trim() } });
      } else {
        const primary = await mergeSavedThreads();
        let res = primary ? await replyToThread(primary.token, text.trim(), trap) : null;
        if (!res || res.error === "not found") {
          res = await sendFeedback({ topic: "other", text: text.trim(), page: "/support", theme: document.documentElement.dataset.theme ?? "board", website: trap });
          if (res.ok && res.token) saveThread({ token: res.token, created: new Date().toISOString(), preview: text.trim().slice(0, 80) });
        }
        if (!res.ok) throw new Error("send failed");
        setRevision(n => n + 1);
      }
      setText("");
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (!session.online && !FEEDBACK_URL) return <Notice>התמיכה תיפתח יחד עם השמירה באתר.</Notice>;

  return <div className="max-w-3xl mx-auto space-y-8">
    <header className="text-center">
      <h1 className="font-display text-5xl leading-none">תמיכה</h1>
      <p className="mt-2 text-base text-ink-soft">כאן נמצאת השיחה האישית שלכם עם צוות האתר, וגם כל הנתונים שלכם.</p>
    </header>

      <section className="bg-paper-card border border-paper-line rounded-theme p-5 sm:p-6 space-y-4">
        <h2 className="font-display text-3xl leading-none text-center">השיחה עם צוות האתר</h2>
        {!thread ? <p className="text-sm text-ink-soft">אפשר לכתוב לנו גם בלי חשבון.</p> : (
          <ol className="flex flex-col gap-3" aria-label="שיחת תמיכה">{thread.messages.map((m, i) => <Bubble key={i} m={m} />)}</ol>
        )}
        {thread?.status !== "closed" && <div className="space-y-2">
          <label htmlFor="support-message" className="sr-only">הודעה לתמיכה</label>
          <textarea id="support-message" value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={2000} placeholder="איך אפשר לעזור?" className="w-full border border-ink-faint rounded-theme p-3 bg-paper-card" />
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={trap} onChange={e => setTrap(e.target.value)} />
          {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
          <div className="flex justify-center"><Btn kind="primary" disabled={!text.trim() || busy} onClick={send}>{busy ? "שולחים…" : "שליחת הודעה"}</Btn></div>
        </div>}
      </section>


    <LegacyFeedback key={revision} />
    <section>
      <h2 className="font-display text-4xl leading-none mb-5 text-center">הנתונים שלי</h2>
      <MyData session={session} />
    </section>
  </div>;
}

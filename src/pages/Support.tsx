import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MyData from "./guess/MyData";
import { Btn, Notice } from "./guess/ui";
import { call } from "../lib/crowdApi";
import { errorText, useSession } from "./guess/useCrowd";

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

  const load = async () => {
    if (!session.token) return setThread(null);
    try { setThread((await call<{thread: Thread | null}>("/support", { token: session.token })).thread); }
    catch (e) { setError(errorText(e)); }
  };
  useEffect(() => { void load(); }, [session.token]);

  async function send() {
    if (!text.trim() || !session.token || busy) return;
    setBusy(true); setError(null);
    try {
      await call("/support", { token: session.token, body: { text: text.trim() } });
      setText("");
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (!session.online) return <Notice>התמיכה תיפתח יחד עם השמירה באתר.</Notice>;

  return <div className="space-y-6">
    <header>
      <h1 className="font-display text-5xl leading-none">תמיכה</h1>
      <p className="mt-2 text-base text-ink-soft">כאן נמצאת השיחה האישית שלכם עם צוות האתר, וגם כל הנתונים שלכם.</p>
    </header>

    {!session.token ? (
      <section className="bg-paper-card border-2 border-ink rounded-theme p-5 space-y-3">
        <h2 className="font-display text-3xl leading-none">כדי לכתוב לנו צריך להירשם</h2>
        <p>הודעות התמיכה נשמרות לפי החשבון, ולכן כל משתמש מקבל שיחה אחת וקישור אחד.</p>
        <p className="text-sm text-ink-soft">הערות ישנות אינן חלק מהשיחה החדשה.</p>
        <Link to="/guess" className="no-underline"><Btn kind="primary">הרשמה או כניסה</Btn></Link>
      </section>
    ) : (
      <section className="bg-paper-card border border-paper-line rounded-theme p-4 space-y-4">
        <h2 className="font-display text-3xl leading-none">השיחה עם צוות האתר</h2>
        {!thread ? <p className="text-sm text-ink-soft">עדיין לא כתבתם הודעה.</p> : (
          <ol className="flex flex-col gap-3" aria-label="שיחת תמיכה">{thread.messages.map((m, i) => <Bubble key={i} m={m} />)}</ol>
        )}
        {thread?.status !== "closed" && <div className="space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={2000} placeholder="איך אפשר לעזור?" className="w-full border border-ink-faint rounded-theme p-3 bg-paper-card" />
          {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
          <Btn kind="primary" disabled={!text.trim() || busy} onClick={send}>{busy ? "שולחים…" : "שליחת הודעה"}</Btn>
        </div>}
      </section>
    )}

    <section>
      <h2 className="font-display text-4xl leading-none mb-3">הנתונים שלי</h2>
      <MyData session={session} />
    </section>
  </div>;
}

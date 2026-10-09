import { FEEDBACK_TOPICS, topicMessage, type FeedbackTopic } from "../lib/feedbackTopics";
import { useEffect, useRef, useState } from "react";
import MyData from "./guess/MyData";
import { Btn, Notice } from "./guess/ui";
import { Split } from "../components/ui";
import { Segmented } from "../components/Choice";
import { ensureSession, errorText, useSession } from "./guess/useCrowd";
import { FEEDBACK_URL, accountSupport, mergeSavedThreads, replyToThread, saveThread, sendFeedback } from "../lib/feedback";
import { LegacyFeedback } from "./MyFeedback";
import { WELCOME, markSupportSeen } from "../lib/supportUnread";

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

  // ביקור במסך התמיכה = ההודעות נקראו (גם כשמגיעה תשובה בזמן שהמסך פתוח)
  useEffect(() => { markSupportSeen(); }, [thread]);
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
      // בלי חשבון — נוצר חשבון אורח עם קישור אישי בהודעה הראשונה (הכרעת בעלים 9.10.2026); אם השרת לא זמין — שיחה בקישור כמו קודם
      const token = session.token ?? await ensureSession();
      if (token) {
        if (pending.current?.text !== message || pending.current.token !== token) pending.current = { token, text: message, op_id: crypto.randomUUID() };
        setThread(await accountSupport(token, { text: message, op_id: pending.current.op_id, website: trap }));
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

  if (!FEEDBACK_URL) return <Notice>התמיכה תיפתח יחד עם השמירה באתר.</Notice>;
  const unregistered = !session.token || session.me?.guest;

  return <>
    <Split secondaryFirst title="תמיכה" lead="כאן נמצאת השיחה האישית שלכם עם צוות האתר, וגם כל הנתונים שלכם." primary={<section>
      <h2 className="text-3xl font-display leading-tight mb-5 text-center">הנתונים שלי</h2>
      <MyData session={session} />
    </section>} secondary={<div className="space-y-8">
      <section className="bg-paper-card border border-paper-line rounded-theme p-4 md:p-5 space-y-4">
        <h2 className="text-xl font-display leading-tight text-center">השיחה עם צוות האתר</h2>
        <ol className="flex flex-col gap-3" aria-label="שיחת תמיכה">
          <Bubble m={WELCOME} />
          {thread?.messages.map((m, i) => <Bubble key={i} m={m} />)}
        </ol>
        {unregistered && <Notice>אפשר לכתוב גם בלי להירשם. שימו לב: הכניסה נשמרת רק בדפדפן הזה, באופן זמני. ממכשיר אחר אפשר לחזור לשיחה רק עם הקישור האישי, שנוצר עם ההודעה הראשונה. מומלץ להירשם עם שם משתמש וסיסמה.</Notice>}
        {thread?.status !== "closed" && <div className="space-y-2">
          <div className="space-y-2">
            <p className="font-bold">סוג הפנייה</p>
            <Segmented label="סוג הפנייה" value={topic} onChange={setTopic} disabled={busy} options={FEEDBACK_TOPICS} />
          </div>
          <label htmlFor="support-message" className="sr-only">הודעה לתמיכה</label>
          <textarea id="support-message" value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={maxText} placeholder="איך אפשר לעזור?" className="w-full border border-ink-faint rounded-theme p-3 bg-paper-card" />
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={trap} onChange={e => setTrap(e.target.value)} />
          {text.trim().length > maxText && <p role="alert" className="text-sm text-warn">ההודעה ארוכה מדי לסוג הפנייה שנבחר.</p>}
          {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
          <div className="flex justify-center"><Btn kind="primary" disabled={!text.trim() || busy || text.trim().length > maxText} onClick={send}>{busy ? "שולחים…" : "שליחת הודעה"}</Btn></div>
        </div>}
      </section>
    <LegacyFeedback key={revision} />
    </div>} />
  </>;
}

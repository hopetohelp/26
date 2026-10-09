import { FEEDBACK_TOPICS, topicMessage, type FeedbackTopic } from "../lib/feedbackTopics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import MyData from "./guess/MyData";
import Account from "./guess/Account";
import { Btn, Notice } from "./guess/ui";
import { PageTitle } from "../components/ui";
import { Segmented } from "../components/Choice";
import { errorText, useSession } from "./guess/useCrowd";
import { getPicture } from "../lib/crowdSession";
import { FEEDBACK_URL, accountSupport, getThread, mergeSavedThreads, replyToThread, saveThread, sendFeedback } from "../lib/feedback";
import { WELCOME, markSupportSeen, useSupportUnread } from "../lib/supportUnread";

/**
 * האזור האישי (הכרעת בעלים 9.10.2026, במקום "תמיכה"): תמונה ושם, ומגירות — הפרטים שלי · קישור כניסה · תמיכה · הנתונים שלי.
 * התמיכה היא שיחה אחת ארוכה עם כל ההודעות של הגולש והצוות, ושדה ההודעה בתחתית.
 * בלי חשבון: השיחה נשמרת אצלנו, והזיהוי שלה רק בדפדפן הזה; בהרשמה היא עוברת לחשבון (syncLocal).
 */
type Message = { author: "visitor" | "team"; text: string; created_at: string };

function Bubble({ m }: { m: Message }) {
  const team = m.author === "team";
  return <li className={`max-w-[85%] rounded-theme px-3.5 py-2.5 ${team ? "self-end bg-accent-soft" : "self-start bg-paper-line/50"}`}>
    <p className="text-xs font-bold text-ink-soft mb-1">{team ? "צוות האתר" : "אתם"}</p>
    <p className="whitespace-pre-wrap break-words">{m.text}</p>
  </li>;
}

/** מגירה נפתחת: כותרת בשורה של 56px, תוכן מתחת. נשלטת מבחוץ כדי לפתוח אוטומטית (למשל תמיכה עם הודעה חדשה). */
function Drawer({ title, open, onToggle, children, badge, className = "" }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; badge?: ReactNode; className?: string }) {
  return (
    <section className={`border-b border-paper-line ${className}`}>
      <h2>
        <button type="button" aria-expanded={open} onClick={onToggle} className="w-full flex items-center justify-between gap-3 min-h-[56px] text-start font-bold text-lg">
          <span className="flex items-center gap-2">{title}{badge}</span>
          <span aria-hidden="true" className={`text-ink-soft text-xl transition-transform ${open ? "rotate-45" : ""}`}>+</span>
        </button>
      </h2>
      {open && <div className="pb-5">{children}</div>}
    </section>
  );
}

function Avatar({ name, picture }: { name: string | null; picture: string | null }) {
  const [broken, setBroken] = useState(false);
  if (picture && !broken) return <img src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-16 h-16 rounded-full border border-paper-line object-cover" />;
  const letter = (name ?? "").trim().charAt(0);
  return (
    <span aria-hidden="true" className="w-16 h-16 rounded-full bg-frame text-frame-ink flex items-center justify-center font-display text-2xl">
      {letter || <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>}
    </span>
  );
}

/** שיחת התמיכה: כל ההודעות ברצף אחד, נגללת מעל שדה ההודעה הקבוע בתחתית */
function Conversation({ session }: { session: ReturnType<typeof useSession> }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState<FeedbackTopic>("other");
  const maxText = 2000 - topicMessage(topic, "").length;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trap, setTrap] = useState("");
  const pending = useRef<{ token: string; text: string; op_id: string } | null>(null);
  const list = useRef<HTMLOListElement>(null);

  async function load() {
    setError(null);
    try {
      if (session.token) {
        const t = await accountSupport(session.token);
        setMessages(t?.messages ?? []);
        setClosed(t?.status === "closed");
      } else {
        const primary = await mergeSavedThreads();
        const t = primary ? await getThread(primary.token) : null;
        setMessages(t ? [{ author: "visitor", text: t.text, created_at: t.created_at }, ...t.messages] : []);
        setClosed(t?.status === "closed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : errorText(e));
      setMessages([]);
    }
  }
  useEffect(() => { setMessages(null); pending.current = null; void load(); }, [session.token]); // eslint-disable-line react-hooks/exhaustive-deps
  // ביקור במסך = ההודעות נקראו; גלילה להודעה האחרונה
  useEffect(() => {
    markSupportSeen();
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);

  async function send() {
    if (!text.trim() || busy || text.trim().length > maxText) return;
    const message = topicMessage(topic, text);
    setBusy(true);
    setError(null);
    try {
      if (session.token) {
        if (pending.current?.text !== message || pending.current.token !== session.token) pending.current = { token: session.token, text: message, op_id: crypto.randomUUID() };
        const t = await accountSupport(session.token, { text: message, op_id: pending.current.op_id, website: trap });
        pending.current = null;
        setMessages(t?.messages ?? []);
      } else {
        const primary = await mergeSavedThreads();
        let res = primary ? await replyToThread(primary.token, message, trap) : null;
        if (!res || res.error === "not found") {
          res = await sendFeedback({ topic, text: message, page: "/support", theme: document.documentElement.dataset.theme ?? "league", website: trap });
          if (res.ok && res.token) saveThread({ token: res.token, created: new Date().toISOString(), preview: text.trim().slice(0, 80) });
        }
        if (!res.ok) throw new Error("send failed");
        await load();
      }
      setText("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!FEEDBACK_URL) return <Notice>התמיכה תיפתח יחד עם השמירה באתר.</Notice>;
  return (
    <div className="flex flex-col border border-paper-line rounded-theme bg-paper-card">
      <ol ref={list} className="flex flex-col gap-3 p-3 md:p-4 overflow-y-auto max-h-[55dvh] min-h-[12rem]" aria-label="שיחת תמיכה" aria-live="polite">
        <Bubble m={WELCOME} />
        {messages === null && <li className="text-ink-soft text-sm">טוען…</li>}
        {messages?.map((m, i) => <Bubble key={i} m={m} />)}
      </ol>
      {!session.token && <p className="text-xs text-ink-soft px-3 md:px-4 pb-2">אפשר לכתוב גם בלי חשבון. השיחה נשמרת אצלנו, אבל הזיהוי שלה שמור רק בדפדפן הזה; כשתירשמו — היא תעבור לחשבון.</p>}
      {!closed ? (
        <form className="border-t border-paper-line p-3 md:p-4 space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Segmented label="סוג הפנייה" size="sm" value={topic} onChange={setTopic} disabled={busy} options={FEEDBACK_TOPICS} />
          <div className="flex gap-2 items-end">
            <label htmlFor="support-message" className="sr-only">הודעה לצוות האתר</label>
            <textarea id="support-message" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={maxText} placeholder="כתבו הודעה…" className="flex-1 min-w-0 border border-ink-faint rounded-theme p-3 bg-paper-card" />
            <Btn type="submit" kind="primary" disabled={!text.trim() || busy || text.trim().length > maxText}>{busy ? "שולחים…" : "שליחה"}</Btn>
          </div>
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={trap} onChange={(e) => setTrap(e.target.value)} />
          {text.trim().length > maxText && <p role="alert" className="text-sm text-warn">ההודעה ארוכה מדי לסוג הפנייה שנבחר.</p>}
          {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
        </form>
      ) : <p className="border-t border-paper-line p-3 text-sm text-ink-soft">השיחה נסגרה.</p>}
    </div>
  );
}

type DrawerId = "details" | "link" | "support" | "data";

export default function Support() {
  const session = useSession();
  const { me, token } = session;
  // הודעה חדשה מהצוות ⇐ מגירת התמיכה נפתחת לבד (פתיחתה מסמנת את ההודעות כנקראו)
  const unread = useSupportUnread("/");
  const [open, setOpen] = useState<Set<DrawerId>>(() => new Set<DrawerId>(token ? [] : ["details"]));
  const toggle = (id: DrawerId) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => { if (unread) setOpen((s) => new Set(s).add("support")); }, [unread]);
  useEffect(() => { if (me?.needsEmail) setOpen((s) => new Set(s).add("details")); }, [me?.needsEmail]);
  const email = me?.emails?.find((e) => e.email)?.email ?? null;
  const status = !token ? "לא מחוברים — הכול נשמר רק במכשיר הזה ולא נכנס לסטטיסטיקות." : !me ? "טוען…" : me.google ? "מחוברים עם Google" : email ? "מחוברים במייל" : "חסר מייל או Google";

  return (
    <div>
      <PageTitle lead="הפרטים, קישור הכניסה והשיחה עם צוות האתר — במקום אחד.">אזור אישי</PageTitle>
      <header className="flex items-center gap-4 mb-4">
        <Avatar name={me?.name ?? email} picture={token ? getPicture() : null} />
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight truncate">{me?.name || (token ? "החשבון שלי" : "אורח")}</p>
          <p className="text-sm text-ink-soft">{status}</p>
        </div>
      </header>
      {/* טלפון: מגירה אחרי מגירה. מחשב (הכרעת בעלים 8.10.2026): הפרטים בטור הצר, השיחה בטור הרחב */}
      <div className="border-t border-paper-line lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-x-10 lg:items-start lg:border-t-0 [&>*]:min-w-0">
        <Drawer className="lg:col-start-1 lg:border-t" title={token ? "הפרטים שלי" : "הרשמה או כניסה"} open={open.has("details")} onToggle={() => toggle("details")} badge={me?.needsEmail ? <span className="w-2.5 h-2.5 rounded-full bg-warn" aria-label="(חסר מייל)" /> : undefined}>
          <Account session={session} />
        </Drawer>
        {token && (
          <Drawer className="lg:col-start-1" title="קישור כניסה" open={open.has("link")} onToggle={() => toggle("link")}>
            <MyData session={session} part="link" />
          </Drawer>
        )}
        <Drawer className="lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:border-t" title="תמיכה" open={open.has("support")} onToggle={() => toggle("support")} badge={unread ? <span className="w-2.5 h-2.5 rounded-full bg-signal" aria-label="(הודעה חדשה)" /> : undefined}>
          <Conversation session={session} />
        </Drawer>
        {token && (
          <Drawer className="lg:col-start-1" title="הנתונים שלי" open={open.has("data")} onToggle={() => toggle("data")}>
            <MyData session={session} part="data" />
          </Drawer>
        )}
      </div>
    </div>
  );
}

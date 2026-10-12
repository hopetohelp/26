import { FEEDBACK_TOPICS, topicMessage, type FeedbackTopic } from "../lib/feedbackTopics";
import Linkified from "../components/Linkified";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import MyData from "./guess/MyData";
import Account, { ManagedGroup } from "./guess/Account";
import { useServerBlocked } from "../components/FilterBlocked";
import { Drawer } from "../components/Drawer";
import { DrawerMenu, useWide } from "../components/DrawerMenu";
import Assistants from "./guess/Assistants";
import { Btn, Notice } from "./guess/ui";
import { PageTitle } from "../components/ui";
import { Segmented } from "../components/Choice";
import { errorText, useSession } from "./guess/useCrowd";
import { getPicture } from "../lib/crowdSession";
import { FEEDBACK_URL, accountSupport, getThread, mergeSavedThreads, replyToThread, saveThread, sendFeedback } from "../lib/feedback";
import { OLD_WELCOME, WELCOME, markSupportSeen, useSupportUnread } from "../lib/supportUnread";

/** מפתח ניהול שנשמר בדפדפן הזה (כניסה דרך קישור הניהול) — גם הוא מציג את הכפתור לממשק הניהול */
const hasAdminKey = () => { try { return !!localStorage.getItem("elections26.admin"); } catch { return false; } };

/**
 * האזור האישי (הכרעת בעלים 9.10.2026, במקום "תמיכה"): תמונה ושם, ומגירות — הפרטים שלי · צוות האתר (לשעבר "תמיכה", 12.10.2026) · הנתונים שלי (מגירת הקישור הוסרה 10.10.2026).
 * התמיכה היא שיחה אחת ארוכה עם כל ההודעות של המשתתף והצוות, ושדה ההודעה בתחתית.
 * בלי חשבון: השיחה נשמרת אצלנו, והזיהוי שלה רק בדפדפן הזה; בהרשמה היא עוברת לחשבון (syncLocal).
 */
type Message = { author: "visitor" | "team"; text: string; created_at: string };

function Bubble({ m }: { m: Message }) {
  const team = m.author === "team";
  return <li className={`max-w-[85%] rounded-theme px-3.5 py-2.5 ${team ? "self-end bg-accent-soft" : "self-start bg-paper-line/50"}`}>
    <p className="text-xs font-bold text-ink-soft mb-1">{team ? "צוות האתר" : "אתם"}</p>
    <p className="whitespace-pre-wrap break-words"><Linkified text={m.text} /></p>
  </li>;
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
      // "Failed to fetch" = כשל רשת (אצל מסוננים: התשובה נחסמה בדרך) — במילים פשוטות, וההסבר המלא ב"הפרטים שלי"
      setError(e instanceof TypeError ? "אין חיבור לשרת התמיכה, כנראה בגלל סינון אינטרנט. ההסבר והכתובות לבקשה מהסינון — ב\"הפרטים שלי\"." : e instanceof Error ? e.message : errorText(e));
      setMessages([]);
    }
  }
  useEffect(() => { setMessages(null); pending.current = null; void load(); }, [session.token]); // eslint-disable-line react-hooks/exhaustive-deps
  // ביקור במסך = ההודעות נקראו; גלילה להודעה האחרונה
  useEffect(() => {
    markSupportSeen();
    if (messages?.length) list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
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
          res = await sendFeedback({ topic, text: message, page: "/support", theme: "league", website: trap });
          if (res.ok && res.token) saveThread({ token: res.token, created: new Date().toISOString(), preview: text.trim().slice(0, 80) });
        }
        if (!res.ok) throw new Error("send failed");
        await load();
      }
      setText("");
      const box = document.getElementById("support-message");
      if (box) box.style.height = "";
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!FEEDBACK_URL) return <Notice>השיחה עם הצוות תיפתח יחד עם השמירה באתר.</Notice>;
  return (
    <section aria-labelledby="chat-title" className="flex-1 flex flex-col">
      <h2 id="chat-title" className="font-bold text-lg pt-4 pb-2">צוות האתר</h2>
      {/* ההודעות נגללות עם המסך, מהמגירות ועד שדה הכתיבה */}
      <div className="flex-1 flex flex-col">
      <ol ref={list} className="mt-auto flex flex-col gap-3 pb-3" aria-label="שיחה עם צוות האתר" aria-live="polite">
        {/* שיחה שקיבלה את הנוסח החדש כהודעה בתוכה ⇐ בראשה נשארת הפתיחה הישנה; שיחה חדשה ⇐ הנוסח החדש בראש */}
        {messages !== null && <Bubble m={messages.some((m) => m.author === "team" && m.text === WELCOME.text) ? OLD_WELCOME : WELCOME} />}
        {messages === null && <li className="text-ink-soft text-sm">טוען…</li>}
        {messages?.map((m, i) => <Bubble key={i} m={m} />)}
      </ol>
      </div>
      <p className="text-xs text-ink-soft pb-2">התשובות מתקבלות פעם בכמה שעות.{!session.token && " אפשר לכתוב גם בלי חשבון. השיחה נשמרת אצלנו, אבל הזיהוי שלה שמור רק בדפדפן הזה; כשתירשמו — היא תעבור לחשבון."}</p>
      {!closed ? (
        <form className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 z-20 -mx-4 px-4 md:mx-0 md:px-0 border-t border-paper-line bg-paper pt-3 pb-3 md:pb-4 space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Segmented label="סוג הפנייה" size="sm" value={topic} onChange={setTopic} disabled={busy} options={FEEDBACK_TOPICS} />
          {topic === "theory" && <p className="text-xs text-ink-soft">שאלו שאלה או כתבו תאוריה על הבחירות. נענה על פי הנתונים ונסביר איך תוכלו לבדוק את זה בעצמכם באתר. אם אין באתר דרך לבדוק, נציע רעיון לשדרוג ונשמח לשמוע גם את שלכם.</p>}
          <div className="flex gap-2 items-end">
            <label htmlFor="support-message" className="sr-only">הודעה לצוות האתר</label>
            {/* שורה אחת כברירת מחדל, ומתרחב עם הטקסט עד 5 שורות; מעבר לזה — גלילה בתוך השדה */}
            <textarea id="support-message" value={text} onChange={(e) => { setText(e.target.value); grow(e.target); }} rows={1} maxLength={maxText} placeholder="כתבו הודעה…" className="flex-1 min-w-0 resize-none overflow-y-auto border border-ink-faint rounded-theme p-3 bg-paper-card" />
            <Btn type="submit" kind="primary" disabled={!text.trim() || busy || text.trim().length > maxText}>{busy ? "שולחים…" : "שליחה"}</Btn>
          </div>
          <input aria-hidden="true" tabIndex={-1} autoComplete="off" className="hidden" value={trap} onChange={(e) => setTrap(e.target.value)} />
          {text.trim().length > maxText && <p role="alert" className="text-sm text-warn">ההודעה ארוכה מדי לסוג הפנייה שנבחר.</p>}
          {error && <p role="alert" className="text-sm font-bold text-warn">{error}</p>}
        </form>
      ) : <p className="border-t border-paper-line py-3 text-sm text-ink-soft">השיחה נסגרה.</p>}
    </section>
  );
}

/** גובה השדה לפי התוכן, עד 5 שורות */
function grow(el: HTMLTextAreaElement) {
  const css = getComputedStyle(el);
  const line = parseFloat(css.lineHeight) || 24;
  const extra = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth), line * 5 + extra)}px`;
}

type DrawerId = "details" | "data" | "groups" | "assistants";

export default function Support() {
  const session = useSession();
  const { me, token } = session;
  // הודעה חדשה מהצוות ⇐ השיחה מוצגת תמיד; הביקור במסך מסמן אותה כנקראה
  useSupportUnread("/");
  const [open, setOpen] = useState<Set<DrawerId>>(() => new Set<DrawerId>(token ? [] : ["details"]));
  const toggle = (id: DrawerId) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => { if (me?.needsEmail) setOpen((s) => new Set(s).add("details")); }, [me?.needsEmail]);
  const blocked = useServerBlocked();
  // הסינון חוסם את השרת ⇐ ההסבר (בתוך "הפרטים שלי") נפתח לבד
  useEffect(() => { if (token && !me && blocked) setOpen((s) => new Set(s).add("details")); }, [token, me, blocked]);
  const email = me?.emails?.find((e) => e.email)?.email ?? null;
  const status = !token ? "לא מחוברים — הכול נשמר רק במכשיר הזה ולא נכנס לסטטיסטיקות." : !me ? (blocked ? "הסינון חוסם את החיבור לשרת" : "טוען…") : me.google ? "מחוברים עם Google" : email ? "מחוברים במייל" : "חסר מייל או Google";
  const groups = me?.managedGroups ?? [];

  // מסך רחב: תפריט מגירות מימין ותוכן המגירה שנבחרה משמאל; ברירת המחדל — השיחה עם צוות האתר
  const wide = useWide();
  const [selected, setSelected] = useState<DrawerId | "chat">("chat");
  useEffect(() => { if (me?.needsEmail || (token && !me && blocked)) setSelected("details"); }, [me?.needsEmail, token, me, blocked]);
  const badge = me?.needsEmail || (me?.legacy && !me.verified) ? <span className="w-2.5 h-2.5 rounded-full bg-warn" aria-label="(נדרש אימות)" /> : undefined;
  const details = (
    <>
      <header className="flex items-center gap-4 mb-4">
        <Avatar name={me?.name ?? email} picture={token ? getPicture() : null} />
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight truncate">{me?.name || (token ? "החשבון שלי" : "אורח")}</p>
          <p className="text-sm text-ink-soft">{status}</p>
        </div>
      </header>
      <Account session={session} hideGroups />
    </>
  );
  const data = token ? <MyData session={session} part="data" /> : null;
  const assistants = <Assistants session={session} />;
  const groupList = token ? groups.map((g) => <ManagedGroup key={g.id} id={g.id} name={g.name ?? g.id} slug={g.slug} image={g.image} token={token} className="py-3 border-b border-paper-line space-y-2" onChanged={() => void session.refresh()} collapsible={groups.length > 1} />) : null;
  const admin = (me?.isAdmin || hasAdminKey()) && (
    <div className="border-b border-paper-line">
      <Link to="/admin" className="flex items-center justify-between gap-3 min-h-[56px] font-bold text-lg">ניהול האתר<span aria-hidden="true" className="text-ink-soft">←</span></Link>
    </div>
  );
  const detailsTitle = token ? "הפרטים שלי" : "הרשמה או כניסה";

  /*
   * מבנה המסך (הכרעת בעלים 12.10.2026). צר: בראש מגירות (הפרטים שלי, הנתונים שלי, ניהול קבוצה, ניהול האתר),
   * ושאר המסך — צ׳אט עם צוות האתר, ושדה כתיבה מתרחב צמוד לתחתית. רחב (DrawerMenu): גם השיחה היא מגירה, והיא הפתוחה בכניסה.
   */
  if (wide) {
    const items = [
      { id: "chat", title: "צוות האתר", content: <Conversation session={session} /> },
      { id: "details", title: detailsTitle, badge, content: details },
      ...(token ? [{ id: "data", title: "הנתונים שלי", content: data }] : []),
      ...(token && groups.length > 0 ? [{ id: "groups", title: "ניהול קבוצה", content: groupList }] : []),
      { id: "assistants", title: "עוזרי AI", content: assistants },
    ];
    return <DrawerMenu title={<PageTitle>אזור אישי</PageTitle>} items={items} selected={selected} onSelect={(id) => setSelected(id as DrawerId | "chat")} after={admin} label="אזור אישי" />;
  }
  return (
    <div className="flex flex-col min-h-[calc(100dvh-10.5rem)]">
      <PageTitle>אזור אישי</PageTitle>
      <div className="border-t border-paper-line [&>*]:min-w-0">
        <Drawer title={detailsTitle} open={open.has("details")} onToggle={() => toggle("details")} badge={badge}>{details}</Drawer>
        {token && <Drawer title="הנתונים שלי" open={open.has("data")} onToggle={() => toggle("data")}>{data}</Drawer>}
        {token && groups.length > 0 && <Drawer title="ניהול קבוצה" open={open.has("groups")} onToggle={() => toggle("groups")}>{groupList}</Drawer>}
        <Drawer title="עוזרי AI" open={open.has("assistants")} onToggle={() => toggle("assistants")}>{assistants}</Drawer>
        {admin}
      </div>
      <Conversation session={session} />
    </div>
  );
}

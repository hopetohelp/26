import { FEEDBACK_TOPICS, conversationTopic } from "../lib/feedbackTopics";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FEEDBACK_URL } from "../lib/feedback";
import { Btn, Notice } from "./guess/ui";

/**
 * ממשק ניהול (לבעלים בלבד, לא מקושר מהאתר): כל שיחות התמיכה עם תשובה, וכניסות, משתמשים ונפילות לפי יום.
 * המפתח מגיע בקישור (?k=), נשמר בדפדפן הזה בלבד ונמחק מהכתובת. בשרת נשמר רק גיבוב שלו (admin_keys).
 */
const KEY = "elections26.admin";
type Item = { author: "visitor" | "team"; text: string; created_at: string; topic?: string; page?: string };
type Thread = { id: number | string; items: Item[]; updated_at: string; waiting: boolean };
type Day = { day: string; visits: number; users: number; blocked: number; blindSaved: number; relaySaved: number; autoFailures: number };
type SupportThread = { participant: string; status: string; updated_at: string; messages: Item[] };
type Data = { accountStatsAvailable?: boolean; days: Day[]; totalVisitors: number; feedback: Thread[]; support: { stats: Record<string, number>; threads: SupportThread[] } | null };

const when = (s: string) => new Date(s).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

function Conversation({ title, items, waiting, onReply }: { title: string; items: Item[]; waiting: boolean; onReply: (text: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(waiting);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const first = items.find((i) => i.author === "visitor") ?? items[0];
  return (
    <li className="bg-paper-card border border-paper-line rounded-theme">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full text-start p-3 flex gap-2 items-start min-h-[44px]">
        <span className={`shrink-0 mt-1 w-2.5 h-2.5 rounded-full ${waiting ? "bg-warn" : "bg-paper-line"}`} aria-label={waiting ? "ממתין לתשובה" : "נענה"} />
        <span className="flex-1 min-w-0">
          <span className="text-xs text-ink-soft block">{title} · {when(items[items.length - 1].created_at)} · {items.length} הודעות{waiting ? " · ממתין לתשובה" : ""}</span>
          <span className="block truncate">{first?.text.split("\n")[0]}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <ul className="flex flex-col gap-2">
            {items.map((m, i) => (
              <li key={i} className={`max-w-[90%] rounded-theme px-3 py-2 text-sm ${m.author === "team" ? "self-end bg-accent-soft" : "self-start bg-paper-line/50"}`}>
                <p className="text-xs font-bold text-ink-soft mb-1">{m.author === "team" ? "צוות" : "גולש"} · {when(m.created_at)}{m.page ? ` · ${m.page}` : ""}</p>
                <p className="whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{m.text}</p>
              </li>
            ))}
          </ul>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="תשובה" className="w-full rounded-theme border border-paper-line bg-paper text-ink p-2 text-sm" placeholder="תשובה לגולש…" />
          <Btn kind="primary" disabled={busy || !text.trim()} onClick={async () => { setBusy(true); if (await onReply(text.trim())) setText(""); setBusy(false); }}>{busy ? "שולח…" : "שליחת תשובה"}</Btn>
        </div>
      )}
    </li>
  );
}

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const [key, setKey] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const k = params.get("k");
    if (!k) return;
    try { localStorage.setItem(KEY, k); } catch { /* בלי אחסון — המפתח נשאר רק לביקור הזה */ }
    setKey(k);
    params.delete("k");
    setParams(params, { replace: true });
  }, [params, setParams]);

  const api = async (path: string, body?: unknown) => {
    const r = await fetch(`${FEEDBACK_URL}${path}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) throw new Error("המפתח אינו תקף.");
    if (!r.ok) throw new Error(`שגיאת שרת (${r.status}).`);
    return r.json();
  };
  const load = async () => {
    setError(null);
    try { setData(await api("/admin/data")); } catch (e) { setError((e as Error).message || "אין חיבור לשרת."); }
  };
  useEffect(() => { if (key && FEEDBACK_URL) void load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const reply = (kind: "feedback" | "support", id: number | string) => async (text: string) => {
    try { await api("/admin/reply", { kind, id, text }); await load(); return true; } catch (e) { setError((e as Error).message); return false; }
  };

  if (!key) return <Notice>הממשק זמין רק דרך קישור הניהול.</Notice>;
  const today = data?.days[0];
  const waiting = (data?.feedback.filter((t) => t.waiting).length ?? 0) + (data?.support?.threads.filter((t) => t.status === "new").length ?? 0);
  return (
    <div className="space-y-6">
      <meta name="robots" content="noindex" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-display text-4xl leading-none">ניהול</h1>
        <Btn onClick={load}>רענון</Btn>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      {!data && !error && <p className="text-ink-soft">טוען…</p>}
      {data && (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["כניסות היום", today?.visits ?? 0],
              ["משתמשים היום", today?.users ?? 0],
              ["נפילות היום", (today?.autoFailures ?? 0)],
              ["ממתינים לתשובה", waiting],
              ["משתמשים מצטבר", data.totalVisitors],
              ["חשבונות", data.support?.stats.participants ?? "—"],
              ["חשבונות היום", data.support?.stats.participantsToday ?? "—"],
              ["שמירות היום", data.support?.stats.savesToday ?? "—"],
            ].map(([label, n]) => (
              <div key={label} className="bg-paper-card border border-paper-line rounded-theme p-3">
                <p className="text-xs text-ink-soft">{label}</p>
                <p className="font-num tabular text-3xl leading-none mt-1">{n}</p>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-2xl">לפי יום</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead><tr className="text-ink-soft text-start">{["יום", "כניסות", "משתמשים", "נפילות (דיווח אוטומטי)", "חסימה מלאה", "נשמר בעקיפה", "נשמר בלי תשובה"].map((h) => <th key={h} className="text-start font-medium py-1 pe-3">{h}</th>)}</tr></thead>
                <tbody>{data.days.map((d) => <tr key={d.day} className="border-t border-paper-line"><td className="py-1 pe-3">{d.day}</td><td>{d.visits}</td><td>{d.users}</td><td>{d.autoFailures}</td><td>{d.blocked}</td><td>{d.relaySaved}</td><td>{d.blindSaved}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="text-xs text-ink-soft">ימים לפי שעון UTC. "נפילות" = דיווחי כשל חיבור אוטומטיים; "חסימה מלאה" = בדיקות חיבור שבהן כל המסלולים נחסמו.</p>
          </section>

          {data.accountStatsAvailable === false && <Notice tone="warn">מספרי החשבונות והעברת שיחות ישנות אינם זמינים כרגע. השיחות שכבר נשמרו בשרת ההערות זמינות למענה.</Notice>}
          <InquirySections data={data} reply={reply} />
        </>
      )}
    </div>
  );
}


/** שני מקורות השמירה מוצגים יחד; נתיב התשובה המקורי נשמר לכל שיחה. */
export function InquirySections({ data, reply }: { data: Data; reply: (kind: "feedback" | "support", id: number | string) => (text: string) => Promise<boolean> }) {
  const conversations = [
    ...data.feedback.map(thread => ({ key: `feedback-${thread.id}`, title: `פנייה ${thread.id}`, items: thread.items, waiting: thread.waiting, updated: thread.updated_at, onReply: reply("feedback", thread.id) })),
    ...(data.support?.threads ?? []).map(thread => ({ key: `support-${thread.participant}`, title: "משתמש רשום", items: thread.messages, waiting: thread.status === "new", updated: thread.updated_at, onReply: reply("support", thread.participant) })),
  ].sort((a,b) => Number(b.waiting)-Number(a.waiting) || b.updated.localeCompare(a.updated));
  return <>{FEEDBACK_TOPICS.map(topic => {
    const group = conversations.filter(conversation => conversationTopic(conversation.items) === topic.id);
    return <section key={topic.id} className="space-y-2">
      <h2 className="font-display text-2xl">{topic.label} ({group.length})</h2>
      {group.length ? <ul className="space-y-2">{group.map(({ key, ...conversation }) => <Conversation key={key} {...conversation} />)}</ul> : <p className="text-sm text-ink-soft">אין פניות מסוג זה.</p>}
    </section>;
  })}</>;
}

import { FEEDBACK_TOPICS, conversationTopic, topicLabel } from "../lib/feedbackTopics";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FEEDBACK_URL } from "../lib/feedback";
import { dateTime } from "../lib/format";
import { getToken } from "../lib/crowdSession";
import { Chips, Segmented } from "../components/Choice";
import { Btn, Notice } from "./guess/ui";
import AdminGuesses from "./AdminGuesses";
import AdminGroups from "./AdminGroups";

/**
 * ממשק ניהול: כל הפניות עם תשובה, וכניסות, משתמשים ונפילות לפי יום.
 * כניסה: מפתח בקישור (?k=) — נשמר בדפדפן הזה בלבד ונמחק מהכתובת, ובשרת רק גיבוב שלו (admin_keys); או חשבון שהוגדר מנהל
 * (טבלת admins; הכרעת בעלים 9.10.2026) — הסשן של החשבון משמש כמפתח, בלי קישור.
 */
const KEY = "elections26.admin";
type Item = { author: "visitor" | "team"; text: string; created_at: string; topic?: string; page?: string };
type Thread = { id: number | string; items: Item[]; updated_at: string; waiting: boolean };
type Day = { day: string; visits: number; users: number; guessUsers?: number; communityUsers?: number; blocked: number; blindSaved: number; relaySaved: number; autoFailures: number };
type SupportThread = { participant: string; status: string; updated_at: string; messages: Item[] };
type Data = { accountStatsAvailable?: boolean; days: Day[]; totalVisitors: number; totalVisits?: number; failures?: { since: string | null; total: number }; feedback: Thread[]; support: { stats: Record<string, number>; threads: SupportThread[] } | null };

const when = (s: string) => dateTime(s);

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
          <span className="text-xs text-ink-soft block">{title} · {topicLabel(conversationTopic(items))} · התקבלה {when(items[0].created_at)} · {items.length} הודעות{waiting ? " · ממתין לתשובה" : ""}</span>
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

  // מפתח הניהול, ואם אין — הסשן של החשבון (מנהל לפי חשבון)
  const credential = key ?? getToken();
  const api = async (path: string, body?: unknown) => {
    const r = await fetch(`${FEEDBACK_URL}${path}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { authorization: `Bearer ${credential}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) throw new Error(key ? "המפתח אינו תקף." : "לחשבון הזה אין הרשאת ניהול.");
    if (!r.ok) throw new Error(`שגיאת שרת (${r.status}).`);
    return r.json();
  };
  const load = async () => {
    setError(null);
    try { setData(await api("/admin/data")); } catch (e) { setError((e as Error).message || "אין חיבור לשרת."); }
  };
  useEffect(() => { if (credential && FEEDBACK_URL) void load(); }, [credential]); // eslint-disable-line react-hooks/exhaustive-deps
  const reply = (kind: "feedback" | "support", id: number | string) => async (text: string) => {
    try { await api("/admin/reply", { kind, id, text }); await load(); return true; } catch (e) { setError((e as Error).message); return false; }
  };

  if (!credential) return <Notice>הממשק זמין רק לחשבון מנהל (אחרי כניסה) או דרך קישור הניהול.</Notice>;
  // "היום" לפי יום UTC, כמו בשרת: אם עוד לא נספרה כניסה היום — אפסים, ולא נתוני אתמול
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = data?.days.find((d) => d.day === todayKey);
  const waiting = (data?.feedback.filter((t) => t.waiting).length ?? 0) + (data?.support?.threads.filter((t) => t.status === "new").length ?? 0);
  return (
    <div className="space-y-6">
      <meta name="robots" content="noindex" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-display leading-tight">ניהול</h1>
        <Btn onClick={load}>רענון</Btn>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
      {!data && !error && <p className="text-ink-soft">טוען…</p>}
      {data && (
        <>
          {([
            ["סך הכול", "מהתחלה (6/10)", [
              ["כניסות", data.totalVisits ?? "—"],
              ["משתמשים מצטבר", data.totalVisitors],
              ["שמרו (בדשבורד)", data.support?.stats.savers ?? "—"],
              ["רשומות במאגר", data.support?.stats.participants ?? "—"],
              ["חשבון Google", data.support?.stats.googleAccounts ?? "—"],
              ["מייל מאומת (בקישור)", data.support?.stats.verifiedEmails ?? "—"],
            ]],
            ["היום", "לפי יום UTC", [
              ["כניסות היום", today?.visits ?? 0],
              ["משתמשים היום", today?.users ?? 0],
              ["נכנסו להשערה היום", today?.guessUsers ?? 0],
              ["נכנסו לסטטיסטיקות היום", today?.communityUsers ?? 0],
              ["שמרו היום (אנשים)", data.support?.stats.saversToday ?? "—"],
              ["פעולות שמירה היום", data.support?.stats.savesToday ?? "—"],
              ["רשומות היום", data.support?.stats.participantsToday ?? "—"],
              ["ממתינים לתשובה", waiting],
            ]],
            ["נפילות", data.failures?.since ? `נספרות מאז האיפוס: ${when(data.failures.since)}` : "נספרות מההתחלה", [
              ["נפילות סך הכול", data.failures?.total ?? "—"],
              ["נפילות היום", today?.autoFailures ?? 0],
              ["חסימה מלאה היום", today?.blocked ?? 0],
              ["נשמר בעקיפה היום", today?.relaySaved ?? 0],
              ["נשמר בלי תשובה היום", today?.blindSaved ?? 0],
            ]],
          ] as [string, string, [string, string | number][]][]).map(([title, note, tiles]) => (
            <section key={title} className="space-y-2" aria-label={title}>
              <h2 className="flex items-baseline gap-2 flex-wrap"><span className="font-display text-xl">{title}</span><span className="text-xs text-ink-soft">{note}</span></h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {tiles.map(([label, n]) => (
                  <div key={label} className="bg-paper-card border border-paper-line rounded-theme p-3">
                    <p className="text-xs text-ink-soft">{label}</p>
                    <p className="font-num tabular text-3xl leading-none mt-1">{n}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section className="space-y-2">
            <h2 className="font-display text-2xl">לפי יום</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead><tr className="text-ink-soft text-start">{["יום", "כניסות", "משתמשים", "נכנסו להשערה", "נכנסו לסטטיסטיקות", "נפילות (דיווח אוטומטי)", "חסימה מלאה", "נשמר בעקיפה", "נשמר בלי תשובה"].map((h) => <th key={h} className="text-start font-medium py-1 pe-3">{h}</th>)}</tr></thead>
                <tbody>{data.days.map((d) => <tr key={d.day} className="border-t border-paper-line"><td className="py-1 pe-3">{d.day}</td><td>{d.visits}</td><td>{d.users}</td><td>{d.guessUsers ?? "—"}</td><td>{d.communityUsers ?? "—"}</td><td>{d.autoFailures}</td><td>{d.blocked}</td><td>{d.relaySaved}</td><td>{d.blindSaved}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="text-xs text-ink-soft">ימים לפי שעון UTC. "נפילות" = דיווחי כשל חיבור אוטומטיים; "חסימה מלאה" = בדיקות חיבור שבהן כל המסלולים נחסמו. "שמרו" = אנשים ששמרו לפחות פעם אחת, כולם בדשבורד; "פעולות שמירה" = כל לחיצה על שמירה (מנדטים וגושים נספרים בנפרד, וכל שינוי נספר שוב). "מייל מאומת (בקישור)" = חשבונות שאימתו את המייל דרך הקישור שנשלח אליהם, בלי אלה ש-Google אימת; "חשבון Google" = חשבונות שנכנסו עם Google. "רשומות ריקות בלי משתמש" = ברובן כפילויות מהתקלה שיצרה 3 רשומות לכל ניסיון (תוקנה 8/10), ולא אנשים.</p>
          </section>

          <AdminGuesses api={api} />

          <AdminGroups api={api} />

          {data.accountStatsAvailable === false && <Notice tone="warn">מספרי החשבונות והעברת שיחות ישנות אינם זמינים כרגע. השיחות שכבר נשמרו בשרת ההערות זמינות למענה.</Notice>}
          <InquirySections data={data} reply={reply} />
        </>
      )}
    </div>
  );
}


type Sort = "oldest" | "newest";
type Filter = "all" | "waiting";

/**
 * כל הפניות ברשימה אחת לפי סדר קבלתן — לפי ההודעה הראשונה בכל שיחה (הכרעת בעלים 9.10.2026) — עם סינון לפי נושא ולפי "ממתינות לתשובה".
 * שני מקורות השמירה מוצגים יחד; נתיב התשובה המקורי נשמר לכל שיחה.
 */
export function InquirySections({ data, reply }: { data: Data; reply: (kind: "feedback" | "support", id: number | string) => (text: string) => Promise<boolean> }) {
  const [topic, setTopic] = useState<"all" | (typeof FEEDBACK_TOPICS)[number]["id"]>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("oldest");
  const all = [
    ...data.feedback.map(thread => ({ key: `feedback-${thread.id}`, title: `פנייה ${thread.id}`, items: thread.items, waiting: thread.waiting, onReply: reply("feedback", thread.id) })),
    ...(data.support?.threads ?? []).map(thread => ({ key: `support-${thread.participant}`, title: "משתמש רשום", items: thread.messages, waiting: thread.status === "new", onReply: reply("support", thread.participant) })),
  ].filter(c => c.items.length).map(c => ({ ...c, received: c.items[0].created_at, topic: conversationTopic(c.items) }));
  const count = (pick: (c: (typeof all)[number]) => boolean) => all.filter(pick).length;
  const shown = all
    .filter(c => (topic === "all" || c.topic === topic) && (filter === "all" || c.waiting))
    .sort((a, b) => (sort === "oldest" ? 1 : -1) * a.received.localeCompare(b.received));
  return <section className="space-y-3" aria-labelledby="inquiries-title">
    <h2 id="inquiries-title" className="font-display text-2xl">פניות ({shown.length}{shown.length !== all.length ? ` מתוך ${all.length}` : ""})</h2>
    <Chips label="נושא" value={topic} onChange={setTopic} options={[{ id: "all", label: `הכול (${all.length})` }, ...FEEDBACK_TOPICS.map(t => ({ id: t.id, label: `${t.label} (${count(c => c.topic === t.id)})` }))]} />
    <div className="grid sm:grid-cols-2 gap-2">
      <Segmented label="סינון לפי מצב" value={filter} onChange={setFilter} options={[{ id: "all", label: "הכול" }, { id: "waiting", label: `ממתינות לתשובה (${count(c => c.waiting)})` }]} />
      <Segmented label="סדר" value={sort} onChange={setSort} options={[{ id: "oldest", label: "לפי סדר קבלה" }, { id: "newest", label: "החדשות קודם" }]} />
    </div>
    {shown.length ? <ul className="space-y-2">{shown.map(({ key, received: _r, topic: _t, ...conversation }) => <Conversation key={key} {...conversation} />)}</ul> : <p className="text-sm text-ink-soft">אין פניות שמתאימות לסינון.</p>}
  </section>;
}

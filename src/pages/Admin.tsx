import { FEEDBACK_TOPICS, conversationTopic, topicLabel } from "../lib/feedbackTopics";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FEEDBACK_URL } from "../lib/feedback";
import { dateTime } from "../lib/format";
import { nextRun } from "../lib/runSchedule";
import { getToken } from "../lib/crowdSession";
import { setOwnerBrowser } from "../lib/visits";
import { Chips, Segmented } from "../components/Choice";
import { Drawer } from "../components/Drawer";
import { Btn, Notice } from "./guess/ui";
import AdminGuesses from "./AdminGuesses";
import AdminGroups from "./AdminGroups";
import AdminBlocs from "./AdminBlocs";
import AdminMcp from "./AdminMcp";
import { Tiles } from "../components/Tiles";

/**
 * ממשק ניהול: כל הפניות עם תשובה, וכניסות, משתמשים ונפילות לפי יום.
 * כניסה: מפתח בקישור (?k=) — נשמר בדפדפן הזה בלבד ונמחק מהכתובת, ובשרת רק גיבוב שלו (admin_keys); או חשבון שהוגדר מנהל
 * (טבלת admins; הכרעת בעלים 9.10.2026) — הסשן של החשבון משמש כמפתח, בלי קישור.
 */
const KEY = "elections26.admin";
type Item = { author: "visitor" | "team"; text: string; created_at: string; topic?: string; page?: string; via?: string };
type Thread = { id: number | string; items: Item[]; updated_at: string; waiting: boolean };
type Day = { day: string; visits: number; users: number; guessUsers?: number; communityUsers?: number; blocked: number; blindSaved: number; relaySaved: number; autoFailures: number };
type SupportThread = { participant: string; status: string; updated_at: string; messages: Item[] };
/** טיוטת תשובה של הסקירה המתוזמנת: לא מוצגת לגולש עד אישור (הכרעת בעלים 12.10.2026) */
type Draft = { id: number; kind: "feedback" | "support"; target: string; text: string; reason?: string | null; created_at: string };
type DraftActions = { approve: (id: number, text: string) => Promise<boolean>; remove: (id: number) => Promise<boolean>; release: (kind: Held["kind"], target: string) => Promise<boolean> };
type Held = { kind: "feedback" | "support"; target: string; reason?: string | null; created_at: string };
type Data = { agentLastRun?: string | null; held?: Held[]; drafts?: Draft[]; accountStatsAvailable?: boolean; days: Day[]; totalVisitors: number; totalVisits?: number; failures?: { since: string | null; total: number }; feedback: Thread[]; support: { stats: Record<string, number>; threads: SupportThread[] } | null };

const when = (s: string) => dateTime(s);

function DraftBox({ draft, actions }: { draft: Draft; actions: DraftActions }) {
  const [text, setText] = useState(draft.text);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<boolean>) => { setBusy(true); await fn(); setBusy(false); };
  return (
    <div className="border border-dashed border-ink-faint rounded-theme p-2 space-y-2">
      <p className="text-xs font-bold text-ink-soft">טיוטה לאישור · {when(draft.created_at)}{draft.reason ? ` · ${draft.reason}` : ""}</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="נוסח הטיוטה" className="w-full rounded-theme border border-paper-line bg-paper text-ink p-2 text-sm" />
      <div className="flex gap-2 flex-wrap">
        <Btn kind="primary" disabled={busy || !text.trim()} onClick={() => run(() => actions.approve(draft.id, text.trim()))}>אישור ופרסום</Btn>
        <Btn disabled={busy} onClick={() => run(() => actions.remove(draft.id))}>מחיקת הטיוטה</Btn>
      </div>
    </div>
  );
}

function Conversation({ title, items, waiting, onReply, drafts = [], draftActions, held }: { title: string; items: Item[]; waiting: boolean; onReply: (text: string) => Promise<boolean>; drafts?: Draft[]; draftActions?: DraftActions; held?: Held }) {
  const [open, setOpen] = useState(waiting || drafts.length > 0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const first = items.find((i) => i.author === "visitor") ?? items[0];
  return (
    <li className="bg-paper-card border border-paper-line rounded-theme">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full text-start p-3 flex gap-2 items-start min-h-[44px]">
        <span className={`shrink-0 mt-1 w-2.5 h-2.5 rounded-full ${waiting ? "bg-warn" : "bg-paper-line"}`} aria-label={waiting ? "ממתין לתשובה" : "נענה"} />
        <span className="flex-1 min-w-0">
          <span className="text-xs text-ink-soft block">{title} · {topicLabel(conversationTopic(items))} · התקבלה {when(items[0].created_at)} · {items.length} הודעות{waiting ? " · ממתין לתשובה" : ""}{drafts.length ? ` · ${drafts.length} טיוטות` : ""}{held ? " · בהשהיה" : ""}</span>
          <span className="block truncate">{first?.text.split("\n")[0]}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <ul className="flex flex-col gap-2">
            {items.map((m, i) => (
              <li key={i} className={`max-w-[90%] rounded-theme px-3 py-2 text-sm ${m.author === "team" ? "self-end bg-accent-soft" : "self-start bg-paper-line/50"}`}>
                <p className="text-xs font-bold text-ink-soft mb-1">{m.author === "team" ? "צוות" : "גולש"} · {when(m.created_at)}{m.page ? ` · ${m.page}` : ""}{m.via ? ` · נכתב דרך עוזר AI (${m.via})` : ""}</p>
                <p className="whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{m.text}</p>
              </li>
            ))}
          </ul>
          {held && draftActions && (
            <div className="flex gap-2 items-center flex-wrap text-sm">
              <span className="text-warn font-bold">בהשהיה: כל תשובה אליו נשמרת כטיוטה{held.reason ? ` (${held.reason})` : ""}.</span>
              <Btn onClick={() => void draftActions.release(held.kind, held.target)}>אישור המשתתף</Btn>
            </div>
          )}
          {draftActions && drafts.map((d) => <DraftBox key={d.id} draft={d} actions={draftActions} />)}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="תשובה" className="w-full rounded-theme border border-paper-line bg-paper text-ink p-2 text-sm" placeholder="תשובה לגולש…" />
          <Btn kind="primary" disabled={busy || !text.trim()} onClick={async () => { setBusy(true); if (await onReply(text.trim())) setText(""); setBusy(false); }}>{busy ? "שולח…" : "שליחת תשובה"}</Btn>
        </div>
      )}
    </li>
  );
}

/** תיבה קטנה עם שני מספרים (למשל ס״ה והיום); alert = צבע אזהרה כשיש מה לטפל בו */
function Pair({ label, a, b, alert = false, small = false }: { label: string; a: [string, string | number]; b: [string, string | number]; alert?: boolean; small?: boolean }) {
  return (
    <div className={`bg-paper-card border rounded-theme p-2 sm:p-3 min-w-0 ${alert ? "border-warn" : "border-paper-line"}`}>
      <p className="text-xs text-ink-soft leading-tight">{label}</p>
      <div className="flex gap-2 sm:gap-4 mt-1 flex-wrap">
        {[a, b].map(([name, n]) => (
          <p key={name} className="min-w-0"><span className="block text-[11px] text-ink-soft">{name}</span><span className={`font-num tabular leading-none ${small ? "text-sm sm:text-base" : "text-xl sm:text-2xl"}`}>{n}</span></p>
        ))}
      </div>
    </div>
  );
}

function ByDay({ days }: { days: Day[] }) {
  return (
    <section className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular">
          <thead><tr className="text-ink-soft text-start">{["יום", "כניסות", "משתמשים", "נכנסו להשערה", "נכנסו לסטטיסטיקות", "נפילות (דיווח אוטומטי)", "חסימה מלאה", "נשמר בעקיפה", "נשמר בלי תשובה"].map((h) => <th key={h} className="text-start font-medium py-1 pe-3">{h}</th>)}</tr></thead>
          <tbody>{days.map((d) => <tr key={d.day} className="border-t border-paper-line"><td className="py-1 pe-3">{d.day}</td><td>{d.visits}</td><td>{d.users}</td><td>{d.guessUsers ?? "—"}</td><td>{d.communityUsers ?? "—"}</td><td>{d.autoFailures}</td><td>{d.blocked}</td><td>{d.relaySaved}</td><td>{d.blindSaved}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">ימים לפי שעון UTC. "נפילות" = דיווחי כשל חיבור אוטומטיים; "חסימה מלאה" = בדיקות חיבור שבהן כל המסלולים נחסמו. "שמרו" = אנשים ששמרו לפחות פעם אחת, כולם בדשבורד; "פעולות שמירה" = כל לחיצה על שמירה (מנדטים וגושים נספרים בנפרד, וכל שינוי נספר שוב). "מייל מאומת (בקישור)" = חשבונות שאימתו את המייל דרך הקישור שנשלח אליהם, בלי אלה ש-Google אימת; "חשבון Google" = חשבונות שנכנסו עם Google. "רשומות ריקות בלי משתמש" = ברובן כפילויות מהתקלה שיצרה 3 רשומות לכל ניסיון (תוקנה 8/10), ולא אנשים.</p>
    </section>
  );
}

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const [key, setKey] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  type DrawerId = "dashboard" | "inquiries" | "guesses" | "blocs" | "groups" | "ai" | "mcp";
  const [guessCounts, setGuessCounts] = useState({ pending: 0, rejected: 0 });
  const pendingGuesses = guessCounts.pending;
  // פרסום אחרון של האתר ב-GitHub (ממשק ציבורי); בלי תשובה — "—"
  const [lastPublish, setLastPublish] = useState<string | null>(null);
  useEffect(() => {
    fetch("https://api.github.com/repos/hopetohelp/26/deployments?environment=github-pages&per_page=1").then((r) => r.json()).then((d) => setLastPublish(Array.isArray(d) && d[0]?.created_at ? d[0].created_at : null)).catch(() => setLastPublish(null));
  }, []);
  const [open, setOpen] = useState<Set<DrawerId>>(new Set());
  const toggle = (id: DrawerId) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

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
    try { setData(await api("/admin/data")); setOwnerBrowser(true); } catch (e) { setError((e as Error).message || "אין חיבור לשרת."); }
    // מונה השערות ממתינות לתג על המגירה (המגירה עצמה נטענת רק כשפותחים אותה)
    try { const rows = ((await api("/admin/guesses")) as { rows: { status: string }[] }).rows; setGuessCounts({ pending: rows.filter((r) => r.status === "pending").length, rejected: rows.filter((r) => r.status === "rejected").length }); } catch { /* בלי מונה — בלי תג */ }
  };
  useEffect(() => { if (credential && FEEDBACK_URL) void load(); }, [credential]); // eslint-disable-line react-hooks/exhaustive-deps
  // יש ממתינים או טיוטות ⇐ מגירת הפניות נפתחת לבד, פעם אחת
  const needsAttention = !!data && ((data.feedback.filter((t) => t.waiting).length + (data.support?.threads.filter((t) => t.status === "new").length ?? 0) + (data.drafts?.length ?? 0)) > 0);
  const autoOpened = useRef(false);
  useEffect(() => { if (needsAttention && !autoOpened.current) { autoOpened.current = true; setOpen((o) => new Set(o).add("inquiries")); } }, [needsAttention]);
  const reply = (kind: "feedback" | "support", id: number | string) => async (text: string) => {
    try { await api("/admin/reply", { kind, id, text }); await load(); return true; } catch (e) { setError((e as Error).message); return false; }
  };

  const draftActions: DraftActions = {
    approve: async (id, text) => { try { await api("/admin/draft/approve", { id, text }); await load(); return true; } catch (e) { setError((e as Error).message); return false; } },
    release: async (kind, target) => { try { await api("/admin/release", { kind, target }); await load(); return true; } catch (e) { setError((e as Error).message); return false; } },
    remove: async (id) => { try { await api("/admin/draft/delete", { id }); await load(); return true; } catch (e) { setError((e as Error).message); return false; } },
  };

  if (!credential) return <Notice>הממשק זמין רק לחשבון מנהל (אחרי כניסה) או דרך קישור הניהול.</Notice>;
  // "היום" לפי יום UTC, כמו בשרת: אם עוד לא נספרה כניסה היום — אפסים, ולא נתוני אתמול
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = data?.days.find((d) => d.day === todayKey);
  const next = nextRun(Date.now());
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
          {/* תיבות קטנות מאוחדות (הכרעת בעלים 12.10.2026); הדשבורד המלא — במגירה אחת */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="סיכום">
            <Pair label="משתמשים" a={["ס״ה", data.support?.stats.participants ?? "—"]} b={["היום", data.support?.stats.participantsToday ?? "—"]} />
            <Pair label="שמרו השערה או הצבעה" a={["ס״ה", data.support?.stats.savers ?? "—"]} b={["היום", data.support?.stats.saversToday ?? "—"]} />
            <Pair label="נכנסו" a={["ס״ה", data.totalVisitors]} b={["היום", today?.users ?? 0]} />
            <Pair label="ממתינים לתשובה וטיוטות" a={["ממתינים", waiting]} b={["טיוטות", data.drafts?.length ?? 0]} alert={waiting + (data.drafts?.length ?? 0) > 0} />
            <Pair label="השערות" a={["ממתינות", guessCounts.pending]} b={["נדחו", guessCounts.rejected]} alert={guessCounts.pending > 0} />
            <Pair label="נפילות" a={["מאז האיפוס", data.failures?.total ?? "—"]} b={["היום", today?.autoFailures ?? 0]} alert={(data.failures?.total ?? 0) > 0} />
          </div>
          {/* הרענון של GitHub והסשן המרוכז רצים באותה שעה (src/lib/runSchedule.ts); בשבת — מושבתים */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3" role="group" aria-label="ריצות">
            <Pair label="פרסום האתר (GitHub)" a={["אחרון", lastPublish ? when(lastPublish) : "—"]} b={["הבא", next ? when(new Date(next).toISOString()) : "—"]} small />
            <Pair label="סוכן" a={["אחרון", data.agentLastRun ? when(data.agentLastRun) : "—"]} b={["הבא", next ? when(new Date(next).toISOString()) : "—"]} small />
          </div>

          {data.accountStatsAvailable === false && <Notice tone="warn">מספרי החשבונות והעברת שיחות ישנות אינם זמינים כרגע. השיחות שכבר נשמרו בשרת ההערות זמינות למענה.</Notice>}

          {/* הדשבורד המלא וכל מה שמעבר לו — במגירות (הכרעת בעלים 12.10.2026). תוכן מגירה נטען רק כשפותחים אותה. */}
          <div className="border-t border-paper-line">
            <Drawer title="דשבורד מלא" open={open.has("dashboard")} onToggle={() => toggle("dashboard")}>
              <div className="space-y-5">
                <Tiles title="היום" note="לפי יום UTC" tiles={[
                  ["כניסות היום", today?.visits ?? 0],
                  ["משתמשים היום", today?.users ?? 0],
                  ["נכנסו להשערה היום", today?.guessUsers ?? 0],
                  ["נכנסו לסטטיסטיקות היום", today?.communityUsers ?? 0],
                  ["שמרו היום (אנשים)", data.support?.stats.saversToday ?? "—"],
                  ["פעולות שמירה היום", data.support?.stats.savesToday ?? "—"],
                  ["רשומות היום", data.support?.stats.participantsToday ?? "—"],
                  ["ממתינים לתשובה", waiting],
                  ["טיוטות לאישור", data.drafts?.length ?? 0],
                ]} />
                <Tiles title="סך הכול" note="מהתחלה (6/10)" tiles={[
                  ["כניסות", data.totalVisits ?? "—"],
                  ["משתמשים מצטבר", data.totalVisitors],
                  ["שמרו (בדשבורד)", data.support?.stats.savers ?? "—"],
                  ["רשומות במאגר", data.support?.stats.participants ?? "—"],
                  ["חשבון Google", data.support?.stats.googleAccounts ?? "—"],
                  ["מייל מאומת (בקישור)", data.support?.stats.verifiedEmails ?? "—"],
                ]} />
                <Tiles title="נפילות" note={data.failures?.since ? `נספרות מאז האיפוס: ${when(data.failures.since)}` : "נספרות מההתחלה"} tiles={[
                  ["נפילות סך הכול", data.failures?.total ?? "—"],
                  ["נפילות היום", today?.autoFailures ?? 0],
                  ["חסימה מלאה היום", today?.blocked ?? 0],
                  ["נשמר בעקיפה היום", today?.relaySaved ?? 0],
                  ["נשמר בלי תשובה היום", today?.blindSaved ?? 0],
                ]} />
                <section className="space-y-2"><h3 className="font-display text-xl">לפי יום</h3><ByDay days={data.days} /></section>
              </div>
            </Drawer>
            <Drawer title="פניות והודעות" open={open.has("inquiries")} onToggle={() => toggle("inquiries")} badge={waiting + (data.drafts?.length ?? 0) > 0 ? <span className="text-sm font-num tabular bg-warn text-paper rounded-full px-2" aria-label={`${waiting} ממתינים לתשובה, ${data.drafts?.length ?? 0} טיוטות`}>{waiting + (data.drafts?.length ?? 0)}</span> : undefined}>
              <InquirySections data={data} reply={reply} draftActions={draftActions} />
            </Drawer>
            <Drawer title="השערות הגולשים" open={open.has("guesses")} onToggle={() => toggle("guesses")} badge={pendingGuesses > 0 ? <span className="text-sm font-num tabular bg-warn text-paper rounded-full px-2" aria-label={`${pendingGuesses} השערות ממתינות לאישור`}>{pendingGuesses}</span> : undefined}><AdminGuesses api={api} onCounts={setGuessCounts} /></Drawer>
            <Drawer title="גושים שהוגדרו" open={open.has("blocs")} onToggle={() => toggle("blocs")}><AdminBlocs api={api} /></Drawer>
            <Drawer title="קבוצות" open={open.has("groups")} onToggle={() => toggle("groups")}><AdminGroups api={api} /></Drawer>
            <Drawer title="מפתח AI לתשובות" open={open.has("ai")} onToggle={() => toggle("ai")}><AiKey api={api} /></Drawer>
            <Drawer title="שרת העוזרים (MCP)" open={open.has("mcp")} onToggle={() => toggle("mcp")}><AdminMcp credential={credential} /></Drawer>
          </div>
        </>
      )}
    </div>
  );
}


type Sort = "oldest" | "newest";
type Filter = "all" | "waiting" | "drafts";

/**
 * מפתח AI (הכרעת בעלים 12.10.2026): נשמר בשרת מוצפן ואינו מוצג שוב — רק "מוגדר" ומתי.
 * דרך נוספת: סוד AI_API_KEY בהגדרות הריפו ב-GitHub, שנפרס לשרת. כרגע התשובות עדיין בסקירה המתוזמנת.
 */
function AiKey({ api }: { api: (path: string, body?: unknown) => Promise<{ admin: { updated_at: string } | null; server: boolean }> }) {
  const [state, setState] = useState<{ admin: { updated_at: string } | null; server: boolean } | null>(null);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api("/admin/ai-key").then(setState, () => setMsg("לא ניתן לבדוק את מצב המפתח.")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (key: string | null) => {
    setMsg(null);
    try { setState(await api("/admin/ai-key", { key })); setValue(""); setMsg(key ? "המפתח נשמר." : "המפתח נמחק."); } catch { setMsg("השמירה נכשלה. בדקו שהמפתח הועתק במלואו."); }
  };
  return (
    <section className="space-y-2" aria-labelledby="ai-key-title">
      <h3 id="ai-key-title" className="font-bold text-lg">מפתח AI לתשובות</h3>
      <p className="text-sm text-ink-soft">
        {state?.admin ? `נשמר ממסך הניהול (${when(state.admin.updated_at)}).` : "לא נשמר מפתח ממסך הניהול."}{" "}
        {state?.server ? "מוגדר גם כסוד בשרת." : ""} המפתח נשמר מוצפן ואינו מוצג שוב. כרגע התשובות נכתבות בסקירה המתוזמנת.
      </p>
      <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => { e.preventDefault(); if (value.trim()) void save(value.trim()); }}>
        <label className="flex-1 min-w-[12rem]"><span className="sr-only">מפתח AI</span>
          <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="הדביקו מפתח API" className="w-full rounded-theme border border-paper-line bg-paper text-ink p-2 text-sm" />
        </label>
        <Btn type="submit" kind="primary" disabled={!value.trim()}>שמירה</Btn>
        {state?.admin && <Btn onClick={() => void save(null)}>מחיקת המפתח</Btn>}
      </form>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </section>
  );
}

/**
 * כל הפניות ברשימה אחת לפי סדר קבלתן — לפי ההודעה הראשונה בכל שיחה (הכרעת בעלים 9.10.2026) — עם סינון לפי נושא ולפי "ממתינות לתשובה".
 * שני מקורות השמירה מוצגים יחד; נתיב התשובה המקורי נשמר לכל שיחה.
 */
export function InquirySections({ data, reply, draftActions }: { data: Data; reply: (kind: "feedback" | "support", id: number | string) => (text: string) => Promise<boolean>; draftActions?: DraftActions }) {
  const [topic, setTopic] = useState<"all" | (typeof FEEDBACK_TOPICS)[number]["id"]>("all");
  const [filter, setFilter] = useState<Filter>("waiting");
  const [sort, setSort] = useState<Sort>("newest");
  const drafts = data.drafts ?? [];
  const held = data.held ?? [];
  const all = [
    ...data.feedback.map(thread => ({ key: `feedback-${thread.id}`, title: `פנייה ${thread.id}`, items: thread.items, waiting: thread.waiting, onReply: reply("feedback", thread.id), drafts: drafts.filter(d => d.kind === "feedback" && d.target === String(thread.id)), held: held.find(h => h.kind === "feedback" && h.target === String(thread.id)) })),
    ...(data.support?.threads ?? []).map(thread => ({ key: `support-${thread.participant}`, title: "משתמש רשום", items: thread.messages, waiting: thread.status === "new", onReply: reply("support", thread.participant), drafts: drafts.filter(d => d.kind === "support" && d.target === thread.participant), held: held.find(h => h.kind === "support" && h.target === thread.participant) })),
  ].filter(c => c.items.length).map(c => ({ ...c, received: c.items[0].created_at, topic: conversationTopic(c.items) }));
  const count = (pick: (c: (typeof all)[number]) => boolean) => all.filter(pick).length;
  const shown = all
    .filter(c => (topic === "all" || c.topic === topic) && (filter === "all" || (filter === "waiting" ? c.waiting : c.drafts.length > 0 || !!c.held)))
    .sort((a, b) => (sort === "oldest" ? 1 : -1) * a.received.localeCompare(b.received));
  return <section className="space-y-3" aria-labelledby="inquiries-title">
    <h3 id="inquiries-title" className="font-bold text-lg">פניות ({shown.length}{shown.length !== all.length ? ` מתוך ${all.length}` : ""})</h3>
    <Chips label="נושא" value={topic} onChange={setTopic} options={[{ id: "all", label: `הכול (${all.length})` }, ...FEEDBACK_TOPICS.map(t => ({ id: t.id, label: `${t.label} (${count(c => c.topic === t.id)})` }))]} />
    <div className="grid sm:grid-cols-2 gap-2">
      <Segmented label="סינון לפי מצב" value={filter} onChange={setFilter} options={[{ id: "all", label: "הכול" }, { id: "waiting", label: `ממתינות לתשובה (${count(c => c.waiting)})` }, { id: "drafts", label: `טיוטות והשהיות (${count(c => c.drafts.length > 0 || !!c.held)})` }]} />
      <Segmented label="סדר" value={sort} onChange={setSort} options={[{ id: "oldest", label: "לפי סדר קבלה" }, { id: "newest", label: "החדשות קודם" }]} />
    </div>
    {shown.length ? <ul className="space-y-2">{shown.map(({ key, received: _r, topic: _t, ...conversation }) => <Conversation key={key} {...conversation} draftActions={draftActions} />)}</ul> : <p className="text-sm text-ink-soft">אין פניות שמתאימות לסינון.</p>}
  </section>;
}

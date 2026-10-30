import { PageTitle } from "../components/ui";
import { FEEDBACK_TOPICS, conversationTopic, topicLabel } from "../lib/feedbackTopics";
import Linkified from "../components/Linkified";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FEEDBACK_URL } from "../lib/feedback";
import { HIDDEN_SCREENS, setScreenModes, type HiddenScreen, type ScreenMode } from "../lib/screenVisibility";
import { dateTime, num } from "../lib/format";
import { nextRun } from "../lib/runSchedule";
import { getToken } from "../lib/crowdSession";
import { call } from "../lib/crowdApi";
import { setOwnerBrowser } from "../lib/visits";
import VideoStats from "../components/VideoStats";
import type { VideoStats as VideoStatsT } from "../lib/crowdApi";
import { Segmented } from "../components/Choice";
import { Drawer } from "../components/Drawer";
import { Btn, Notice } from "./guess/ui";
import AdminGuesses from "./AdminGuesses";
import AdminGroups from "./AdminGroups";
import AdminBlocs from "./AdminBlocs";
import AdminMcp from "./AdminMcp";
import StatsCharts from "../components/StatsCharts";
import { STAT_METRICS, STAT_TOPICS, screenName, type StatKey, type StatsData } from "../lib/statsMetrics";

/**
 * ממשק ניהול: כל הפניות עם תשובה, וכניסות, משתמשים ונפילות לפי יום.
 * כניסה: מפתח בקישור (?k=) — נשמר בדפדפן הזה בלבד ונמחק מהכתובת, ובשרת רק גיבוב שלו (admin_keys); או חשבון שהוגדר מנהל
 * (טבלת admins; הכרעת בעלים 9.10.2026) — הסשן של החשבון משמש כמפתח, בלי קישור.
 */
const KEY = "elections26.admin";
/** הנתונים האחרונים של מסך הניהול — לטעינה מיידית; רק בדפדפן של המנהל, נדרס בכל סנכרון */
const CACHE_KEY = "elections26.adminCache";
type Item = { author: "visitor" | "team"; text: string; created_at: string; topic?: string; page?: string; via?: string };
type Thread = { id: number | string; items: Item[]; updated_at: string; waiting: boolean };
type Day = { day: string; visits: number; users: number; guessUsers?: number; communityUsers?: number; jdnClicks?: number; blocked: number; blindSaved: number; relaySaved: number; autoFailures: number };
export type SupportThread = { participant: string; status: string; updated_at: string; messages: Item[] };
/** טיוטת תשובה של הסקירה המתוזמנת: לא מוצגת לגולש עד אישור (הכרעת בעלים 12.10.2026) */
export type Draft = { id: number; kind: "feedback" | "support"; target: string; text: string; reason?: string | null; created_at: string };
type DraftActions = { approve: (id: number, text: string) => Promise<boolean>; remove: (id: number) => Promise<boolean>; release: (kind: Held["kind"], target: string) => Promise<boolean> };
export type Held = { kind: "feedback" | "support"; target: string; reason?: string | null; created_at: string };
/** videoAnon = סרטונים של גולשים לא מחוברים (שרת ההערות); support.stats.videos = מחוברים (שרת ההשתתפות) */
type EmbedRow = { screen: string; kind: "view" | "copy"; host: string; n: number };

/** הטמעות (הכרעת בעלים 28.10.2026): לכל מסך — צפיות והעתקות קוד, ורשימת האתרים המארחים לפי צפיות */
function EmbedStats({ rows }: { rows: EmbedRow[] }) {
  const screens = [["results-2026", "תוצאות"], ["changes", "מה השתנה"], ["changes-graphs", "גרפי המעבר"]] as const;
  const sum = (f: (r: EmbedRow) => boolean) => rows.filter(f).reduce((a, r) => a + r.n, 0);
  const hosts = [...rows.filter((r) => r.kind === "view").reduce((m, r) => m.set(r.host, (m.get(r.host) ?? 0) + r.n), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p className="text-sm font-bold mb-2">הטמעות באתרים אחרים</p>
      <ul className="grid grid-cols-2 gap-3">
        {screens.map(([id, label]) => (
          <li key={id} className="bg-paper-card border border-paper-line rounded-theme p-3 min-w-0">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="font-num tabular text-3xl leading-none mt-1">{num(sum((r) => r.screen === id && r.kind === "view"))}</p>
            <p className="text-xs text-ink-soft font-num tabular mt-1">צפיות · העתקות קוד {num(sum((r) => r.screen === id && r.kind === "copy"))}</p>
          </li>
        ))}
      </ul>
      {hosts.length > 0 && <ul className="mt-2 text-sm" aria-label="אתרים מארחים">{hosts.map(([h, n]) => <li key={h} className="flex justify-between gap-2"><span dir="ltr">{h === "unknown" ? "אתר לא ידוע" : h}</span><span className="font-num tabular">{num(n)}</span></li>)}</ul>}
      <p className="text-xs text-ink-soft mt-2">צפייה = טעינת חלון מוטמע. נספר רק שם האתר המארח, בלי כתובת העמוד ובלי פרטי הגולש. נספר מ-28/10.</p>
    </div>
  );
}

type Data = { embeds?: EmbedRow[]; jdnHours?: { hour: string; clicks: number }[]; videoAnon?: VideoStatsT; videoAnonRecent?: Record<"data" | "results", VideoStatsT>; agentLastRun?: string | null; held?: Held[]; drafts?: Draft[]; accountStatsAvailable?: boolean; days: Day[]; totalVisitors: number; totalVisits?: number; failures?: { since: string | null; total: number }; feedback: Thread[]; support: { stats: Record<string, number>; threads: SupportThread[] } | null };

const when = (s: string) => dateTime(s);
/** סרטון הנתונים לכל האתר: מחוברים + לא מחוברים (גולש שיצר לפני ההתחברות ואחריה עשוי להיספר פעמיים) */
const sumVideos = (a?: VideoStatsT, b?: VideoStatsT): VideoStatsT => ({ makers: (a?.makers ?? 0) + (b?.makers ?? 0), withGuess: (a?.withGuess ?? 0) + (b?.withGuess ?? 0), named: (a?.named ?? 0) + (b?.named ?? 0), videos: (a?.videos ?? 0) + (b?.videos ?? 0) });

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
                <p className="whitespace-pre-wrap break-words max-h-64 overflow-y-auto"><Linkified text={m.text} /></p>
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

/** שעה (גדולה) ותאריך יום/חודש (קטן) בשעון ישראל — לתיבות הריצות, באותו גודל כמו שאר המספרים */
function Clock({ at }: { at: string | number | null | undefined }) {
  if (!at) return <>—</>;
  const d = new Date(at);
  const time = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" }).format(d);
  return <>{time}<span className="block text-[11px] font-sans text-ink-soft mt-0.5">{date}</span></>;
}

/** תיבה קטנה עם שני מספרים (למשל ס״ה והיום); alert = צבע אזהרה כשיש מה לטפל בו */
function Pair({ label, a, b, alert = false }: { label: string; a: [string, ReactNode]; b: [string, ReactNode]; alert?: boolean }) {
  return (
    <div className={`bg-paper-card border rounded-theme p-2 sm:p-3 min-w-0 text-center ${alert ? "border-warn" : "border-paper-line"}`}>
      <p className="text-xs text-ink-soft leading-tight">{label}</p>
      <div className="flex justify-center mt-1">
        {[a, b].map(([name, n]) => (
          <p key={name} className="min-w-0 px-2 sm:px-3 border-s border-paper-line first:border-s-0"><span className="block text-[11px] text-ink-soft whitespace-nowrap">{name}</span><span className="block font-num tabular leading-none whitespace-nowrap text-xl">{n}</span></p>
        ))}
      </div>
    </div>
  );
}

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const [key, setKey] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  // העמוד עולה מיד מהנתונים האחרונים שנשמרו בדפדפן, והסנכרון עם השרת רץ ברקע (הכרעת בעלים 26.10.2026)
  const [data, setData] = useState<Data | null>(() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Data | null; } catch { return null; } });
  const [syncing, setSyncing] = useState(false);
  // דשבורד הסטטיסטיקה (הכרעת בעלים 28.10.2026): כל המספרים והגרפים מבקשה אחת; עולה מיד מהשמור בדפדפן
  const [stats, setStats] = useState<StatsData | null>(() => { try { return JSON.parse(localStorage.getItem(`${CACHE_KEY}.series`) ?? "null") as StatsData | null; } catch { return null; } });
  const [error, setError] = useState<string | null>(null);
  type DrawerId = "dashboard" | "inquiries" | "guesses" | "blocs" | "groups" | "ai" | "mcp" | "screens";
  const [guessCounts, setGuessCounts] = useState<{ pending: number; rejected: number }>(() => { try { return JSON.parse(localStorage.getItem(`${CACHE_KEY}.guesses`) ?? "null") ?? { pending: 0, rejected: 0 }; } catch { return { pending: 0, rejected: 0 }; } });
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

  // קישור חד-פעמי להגדרת מנהל (?claim=): החשבון הפתוח בדפדפן הזה הופך למנהל. בלי כניסה — הקוד נשאר בכתובת עד שנכנסים ופותחים שוב
  const [claim, setClaim] = useState<"busy" | "ok" | "signin" | "bad" | null>(null);
  const claimed = useRef(false);
  useEffect(() => {
    const code = params.get("claim");
    if (!code || claimed.current) return;
    const token = getToken();
    if (!token) { setClaim("signin"); return; }
    claimed.current = true;
    setClaim("busy");
    params.delete("claim");
    setParams(params, { replace: true });
    call("/admin/claim", { method: "POST", token, body: { code } }).then(() => { setClaim("ok"); void load(); }, () => setClaim("bad"));
  }, [params, setParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSyncing(true);
    // שתי הבקשות במקביל, כל אחת מעדכנת את המסך כשהיא חוזרת
    await Promise.all([
      api("/admin/data").then((d: Data) => { setData(d); setOwnerBrowser(true); try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* בלי אחסון — בלי טעינה מיידית בפעם הבאה */ } }, (e) => setError((e as Error).message || "אין חיבור לשרת.")),
      api("/admin/series").then((d: StatsData) => { setStats(d); try { localStorage.setItem(`${CACHE_KEY}.series`, JSON.stringify(d)); } catch { /* כנ"ל */ } }, () => { /* בלי סדרות — המסך נשאר עם השמור */ }),
      // מונה השערות ממתינות לתג על המגירה (המגירה עצמה נטענת רק כשפותחים אותה)
      api("/admin/guesses").then((r: { rows: { status: string }[] }) => { const c = { pending: r.rows.filter((x) => x.status === "pending").length, rejected: r.rows.filter((x) => x.status === "rejected").length }; setGuessCounts(c); try { localStorage.setItem(`${CACHE_KEY}.guesses`, JSON.stringify(c)); } catch { /* כנ"ל */ } }, () => { /* בלי מונה — בלי תג */ }),
    ]);
    setSyncing(false);
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

  const claimNotice = claim && (
    <Notice tone={claim === "ok" ? "calm" : "warn"}>
      {claim === "busy" && "מגדיר את החשבון כמנהל…"}
      {claim === "ok" && "החשבון הזה הוגדר כמנהל. הקישור כבר אינו תקף."}
      {claim === "signin" && "כדי להגדיר מנהל צריך להיכנס קודם לחשבון באזור האישי, ואז לפתוח את הקישור שוב."}
      {claim === "bad" && "הקישור אינו תקף: הוא כבר נוצל, פג תוקפו, או שהכניסה לחשבון פקעה."}
    </Notice>
  );
  if (!credential || (claim === "signin" && !key)) return <div className="space-y-3"><PageTitle>ניהול</PageTitle>{claimNotice}{!credential && <Notice>הממשק זמין רק לחשבון מנהל (אחרי כניסה) או דרך קישור הניהול.</Notice>}</div>;
  const stat = (k: StatKey) => stats?.series.find((x) => x.key === k);
  // כניסות לכל מסך בנפרד (הכרעת בעלים 28.10.2026), מהמסך הנכנס ביותר
  const screens = (stats?.series ?? []).filter((x) => x.key.startsWith("screen:")).sort((a, b) => b.total - a.total);
  const num = (v: number | undefined) => (v == null ? "—" : v.toLocaleString("he-IL"));
  const next = nextRun(Date.now());
  const waiting = (data?.feedback.filter((t) => t.waiting).length ?? 0) + (data?.support?.threads.filter((t) => t.status === "new").length ?? 0);
  return (
    <div className="space-y-6">
      <meta name="robots" content="noindex" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <PageTitle>ניהול</PageTitle>
        <div className="flex items-center gap-2">
          {syncing && <span role="status" className="text-sm text-ink-soft">מסנכרן…</span>}
          <Btn onClick={load} disabled={syncing}>רענון</Btn>
        </div>
      </div>
      {claimNotice}
      {error && claim !== "ok" && <Notice tone="warn">{error}</Notice>}
      {!data && !error && <p className="text-ink-soft">טוען…</p>}
      {data && (
        <>
          {/* תיבות קטנות מאוחדות (הכרעת בעלים 12.10.2026); הדשבורד המלא — במגירה אחת */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="סיכום">
            <Pair label="משתמשים" a={["ס״ה", num(stat("users")?.total)]} b={["היום", num(stat("users")?.today)]} />
            <Pair label="ניחושים" a={["כולם", data.support?.stats.guesses ?? "—"]} b={["הגזרה", data.support?.stats.hagzaraGuesses ?? "—"]} />
            <Pair label="כניסות דפדפן" a={["ס״ה", num(stat("browsers")?.total)]} b={["היום", num(stat("browsers")?.today)]} />
            <Pair label="ממתינים לתשובה וטיוטות" a={["ממתינים", waiting]} b={["טיוטות", data.drafts?.length ?? 0]} alert={waiting + (data.drafts?.length ?? 0) > 0} />
            <Pair label="ניחושים" a={["ממתינים", guessCounts.pending]} b={["נדחו", guessCounts.rejected]} alert={guessCounts.pending > 0} />
            <Pair label="נפילות" a={["מאז האיפוס", num(stat("failures")?.total)]} b={["היום", num(stat("failures")?.today)]} alert={(stat("failures")?.today ?? 0) > 0} />
            {/* הרענון של GitHub והסשן המרוכז רצים באותה שעה (src/lib/runSchedule.ts); בשבת — מושבתים */}
            <Pair label="פרסום האתר (GitHub)" a={["אחרון", <Clock at={lastPublish} />]} b={["הבא", <Clock at={next} />]} />
            <Pair label="סוכן" a={["אחרון", <Clock at={data.agentLastRun} />]} b={["הבא", <Clock at={next} />]} />
          </div>

          {/* שני חלונות גרף (הכרעת בעלים 28.10.2026): בוחרים בכל אחד כל נתון */}
          {stats && <StatsCharts storageKey={`${CACHE_KEY}.charts`} defaults={["browsers", "users"]} buckets={stats.buckets.map((t) => ({ t, hourly: true }))}
            options={[...STAT_METRICS.filter((m) => stat(m.key)).map((m) => ({ key: m.key, label: m.label, total: stat(m.key)!.total, today: stat(m.key)!.today, points: stat(m.key)!.points })),
              ...screens.map((x) => ({ key: x.key, label: `כניסות: ${screenName(x.key)}`, total: x.total, today: x.today, points: x.points }))]} />}
          {stats && stats.crowd === false && <Notice tone="warn">נתוני החשבונות והשמירות אינם זמינים כרגע; מוצגים רק נתוני הכניסות והתקלות.</Notice>}
          {data.accountStatsAvailable === false && <Notice tone="warn">מספרי החשבונות והעברת שיחות ישנות אינם זמינים כרגע. השיחות שכבר נשמרו בשרת ההערות זמינות למענה.</Notice>}

          {/* הדשבורד המלא וכל מה שמעבר לו — במגירות (הכרעת בעלים 12.10.2026). תוכן מגירה נטען רק כשפותחים אותה. */}
          <div className="border-t border-paper-line">
            <Drawer title="סטטיסטיקות מלאות" open={open.has("dashboard")} onToggle={() => toggle("dashboard")}>
              <div className="space-y-6">
                {!stats && <p className="text-sm text-ink-soft">טוען…</p>}
                {stats && STAT_TOPICS.map((t) => (
                  <section key={t.id} className="space-y-2" aria-label={t.label}>
                    <h3 className="flex items-baseline gap-2 flex-wrap"><span className="font-display text-xl">{t.label}</span><span className="text-xs text-ink-soft">{t.id === "faults" && data.failures?.since ? `נפילות — מאז האיפוס ${when(data.failures.since)}` : t.note}</span></h3>
                    <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {STAT_METRICS.filter((m) => m.topic === t.id && t.id !== "share" && stat(m.key)).map((m) => (
                        <li key={m.key} className="bg-paper-card border border-paper-line rounded-theme p-3 min-w-0">
                          <p className="text-xs text-ink-soft">{m.label}</p>
                          <p className="font-num tabular text-3xl leading-none mt-1">{num(stat(m.key)!.total)}</p>
                          <p className="text-xs text-ink-soft font-num tabular mt-1">היום {num(stat(m.key)!.today)}</p>
                          <p className="text-[11px] text-ink-soft mt-1">{m.help}</p>
                        </li>
                      ))}
                      {t.id === "saves" && <li className="bg-paper-card border border-paper-line rounded-theme p-3 min-w-0"><p className="text-xs text-ink-soft">ניחוש — הגזרה</p><p className="font-num tabular text-3xl leading-none mt-1">{num(data.support?.stats.hagzaraGuesses)}</p><p className="text-[11px] text-ink-soft mt-1">ניחושים שנספרים בממוצע של קבוצת הגזרה.</p></li>}
                    </ul>
                    {t.id === "entries" && screens.length > 0 && (
                      // תת-מגירה, סגורה בכניסה (הכרעת בעלים 28.10.2026)
                      <details className="group/sc border border-paper-line rounded-theme px-3 [&_summary::-webkit-details-marker]:hidden">
                        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[44px] text-sm font-bold">כניסות עמוד לפי מסך<span aria-hidden="true" className="text-ink-soft text-lg transition-transform group-open/sc:rotate-45">+</span></summary>
                        <div className="pb-3">
                        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {screens.map((x) => (
                            <li key={x.key} className="bg-paper border border-paper-line rounded-theme p-3 min-w-0">
                              <p className="text-xs text-ink-soft truncate">{screenName(x.key)}</p>
                              <p className="font-num tabular text-2xl leading-none mt-1">{num(x.total)}</p>
                              <p className="text-xs text-ink-soft font-num tabular mt-1">היום {num(x.today)}</p>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-ink-soft mt-2">כל פתיחה של המסך; לשוניות בתוך מסך נספרות עם המסך. עד 28/10 — לפי יום, ומאז לפי שעה (גם בגרפים למעלה).</p>
                        </div>
                      </details>
                    )}
                    {t.id === "saves" && (
                      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label="פירוט החשבונות">
                        {([["חשבון Google", "googleAccounts", "חשבונות שנכנסו עם Google."], ["מייל מאומת (בקישור)", "verifiedEmails", "חשבונות שלחצו על קישור האימות."], ["מייל לא מאומת", "unverifiedEmails", "מצב החשבון: יש מייל, הוא לא אומת ואין Google."]] as const).map(([label, k, help]) => (
                          <li key={k} className="bg-paper border border-paper-line rounded-theme p-3 min-w-0"><p className="text-xs text-ink-soft">{label}</p><p className="font-num tabular text-2xl leading-none mt-1">{num(data.support?.stats[k])}</p><p className="text-[11px] text-ink-soft mt-1">{help}</p></li>
                        ))}
                      </ul>
                    )}
                    {/* שיתוף (הכרעת בעלים 28.10.2026): שורה לכל סוג סרטון מהסרטון הראשון, ושורה אחת לתמונות השיתוף */}
                    {t.id === "share" && <>
                      <VideoStats title="סרטון ניחוש" s={sumVideos(data.support?.stats.videos as unknown as VideoStatsT | undefined, data.videoAnon)} />
                      <VideoStats title="סרטון תוצאות" s={sumVideos((data.support?.stats.videos as unknown as { recent?: Record<string, VideoStatsT> } | undefined)?.recent?.results, data.videoAnonRecent?.results)} note="במסך &quot;מה השתנה&quot; אין סרטון — רק תמונה. מחובר נספר לפי חשבון, ולא מחובר לפי דפדפן." />
                      <div>
                        <p className="text-sm font-bold mb-2">תמונות שיתוף</p>
                        <ul className="grid grid-cols-3 gap-3">
                          {(["imgGuess", "imgResults", "imgChanges"] as const).map((k) => (
                            <li key={k} className="bg-paper-card border border-paper-line rounded-theme p-3 min-w-0">
                              <p className="text-xs text-ink-soft">{STAT_METRICS.find((m) => m.key === k)!.label.replace("תמונת ", "")}</p>
                              <p className="font-num tabular text-3xl leading-none mt-1">{num(stat(k)?.total)}</p>
                              <p className="text-xs text-ink-soft font-num tabular mt-1">היום {num(stat(k)?.today)}</p>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-ink-soft mt-2">כל תמונה שנשמרה או שותפה. נספרות מ-28/10 (מה השתנה — מהערב); תמונות מלפני כן לא נספרו.</p>
                      </div>
                      <EmbedStats rows={data.embeds ?? []} />
                    </>}
                  </section>
                ))}
              </div>
            </Drawer>
            <Drawer title="פניות והודעות" open={open.has("inquiries")} onToggle={() => toggle("inquiries")} badge={waiting + (data.drafts?.length ?? 0) > 0 ? <span className="text-sm font-num tabular bg-warn text-paper rounded-full px-2" aria-label={`${waiting} ממתינים לתשובה, ${data.drafts?.length ?? 0} טיוטות`}>{waiting + (data.drafts?.length ?? 0)}</span> : undefined}>
              <InquirySections data={data} reply={reply} draftActions={draftActions} />
            </Drawer>
            <Drawer title="ניחושי הגולשים" open={open.has("guesses")} onToggle={() => toggle("guesses")} badge={pendingGuesses > 0 ? <span className="text-sm font-num tabular bg-warn text-paper rounded-full px-2" aria-label={`${pendingGuesses} ניחושים ממתינים לאישור`}>{pendingGuesses}</span> : undefined}><AdminGuesses api={api} onCounts={setGuessCounts} /></Drawer>
            <Drawer title="גושים שהוגדרו" open={open.has("blocs")} onToggle={() => toggle("blocs")}><AdminBlocs api={api} /></Drawer>
            <Drawer title="קבוצות" open={open.has("groups")} onToggle={() => toggle("groups")}><AdminGroups api={api} /></Drawer>
            <Drawer title="מסכים מוסתרים" open={open.has("screens")} onToggle={() => toggle("screens")}><AdminScreens api={api} /></Drawer>
            <Drawer title="מפתח AI לתשובות" open={open.has("ai")} onToggle={() => toggle("ai")}><AiKey api={api} /></Drawer>
            <Drawer title="שרת העוזרים (MCP)" open={open.has("mcp")} onToggle={() => toggle("mcp")}><AdminMcp credential={credential} /></Drawer>
          </div>
        </>
      )}
    </div>
  );
}


type Filter = "all" | "waiting" | "drafts";

type AiState = { admin: { updated_at: string } | null; server: boolean; mode: "auto" | "drafts"; status: { at: string; ok: boolean; error?: string; provider?: string; published?: number; drafted?: number; skipped?: number; verifiedAt?: string } | null };

/** מצב המפתח והתשובות האוטומטיות במילים: עובד / נכשל / עדיין לא נבדק */
function aiStatusLine(s: AiState): string {
  if (!s.admin && !s.server) return "אין מפתח, ולכן אין תשובות אוטומטיות.";
  if (!s.status) return "המפתח נשמר ויבדק בריצה הקרובה (עד רבע שעה; בשבת לא רצים).";
  const { ok, at, error, published = 0, drafted = 0, skipped = 0 } = s.status;
  if (!ok) return `הבדיקה האחרונה (${when(at)}) נכשלה (${error || "שגיאה"}). בדקו שהמפתח הועתק במלואו ושהשירות פעיל בחשבון הספק.`;
  return `המפתח עובד (נבדק ${when(s.status.verifiedAt || at)}). בריצה האחרונה: ${published} פורסמו, ${drafted} טיוטות, ${skipped} דולגו.`;
}

/**
 * מפתח AI ותשובות אוטומטיות (הכרעת בעלים 12.10.2026 ו-14.10.2026): המפתח נשמר בשרת מוצפן ואינו מוצג שוב.
 * שרת ההערות עונה לשאלות ותאוריות לפי נוהל ההערות: מפרסם רק כשהכול עומד בנוהל, וכל ספק הופך לטיוטה למעלה. "טיוטות בלבד" — מתג עצירה.
 * דרך נוספת למפתח: סוד AI_API_KEY בהגדרות הריפו ב-GitHub, שנפרס לשרת.
 */
/** מסכים שהוסתרו (src/lib/screenVisibility): מוסתר · רק למנהלים · לכולם (הכרעת בעלים 28.10.2026) */
function AdminScreens({ api }: { api: (path: string, body?: unknown) => Promise<{ screens: Partial<Record<HiddenScreen, ScreenMode>> }> }) {
  const [modes, setModes] = useState<Partial<Record<HiddenScreen, ScreenMode>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api("/admin/screens").then(r => setModes(r.screens), () => setMsg("לא ניתן לטעון את ההגדרה.")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = async (id: HiddenScreen, mode: ScreenMode) => {
    setMsg(null);
    try { const r = await api("/admin/screens", { screens: { ...modes, [id]: mode } }); setModes(r.screens); setScreenModes(r.screens); setMsg("נשמר."); } catch { setMsg("השמירה נכשלה."); }
  };
  if (!modes) return <p className="text-sm text-ink-soft">{msg ?? "טוען…"}</p>;
  return <div className="space-y-3">
    {HIDDEN_SCREENS.map(s => <div key={s.id}>
      <p className="font-bold">{s.label} <span className="font-normal text-sm text-ink-soft">({s.where})</span></p>
      <div className="f-seg fit" role="group" aria-label={s.label}>
        {(["off", "admins", "all"] as const).map(m => <button key={m} type="button" aria-pressed={(modes[s.id] ?? "off") === m} onClick={() => void set(s.id, m)}>{{ off: "מוסתר", admins: "רק למנהלים", all: "לכולם" }[m]}</button>)}
      </div>
    </div>)}
    {msg && <p role="status" className="text-sm font-bold">{msg}</p>}
  </div>;
}

function AiKey({ api }: { api: (path: string, body?: unknown) => Promise<AiState> }) {
  const [state, setState] = useState<AiState | null>(null);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api("/admin/ai-key").then(setState, () => setMsg("לא ניתן לבדוק את מצב המפתח.")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (key: string | null) => {
    setMsg(null);
    try { setState(await api("/admin/ai-key", { key })); setValue(""); setMsg(key ? "המפתח נשמר." : "המפתח נמחק."); } catch { setMsg("השמירה נכשלה. בדקו שהמפתח הועתק במלואו."); }
  };
  const setMode = async (mode: "auto" | "drafts") => {
    setMsg(null);
    try { setState(await api("/admin/ai-key", { mode })); setMsg(mode === "auto" ? "תשובות שעומדות בנוהל יתפרסמו אוטומטית." : "מעכשיו כל תשובה תישמר כטיוטה לאישור."); } catch { setMsg("השינוי נכשל."); }
  };
  return (
    <section className="space-y-2" aria-labelledby="ai-key-title">
      <h3 id="ai-key-title" className="font-bold text-lg">מפתח AI לתשובות</h3>
      <p className="text-sm text-ink-soft">
        {state?.admin ? `נשמר ממסך הניהול (${when(state.admin.updated_at)}).` : "לא נשמר מפתח ממסך הניהול."}{" "}
        {state?.server ? "מוגדר גם כסוד בשרת." : ""} המפתח נשמר מוצפן ואינו מוצג שוב.
      </p>
      {state && <p role="status" className="text-sm">{aiStatusLine(state)}</p>}
      <form className="flex gap-2 flex-wrap items-end" onSubmit={(e) => { e.preventDefault(); if (value.trim()) void save(value.trim()); }}>
        <label className="flex-1 min-w-[12rem]"><span className="sr-only">מפתח AI</span>
          <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="הדביקו מפתח API" className="w-full rounded-theme border border-paper-line bg-paper text-ink p-2 text-sm" />
        </label>
        <Btn type="submit" kind="primary" disabled={!value.trim()}>שמירה</Btn>
        {state?.admin && <Btn onClick={() => void save(null)}>מחיקת המפתח</Btn>}
      </form>
      {(state?.admin || state?.server) && (
        <div className="space-y-1">
          <p className="text-sm text-ink-soft">
            {state.mode === "auto"
              ? "תשובות לשאלות ותאוריות שעומדות בכל הנוהל מתפרסמות אוטומטית; כל ספק הופך לטיוטה."
              : "מצב טיוטות בלבד: כל תשובה ממתינה לאישור שלך."}
          </p>
          <Btn onClick={() => void setMode(state.mode === "auto" ? "drafts" : "auto")}>{state.mode === "auto" ? "מעבר לטיוטות בלבד" : "חזרה לפרסום אוטומטי"}</Btn>
        </div>
      )}
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
  const drafts = data.drafts ?? [];
  const held = data.held ?? [];
  const all = [
    ...data.feedback.map(thread => ({ key: `feedback-${thread.id}`, title: `פנייה ${thread.id}`, items: thread.items, waiting: thread.waiting, onReply: reply("feedback", thread.id), drafts: drafts.filter(d => d.kind === "feedback" && d.target === String(thread.id)), held: held.find(h => h.kind === "feedback" && h.target === String(thread.id)) })),
    ...(data.support?.threads ?? []).map(thread => ({ key: `support-${thread.participant}`, title: "משתמש רשום", items: thread.messages, waiting: thread.status === "new", onReply: reply("support", thread.participant), drafts: drafts.filter(d => d.kind === "support" && d.target === thread.participant), held: held.find(h => h.kind === "support" && h.target === thread.participant) })),
  // הסדר לפי הפנייה האחרונה של הגולש בכל שיחה (הכרעת בעלים 25.10.2026), לא לפי ההודעה הראשונה
  ].filter(c => c.items.length).map(c => ({ ...c, received: [...c.items].reverse().find(i => i.author === "visitor")?.created_at ?? c.items[c.items.length - 1].created_at, topic: conversationTopic(c.items) }));
  const count = (pick: (c: (typeof all)[number]) => boolean) => all.filter(pick).length;
  const shown = all
    .filter(c => (topic === "all" || c.topic === topic) && (filter === "all" || (filter === "waiting" ? c.waiting : c.drafts.length > 0 || !!c.held)))
    // תמיד מהחדשה לישנה (הכרעת בעלים 25.10.2026)
    .sort((a, b) => b.received.localeCompare(a.received));
  return <section className="space-y-3" aria-labelledby="inquiries-title">
    <h3 id="inquiries-title" className="font-bold text-lg">פניות ({shown.length}{shown.length !== all.length ? ` מתוך ${all.length}` : ""})</h3>
    <div className="grid sm:grid-cols-2 gap-2">
      <Segmented label="סוג" value={topic} onChange={setTopic} options={[{ id: "all", label: `הכול (${all.length})` }, ...FEEDBACK_TOPICS.map(t => ({ id: t.id, label: `${t.label} (${count(c => c.topic === t.id)})` }))]} />
      <Segmented label="סינון לפי מצב" value={filter} onChange={setFilter} options={[{ id: "all", label: "הכול" }, { id: "waiting", label: `ממתינות לתשובה (${count(c => c.waiting)})` }, { id: "drafts", label: `טיוטות והשהיות (${count(c => c.drafts.length > 0 || !!c.held)})` }]} />
    </div>
    {shown.length ? <ul className="space-y-2">{shown.map(({ key, received: _r, topic: _t, ...conversation }) => <Conversation key={key} {...conversation} draftActions={draftActions} />)}</ul> : <p className="text-sm text-ink-soft">אין פניות שמתאימות לסינון.</p>}
  </section>;
}

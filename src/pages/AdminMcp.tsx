import { useEffect, useState } from "react";
import { MCP_URL } from "../lib/mcp";
import { Tiles } from "../components/Tiles";
import { Btn, Notice } from "./guess/ui";

/**
 * שרת העוזרים (MCP) במסך הניהול (הכרעת בעלים 12.10.2026): לכל כתובת — חיבורים, שיחות, קריאות וכתיבות, היום ו-14 יום,
 * והכפתור שסוגר את הכתובת בלי התחברות. המספרים מהשרת עצמו (worker/mcp/lib/stats.js), בלי מזהים.
 * נטען רק כשפותחים את המגירה. הכניסה — אותה כניסת מנהל של מסך הניהול.
 */
type Counts = { connections: number; sessions: number; reads: number; writes: number };
type Mode = "public" | "mcp";
type Stats = { publicEnabled: boolean; activeConnections: number; since: string; totals: Record<Mode, Counts>; days: ({ day: string } & Record<Mode, Counts>)[]; tools: { tool: string; mode: Mode; n: number }[] };

const SERVERS: { mode: Mode; title: string; path: string }[] = [
  { mode: "mcp", title: "עם התחברות", path: "/mcp" },
  { mode: "public", title: "בלי התחברות", path: "/public" },
];
const ZERO: Counts = { connections: 0, sessions: 0, reads: 0, writes: 0 };
const tiles = (c: Counts): [string, number][] => [["חיבורים", c.connections], ["שיחות", c.sessions], ["קריאות", c.reads], ["כתיבות", c.writes]];

export default function AdminMcp({ credential }: { credential: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const call = async (path: string, body?: unknown) => {
    const r = await fetch(`${MCP_URL}${path}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { authorization: `Bearer ${credential}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) throw new Error("לחשבון הזה אין הרשאת ניהול.");
    if (!r.ok) throw new Error(`שגיאת שרת (${r.status}).`);
    return r.json();
  };
  const load = async () => {
    setError(null);
    try { setStats(await call("/admin/stats")); } catch (e) { setError((e as Error).message || "אין חיבור לשרת."); }
  };
  useEffect(() => { if (MCP_URL && credential) void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setPublic = async (on: boolean) => {
    setBusy(true);
    try { await call("/admin/settings", { publicEnabled: on }); setConfirming(false); await load(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  if (!MCP_URL) return <Notice>שרת העוזרים אינו מחובר לאתר הזה.</Notice>;
  // "היום" לפי יום UTC, כמו בשרת
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = stats?.days.find((d) => d.day === todayKey);
  return (
    <div className="space-y-5">
      {error && <Notice tone="warn">{error}</Notice>}
      {!stats && !error && <p className="text-ink-soft">טוען…</p>}
      {stats && (
        <>
          <section className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-2" aria-label="הכתובת בלי התחברות">
            <p className="text-sm">
              הכתובת בלי התחברות: <strong className={stats.publicEnabled ? "text-ink" : "text-warn"}>{stats.publicEnabled ? "פתוחה" : "סגורה"}</strong>
            </p>
            <p className="text-xs text-ink-soft">כשהיא סגורה, עוזר שמחובר אליה מקבל הודעה שהכתובת סגורה ושאפשר להתחבר עם חשבון. הכתובת עם התחברות ממשיכה לעבוד. השינוי נכנס לתוקף תוך חצי דקה.</p>
            {!confirming && <Btn kind={stats.publicEnabled ? "danger" : "primary"} disabled={busy} onClick={() => (stats.publicEnabled ? setConfirming(true) : void setPublic(true))}>{stats.publicEnabled ? "כיבוי הכתובת בלי התחברות" : "הדלקת הכתובת בלי התחברות"}</Btn>}
            {confirming && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="אישור הכיבוי">
                <span className="text-sm">לסגור את הכתובת בלי התחברות?</span>
                <Btn kind="danger" disabled={busy} onClick={() => void setPublic(false)}>כן, לסגור</Btn>
                <Btn disabled={busy} onClick={() => setConfirming(false)}>ביטול</Btn>
              </div>
            )}
          </section>

          <p className="text-sm">חיבורים פעילים עכשיו (עם התחברות): <span className="font-num tabular font-bold">{stats.activeConnections}</span></p>

          {SERVERS.map(({ mode, title, path }) => (
            <div key={mode} className="space-y-3">
              <h3 className="font-bold">{title} <bdi dir="ltr" className="font-num text-ink-soft">{path}</bdi></h3>
              <Tiles title="היום" note="לפי יום UTC" tiles={tiles(today?.[mode] ?? ZERO)} />
              <Tiles title="14 הימים האחרונים" note={`מאז ${stats.since}`} tiles={tiles(stats.totals[mode])} />
            </div>
          ))}

          <section className="space-y-2" aria-label="לפי יום">
            <h3 className="font-bold">לפי יום</h3>
            {!stats.days.length && <p className="text-sm text-ink-soft">עדיין אין שימוש.</p>}
            {stats.days.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular">
                  <thead>
                    <tr className="text-ink-soft"><th className="text-start font-medium py-1 pe-3" rowSpan={2}>יום</th>{SERVERS.map((s) => <th key={s.mode} colSpan={4} className="text-start font-medium py-1 pe-3">{s.title}</th>)}</tr>
                    <tr className="text-ink-soft">{SERVERS.flatMap((s) => tiles(ZERO).map(([h]) => <th key={s.mode + h} className="text-start font-medium py-1 pe-3">{h}</th>))}</tr>
                  </thead>
                  <tbody>{stats.days.map((d) => <tr key={d.day} className="border-t border-paper-line"><td className="py-1 pe-3">{d.day}</td>{SERVERS.flatMap((s) => tiles(d[s.mode]).map(([h, n]) => <td key={s.mode + h} className="pe-3">{n}</td>))}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>

          {stats.tools.length > 0 && (
            <section className="space-y-2" aria-label="הכלים הנפוצים">
              <h3 className="font-bold">הכלים הנפוצים (14 יום)</h3>
              <ul className="text-sm divide-y divide-paper-line border-y border-paper-line">
                {stats.tools.map((x) => <li key={x.tool + x.mode} className="flex justify-between gap-3 py-1"><span dir="ltr" className="font-num">{x.tool}</span><span className="text-ink-soft">{x.mode === "public" ? "בלי התחברות" : "עם התחברות"} · <span className="font-num tabular">{x.n}</span></span></li>)}
              </ul>
            </section>
          )}

          <p className="text-xs text-ink-soft">"חיבור" = עוזר אחד שמחובר לחשבון אחד (בכתובת בלי התחברות: כתובת רשת אחת, שמורה רק כגיבוב); נספר פעם אחת ביום. "שיחה" = רצף קריאות מאותו חיבור, בלי הפסקה של חצי שעה. "קריאות" = שימוש בכלים שקוראים נתונים; "כתיבות" = שימוש בכלים שמשנים משהו (שמירה, תשובה, מחיקה). המגבלה: 300 קריאות לשעה לכל חיבור, ו-60 לשעה בכתובת בלי התחברות.</p>
          <Btn onClick={load}>רענון</Btn>
        </>
      )}
    </div>
  );
}

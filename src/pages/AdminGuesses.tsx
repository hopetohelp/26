import { Fragment, useEffect, useState } from "react";
import { lists2026, listName } from "../lib/data";
import { dateTime } from "../lib/format";
import { Chips } from "../components/Choice";
import { Btn, Notice } from "./guess/ui";

/**
 * דשבורד ההשערות למנהל (הכרעת בעלים 9.10.2026): כל ההשערות, בלי שום מזהה גולש.
 * השרת מחזיר את ההשערות בסדר אקראי, עם יום בלבד, ו"ידית" חד-פעמית לאישור/דחייה של השערה חריגה.
 */
export type GuessReason = { list: string; rule: "ratio" | "watched"; value: number; mean?: number };
export type GuessBloc = { name: string; lists: string[]; seats: number; target: number | null };
export type GuessRow = { blocs?: { saved: boolean; items: GuessBloc[] }; handle: string; day: string; mode: "seats" | "pct"; seats: Record<string, number>; pct?: Record<string, number>; status: "ok" | "pending" | "approved" | "rejected" | "review"; verified?: boolean; reasons: GuessReason[]; hasVote?: boolean; saves?: number; registered?: string | null; lastLogin?: string | null; logins?: number };
type Filter = "pending" | "all" | "approved" | "rejected" | "unverified";

const STATUS: Record<GuessRow["status"], string> = { ok: "תקינה", pending: "ממתינה לאישור", approved: "אושרה", rejected: "נדחתה", review: "בבדיקת שעה חשודה" };
const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "ממתינות" },
  { id: "all", label: "הכול" },
  { id: "approved", label: "אושרו" },
  { id: "rejected", label: "נדחו" },
  { id: "unverified", label: "לא מאומתים" },
];

/** תאריך ושעה בשעון ישראל, לשדות הפעילות (נרשם / כניסה אחרונה) */
export const stamp = (iso?: string | null) => iso ? dateTime(iso) : "—";

export function reasonText(r: GuessReason) {
  return r.rule === "ratio"
    ? `${listName(r.list)}: ${r.value} מנדטים, ממוצע הגולשים ${r.mean}`
    : `${listName(r.list)}: ${r.value} מנדטים — רשימה שמעבר הסף שלה ממתין לאישור`;
}

/** הגושים של השערה בשורה אחת: "שם: מנדטים (יעד) [רשימות]" */
export function blocsText(r: GuessRow): string {
  if (!r.blocs) return "";
  return r.blocs.items.map((b) => `${b.name || "גוש ללא שם"}: ${b.seats}${b.target !== null ? ` (יעד ${b.target})` : ""} [${b.lists.map(listName).join(", ")}]`).join(" | ");
}

export function toCsv(rows: GuessRow[]) {
  const ids = lists2026.map((l) => l.id);
  const head = ["יום", "מצב", "דרך", "הצבעה שמורה", "סה״כ שמירות", "נרשם", "כניסה אחרונה", "כניסות", ...ids.map(listName), "גושים"];
  const lines = rows.map((r) => [r.day, STATUS[r.status] + (r.verified === false ? " · חשבון לא מאומת" : ""), r.mode === "pct" ? "אחוזים" : "מנדטים", r.hasVote ? "כן" : "לא", r.saves ?? 0, stamp(r.registered), stamp(r.lastLogin), r.logins ?? 0, ...ids.map((id) => r.seats[id] ?? 0), blocsText(r)]);
  return [head, ...lines].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function AdminGuesses({ api }: { api: (path: string, body?: unknown) => Promise<any> }) {
  const [data, setData] = useState<{ salt: string; rows: GuessRow[]; unverified?: { participants: number; means: Record<string, number> } } | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try { setData(await api("/admin/guesses")); } catch (e) { setError((e as Error).message || "אין חיבור לשרת."); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (row: GuessRow, decision: "approved" | "rejected" | "clear") => {
    if (!data) return;
    setBusy(row.handle);
    try { await api("/admin/guesses/decide", { salt: data.salt, handle: row.handle, decision }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const rows = (data?.rows ?? []).filter((r) => filter === "all" || (filter === "unverified" ? r.verified === false : r.status === filter));
  const pending = data?.rows.filter((r) => r.status === "pending").length ?? 0;
  const ids = lists2026.map((l) => l.id);
  const download = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(data?.rows ?? [])], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "guesses.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-2xl">השערות הגולשים ({data?.rows.length ?? "…"} · ממתינות {pending})</h2>
        <div className="flex gap-2"><Btn onClick={load}>רענון</Btn><Btn onClick={download} disabled={!data}>הורדה (CSV)</Btn></div>
      </div>
      <p className="text-sm text-ink-soft max-w-3xl">ההשערה האחרונה של כל גולש, בלי שום מזהה, בסדר אקראי בכל טעינה. השערה חריגה — מפלגה עם פי 1.5 מממוצע הגולשים ולפחות 4.1 מנדטים יותר, או הציבור החרדי, צבע שחור או נועם עם 4 מנדטים ומעלה — לא נכנסת לסטטיסטיקות עד אישור.</p>
      <p className="text-sm text-ink-soft max-w-3xl">לכל גולש מוצגים: האם שמר הצבעה, כמה שמירות נשמרו לו בסך הכול (גם גרסאות שנמחקו בכלל "ההשערה האחרונה של כל יום"; לפני 10/10 הספירה חלקית), מתי נרשם, מתי נכנס לאחרונה וכמה כניסות. כניסה = כניסה לחשבון או הרשמה; גולש שנשאר מחובר בדפדפן אינו נספר כל פעם מחדש.</p>
      <p className="text-sm text-ink-soft max-w-3xl">כל החשבונות נספרים בסטטיסטיקות, גם בלי אימות; בדשבורד הציבורי מוצגת רק הערה קטנה כמה מהם מאומתים (Google או מייל). חשבונות שלא אומתו מרוכזים כאן באזור נפרד, ואפשר לסנן אותם.</p>
      {!!data?.unverified?.participants && (
        <details className="border border-paper-line rounded-theme p-3">
          <summary className="cursor-pointer font-bold min-h-[44px] flex items-center">אזור נפרד: חשבונות שלא אומתו ({data.unverified.participants}) — ממוצע מנדטים לכל רשימה</summary>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-1 text-sm tabular pt-2">
            {Object.entries(data.unverified.means).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).map(([id, m]) => <li key={id} className="flex justify-between gap-2"><span>{listName(id)}</span><span>{m}</span></li>)}
          </ul>
        </details>
      )}
      <Chips label="סינון" value={filter} onChange={setFilter} options={FILTERS} />
      {error && <Notice tone="warn">{error}</Notice>}
      {!data && !error && <p className="text-ink-soft">טוען…</p>}
      {data && !rows.length && <p className="text-sm text-ink-soft">אין השערות במצב הזה.</p>}
      {!!rows.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-ink-soft">
                <th className="text-start font-medium py-1 pe-3">יום</th>
                <th className="text-start font-medium py-1 pe-3">מצב</th>
                <th className="text-start font-medium py-1 pe-3">הצבעה שמורה</th>
                <th className="text-start font-medium py-1 pe-3">שמירות (סה״כ)</th>
                <th className="text-start font-medium py-1 pe-3">נרשם</th>
                <th className="text-start font-medium py-1 pe-3">כניסה אחרונה</th>
                <th className="text-start font-medium py-1 pe-3">כניסות</th>
                {ids.map((id) => <th key={id} className="text-start font-medium py-1 pe-2 whitespace-nowrap">{listName(id)}</th>)}
                <th className="text-start font-medium py-1">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.handle}>
                <tr className="border-t border-paper-line align-top">
                  <td className="py-1 pe-3 whitespace-nowrap">{r.day}</td>
                  <td className="py-1 pe-3 min-w-[12rem]">
                    <span className="font-bold">{STATUS[r.status]}</span>{r.mode === "pct" ? " · באחוזים" : ""}{r.verified === false && <span className="text-xs text-ink-soft"> · חשבון לא מאומת</span>}
                    {!!r.reasons.length && <ul className="text-xs text-ink-soft">{r.reasons.map((x, i) => <li key={i}>{reasonText(x)}</li>)}</ul>}
                  </td>
                  <td className="py-1 pe-3">{r.hasVote ? "כן" : "לא"}</td>
                  <td className="py-1 pe-3">{r.saves ?? 0}</td>
                  <td className="py-1 pe-3 whitespace-nowrap">{stamp(r.registered)}</td>
                  <td className="py-1 pe-3 whitespace-nowrap">{stamp(r.lastLogin)}</td>
                  <td className="py-1 pe-3">{r.logins ?? 0}</td>
                  {ids.map((id) => <td key={id} className={`py-1 pe-2 ${r.reasons.some((x) => x.list === id) ? "font-bold text-warn" : ""}`}>{r.seats[id] ?? 0}</td>)}
                  <td className="py-1 whitespace-nowrap space-x-1 space-x-reverse">
                    {r.status === "pending" && <><Btn kind="primary" disabled={busy === r.handle} onClick={() => decide(r, "approved")}>אישור</Btn><Btn disabled={busy === r.handle} onClick={() => decide(r, "rejected")}>דחייה</Btn></>}
                    {(r.status === "approved" || r.status === "rejected") && <Btn disabled={busy === r.handle} onClick={() => decide(r, "clear")}>ביטול ההחלטה</Btn>}
                  </td>
                </tr>
                {r.blocs && (
                  <tr>
                    <td colSpan={ids.length + 8} className="pb-2">
                      <details>
                        <summary className="cursor-pointer text-xs text-ink-soft min-h-[32px] flex items-center">גושים ({r.blocs.items.length}{r.blocs.saved ? "" : " · ברירת מחדל"})</summary>
                        <ul className="text-xs space-y-0.5 pt-1">
                          {r.blocs.items.map((b, i) => (
                            <li key={i}><span className="font-bold">{b.name || "גוש ללא שם"}</span>: {b.seats} מנדטים{b.target !== null ? ` (יעד ${b.target})` : ""} · {b.lists.length ? b.lists.map(listName).join(", ") : "אין רשימות"}</li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  </tr>
                )}
                </Fragment>

              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

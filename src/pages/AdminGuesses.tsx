import { useEffect, useState } from "react";
import { lists2026, listName } from "../lib/data";
import { Chips } from "../components/Choice";
import { Btn, Notice } from "./guess/ui";

/**
 * דשבורד ההשערות למנהל (הכרעת בעלים 9.10.2026): כל ההשערות, בלי שום מזהה גולש.
 * השרת מחזיר את ההשערות בסדר אקראי, עם יום בלבד, ו"ידית" חד-פעמית לאישור/דחייה של השערה חריגה.
 */
export type GuessReason = { list: string; rule: "ratio" | "watched"; value: number; mean?: number };
export type GuessRow = { handle: string; day: string; mode: "seats" | "pct"; seats: Record<string, number>; pct?: Record<string, number>; status: "ok" | "pending" | "approved" | "rejected" | "review" | "unverified"; reasons: GuessReason[] };
type Filter = "pending" | "all" | "approved" | "rejected" | "unverified";

const STATUS: Record<GuessRow["status"], string> = { ok: "תקינה", pending: "ממתינה לאישור", approved: "אושרה", rejected: "נדחתה", review: "בבדיקת שעה חשודה", unverified: "חשבון לא מאומת" };
const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "ממתינות" },
  { id: "all", label: "הכול" },
  { id: "approved", label: "אושרו" },
  { id: "rejected", label: "נדחו" },
  { id: "unverified", label: "לא מאומתים" },
];

export function reasonText(r: GuessReason) {
  return r.rule === "ratio"
    ? `${listName(r.list)}: ${r.value} מנדטים, ממוצע הגולשים ${r.mean}`
    : `${listName(r.list)}: ${r.value} מנדטים — רשימה שמעבר הסף שלה ממתין לאישור`;
}

export function toCsv(rows: GuessRow[]) {
  const ids = lists2026.map((l) => l.id);
  const head = ["יום", "מצב", "דרך", ...ids.map(listName)];
  const lines = rows.map((r) => [r.day, STATUS[r.status], r.mode === "pct" ? "אחוזים" : "מנדטים", ...ids.map((id) => r.seats[id] ?? 0)]);
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

  const rows = (data?.rows ?? []).filter((r) => filter === "all" || r.status === filter);
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
      <p className="text-sm text-ink-soft max-w-3xl">רק חשבון מאומת (Google או מייל שאומת) נספר בסטטיסטיקות. חשבונות שלא אומתו מרוכזים באזור הנפרד שמתחת, ועוברים לסטטיסטיקות ברגע שמאמתים.</p>
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
                {ids.map((id) => <th key={id} className="text-start font-medium py-1 pe-2 whitespace-nowrap">{listName(id)}</th>)}
                <th className="text-start font-medium py-1">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.handle} className="border-t border-paper-line align-top">
                  <td className="py-1 pe-3 whitespace-nowrap">{r.day}</td>
                  <td className="py-1 pe-3 min-w-[12rem]">
                    <span className="font-bold">{STATUS[r.status]}</span>{r.mode === "pct" ? " · באחוזים" : ""}
                    {!!r.reasons.length && <ul className="text-xs text-ink-soft">{r.reasons.map((x, i) => <li key={i}>{reasonText(x)}</li>)}</ul>}
                  </td>
                  {ids.map((id) => <td key={id} className={`py-1 pe-2 ${r.reasons.some((x) => x.list === id) ? "font-bold text-warn" : ""}`}>{r.seats[id] ?? 0}</td>)}
                  <td className="py-1 whitespace-nowrap space-x-1 space-x-reverse">
                    {r.status === "pending" && <><Btn kind="primary" disabled={busy === r.handle} onClick={() => decide(r, "approved")}>אישור</Btn><Btn disabled={busy === r.handle} onClick={() => decide(r, "rejected")}>דחייה</Btn></>}
                    {(r.status === "approved" || r.status === "rejected") && <Btn disabled={busy === r.handle} onClick={() => decide(r, "clear")}>ביטול ההחלטה</Btn>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

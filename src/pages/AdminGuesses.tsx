import { Fragment, useEffect, useState } from "react";
import { lists2026, listName } from "../lib/data";
import { dateTime, rng } from "../lib/format";
import { Chips } from "../components/Choice";
import { Btn, Notice } from "./guess/ui";

/**
 * דשבורד ההשערות למנהל (הכרעת בעלים 9.10.2026): כל ההשערות, בלי שום מזהה גולש.
 * השרת מחזיר את ההשערות בסדר אקראי, עם יום בלבד, ו"ידית" חד-פעמית לאישור/דחייה של השערה חריגה.
 */
export type GuessReason = { list: string; rule: "range" | "ratio" | "watched"; value: number; mean?: number; lo?: number; hi?: number };
export type GuessBloc = { name: string; lists: string[]; seats: number; target: number | null };
export type GuessRow = { blocs?: { saved: boolean; items: GuessBloc[] }; handle: string; day: string; savedAt?: string; mode: "seats" | "pct"; seats: Record<string, number>; pct?: Record<string, number>; status: "ok" | "pending" | "approved" | "rejected" | "review"; verified?: boolean; reasons: GuessReason[]; hasVote?: boolean; saves?: number; registered?: string | null; lastLogin?: string | null; logins?: number };
export type Sort = "random" | "registered" | "lastLogin" | "saved";
type Filter = "pending" | "all" | "approved" | "rejected" | "unverified";

const STATUS: Record<GuessRow["status"], string> = { ok: "תקינה", pending: "ממתינה לאישור", approved: "אושרה", rejected: "נדחתה", review: "בבדיקת שעה חשודה" };
const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "ממתינות" },
  { id: "all", label: "הכול" },
  { id: "approved", label: "אושרו" },
  { id: "rejected", label: "נדחו" },
  { id: "unverified", label: "לא מאומתים" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "random", label: "אקראי" },
  { id: "registered", label: "רישום משתמש" },
  { id: "lastLogin", label: "כניסה אחרונה" },
  { id: "saved", label: "שמירת הניחוש" },
];

/** מיון מהחדש לישן לפי השדה שנבחר; בלי ערך — בסוף. "אקראי" משאיר את סדר השרת. */
export function sortRows(rows: GuessRow[], sort: Sort): GuessRow[] {
  if (sort === "random") return rows;
  const key = (r: GuessRow) => (sort === "registered" ? r.registered : sort === "lastLogin" ? r.lastLogin : r.savedAt ?? r.day) ?? "";
  return [...rows].sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0));
}

/** תאריך ושעה בשעון ישראל, לשדות הפעילות (נרשם / כניסה אחרונה) */
export const stamp = (iso?: string | null) => iso ? dateTime(iso) : "—";

/** בכמה אחוז ההשערה חורגת מקצה טווח הסקרים (מעל העליון / מתחת לתחתון). קצה 0 ⇐ אין אחוז, רק הפער במנדטים */
export function rangeGap(r: Pick<GuessReason, "value" | "lo" | "hi">): string {
  const lo = r.lo ?? 0, hi = r.hi ?? 0;
  if (r.value > hi) return hi > 0 ? `${Math.round((r.value / hi - 1) * 100)}% מעל טווח הסקרים` : `${r.value} מנדטים מעל טווח הסקרים`;
  return `${Math.round((1 - r.value / lo) * 100)}% מתחת לטווח הסקרים`;
}

export function reasonText(r: GuessReason) {
  if (r.rule === "range") return `${listName(r.list)}: ${r.value} מנדטים — ${rangeGap(r)} ${r.lo === r.hi ? r.lo : rng(String(r.lo), String(r.hi))}${r.mean !== undefined ? `, ממוצע שאר המשתתפים ${r.mean}` : ""}`;
  if (r.rule === "ratio") return `${listName(r.list)}: ${r.value} מנדטים, ממוצע הגולשים ${r.mean}`;
  return `${listName(r.list)}: ${r.value} מנדטים — רשימה שמעבר הסף שלה המתין לאישור (כלל קודם)`;
}

/** החריגה של רשימה בתוך הטור שלה: כמה מנדטים מעל/מתחת לטווח הסקרים, או "סף" לרשימה נבחרת */
export function cellGap(reasons: GuessReason[], list: string): string | null {
  const out: string[] = [];
  for (const r of reasons) {
    if (r.list !== list) continue;
    if (r.rule === "range") out.push(r.value > (r.hi ?? 0) ? `+${r.value - (r.hi ?? 0)}` : `−${(r.lo ?? 0) - r.value}`);
    else if (r.rule === "watched") out.push("סף");
    else out.push(`ממוצע ${r.mean}`);
  }
  return out.length ? out.join(" · ") : null;
}

/** מתג אישור/דחייה בתחילת השורה. לחיצה על המצב הפעיל מבטלת את ההחלטה. השערה תקינה — בלי מתג */
function Decision({ row, busy, decide }: { row: GuessRow; busy: boolean; decide: (d: "approved" | "rejected" | "clear") => void }) {
  if (row.status !== "pending" && row.status !== "approved" && row.status !== "rejected") return <span className="text-ink-soft">—</span>;
  const opt = (d: "approved" | "rejected", label: string) => {
    const on = row.status === d;
    return <button type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => decide(on ? "clear" : d)} title={on ? "לחיצה מבטלת את ההחלטה" : undefined}
      className={`px-3 min-h-[36px] rounded-theme text-sm font-bold ${on ? (d === "approved" ? "bg-ink text-paper-card" : "bg-warn text-paper-card") : "text-ink-soft hover:text-ink"}`}>{label}</button>;
  };
  return <div role="radiogroup" aria-label="החלטה על הניחוש" className="inline-flex gap-0.5 p-0.5 rounded-theme border border-paper-line bg-paper">{opt("approved", "אישור")}{opt("rejected", "דחייה")}</div>;
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

type GuessData = { salt: string; rows: GuessRow[]; unverified?: { participants: number; means: Record<string, number> } };
/**
 * api = ממשק מנהל האתר (כל ההשערות). group = מנהל קבוצה (הכרעת בעלים 24.10.2026): אותו ממשק, רק לחברי הקבוצה, בלי נתוני פעילות.
 */
export default function AdminGuesses({ api, group, onCounts }: { api?: (path: string, body?: unknown) => Promise<any>; group?: { load: () => Promise<GuessData & { belowMin?: boolean; min?: number }>; decide: (body: { salt: string; handle: string; decision: string }) => Promise<unknown> }; onCounts?: (c: { pending: number; rejected: number }) => void }) {
  const [data, setData] = useState<GuessData | null>(null);
  const [belowMin, setBelowMin] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  // מנהל קבוצה: מיון לפי שמירה בלבד (הכרעת בעלים 25.10.2026)
  const [sort, setSort] = useState<Sort>(group ? "saved" : "random");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try { const d = group ? await group.load() : await api!("/admin/guesses"); if (d.belowMin) { setBelowMin(d.min); return; } setData(d); { const rs = d.rows as GuessRow[]; onCounts?.({ pending: rs.filter((r) => r.status === "pending").length, rejected: rs.filter((r) => r.status === "rejected").length }); } } catch (e) { setError((e as Error).message || "אין חיבור לשרת."); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (row: GuessRow, decision: "approved" | "rejected" | "clear") => {
    if (!data) return;
    setBusy(row.handle);
    try { const body = { salt: data.salt, handle: row.handle, decision }; await (group ? group.decide(body) : api!("/admin/guesses/decide", body)); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const rows = sortRows((data?.rows ?? []).filter((r) => filter === "all" || (filter === "unverified" ? r.verified === false : r.status === filter)), sort);
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
        {group ? <span /> : <h3 className="font-bold text-lg">{"ניחושי הגולשים"} ({data?.rows.length ?? "…"} · ממתינים {pending})</h3>}
        <div className="flex gap-2"><Btn onClick={load}>רענון</Btn>{!group && <Btn onClick={download} disabled={!data}>הורדה (CSV)</Btn>}</div>
      </div>
      <p className="text-sm text-ink-soft max-w-3xl">הניחוש האחרון של כל גולש, בלי שום מזהה, {group ? "מהחדש לישן לפי שמירת הניחוש" : "בסדר אקראי בכל טעינה, או ממוין מהחדש לישן לפי רישום, כניסה אחרונה או שמירת הניחוש"}. ניחוש חריג — רשימה שרחוקה לפחות 75% מממוצע שאר המשתתפים וגם לפחות 5 מנדטים מחוץ לטווח הסקרים — לא נכנסת לסטטיסטיקות עד אישור. בטור של כל רשימה חורגת: כמה מנדטים מעל (+) או מתחת (−) לטווח.</p>
      {group && <p className="text-sm text-ink-soft max-w-3xl">רק הניחושים של חברי הקבוצה, בלי שום מזהה ובלי נתוני פעילות. ההחלטה כאן קובעת אם הניחוש נספר בכל האתר — כמו החלטה של מנהל האתר.</p>}
      {!group && <p className="text-sm text-ink-soft max-w-3xl">לכל גולש מוצגים: האם שמר הצבעה, כמה שמירות נשמרו לו בסך הכול (גם גרסאות שנמחקו בכלל "הניחוש האחרון של כל יום"; לפני 10/10 הספירה חלקית), מתי נרשם, מתי נכנס לאחרונה וכמה כניסות. כניסה = כניסה לחשבון או הרשמה; גולש שנשאר מחובר בדפדפן אינו נספר כל פעם מחדש.</p>}
      {!group && <p className="text-sm text-ink-soft max-w-3xl">כל החשבונות נספרים בסטטיסטיקות, גם בלי אימות; בדשבורד הציבורי מוצגת רק הערה קטנה כמה מהם מאומתים (Google או מייל). חשבונות שלא אומתו מרוכזים כאן באזור נפרד, ואפשר לסנן אותם.</p>}
      {!!data?.unverified?.participants && (
        <details className="border border-paper-line rounded-theme p-3">
          <summary className="cursor-pointer font-bold min-h-[44px] flex items-center">אזור נפרד: חשבונות שלא אומתו ({data.unverified.participants}) — ממוצע מנדטים לכל רשימה</summary>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-1 text-sm tabular pt-2">
            {Object.entries(data.unverified.means).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).map(([id, m]) => <li key={id} className="flex justify-between gap-2"><span>{listName(id)}</span><span>{m}</span></li>)}
          </ul>
        </details>
      )}
      <Chips label="סינון" value={filter} onChange={setFilter} options={group ? FILTERS.filter((f) => f.id !== "unverified") : FILTERS} />
      {!group && <Chips label="מיון" value={sort} onChange={setSort} options={SORTS} />}
      {data && <p className="text-sm font-bold" aria-live="polite">{rows.length === data.rows.length ? `מוצגים ${rows.length} ניחושים` : `מוצגים ${rows.length} ניחושים מתוך ${data.rows.length}, לפי הסינון`}</p>}
      {error && <Notice tone="warn">{error}</Notice>}
      {belowMin !== null && <p className="text-sm text-ink-soft">פחות מ-{belowMin} חברים מהקבוצה רשומים — הניחושים יוצגו מ-{belowMin}.</p>}
      {!data && !error && belowMin === null && <p className="text-ink-soft">טוען…</p>}
      {data && !rows.length && <p className="text-sm text-ink-soft">אין ניחושים במצב הזה.</p>}
      {!!rows.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-ink-soft">
                <th className="text-start font-medium py-1 pe-3">החלטה</th>
                <th className="text-start font-medium py-1 pe-3">יום</th>
                <th className="text-start font-medium py-1 pe-3">מצב</th>
                {!group && <>
                  <th className="text-start font-medium py-1 pe-3">הצבעה שמורה</th>
                  <th className="text-start font-medium py-1 pe-3">שמירות (סה״כ)</th>
                  <th className="text-start font-medium py-1 pe-3">נרשם</th>
                  <th className="text-start font-medium py-1 pe-3">כניסה אחרונה</th>
                  <th className="text-start font-medium py-1 pe-3">כניסות</th>
                </>}
                {ids.map((id) => <th key={id} className="text-start font-medium py-1 pe-2 whitespace-nowrap">{listName(id)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.handle}>
                <tr className="border-t border-paper-line align-top">
                  <td className="py-1 pe-3 whitespace-nowrap"><Decision row={r} busy={busy === r.handle} decide={(d) => void decide(r, d)} /></td>
                  <td className="py-1 pe-3 whitespace-nowrap">{r.day}</td>
                  <td className="py-1 pe-3 whitespace-nowrap">
                    <span className="font-bold">{STATUS[r.status]}</span>{r.mode === "pct" ? " · באחוזים" : ""}{r.verified === false && <span className="text-xs text-ink-soft"> · חשבון לא מאומת</span>}
                  </td>
                  {!group && <>
                    <td className="py-1 pe-3">{r.hasVote ? "כן" : "לא"}</td>
                    <td className="py-1 pe-3">{r.saves ?? 0}</td>
                    <td className="py-1 pe-3 whitespace-nowrap">{stamp(r.registered)}</td>
                    <td className="py-1 pe-3 whitespace-nowrap">{stamp(r.lastLogin)}</td>
                    <td className="py-1 pe-3">{r.logins ?? 0}</td>
                  </>}
                  {ids.map((id) => { const gap = cellGap(r.reasons, id); return <td key={id} className={`py-1 pe-2 ${gap ? "font-bold text-warn" : ""}`} title={gap ? r.reasons.filter((x) => x.list === id).map(reasonText).join("\n") : undefined}>{r.seats[id] ?? 0}{gap && <span className="block text-xs font-normal whitespace-nowrap" dir="ltr">{gap}</span>}</td>; })}
                </tr>
                {r.blocs && (
                  <tr>
                    <td colSpan={ids.length + (group ? 3 : 8)} className="pb-2">
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

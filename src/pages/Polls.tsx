import PersonalBlocs from "../components/PersonalBlocs";
import { seatsOfValues } from "../components/PollAccuracyTags";
import { seatTags, type SeatTags } from "../lib/guessAccuracy";
import { electionData, resultBloc, type ElectionData } from "../lib/electionData";
import { K26_ID } from "../lib/election";
import Missing from "../components/Missing";
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, Fold, Note } from "../components/ui";
import { largestRemainder } from "../lib/fillAll";
import { Delta } from "../components/ParamCard";
import { FIELD_GROUP_LABEL, FIELD_STATUS_LABEL, exitSeats, fieldLabel, groupSeatsIn, pollsterKey, pollsterLabel, verificationLabel, type Poll } from "../lib/data";
import { date, dateRange, num } from "../lib/format";

const FIELD_GROUPS = ["seats", "pct", "sample", "dates"] as const;

const PAGE = 50;
/** ארבעת הגושים בכל סקר — אחרי טורי הדיוק, עם קו הפרדה בסוף (הכרעת בעלים 03.11.2026); החישוב — groupSeatsIn / exitSeats (מקור אחד) */
const blocCells = (vals: (number | null | undefined)[], tint?: (i: number, v: number) => CSSProperties | undefined) => <>{vals.map((v, i) => <td key={i} style={v == null || !tint ? undefined : tint(i, v)} className={`px-1 text-center tabular-nums${i === vals.length - 1 ? " border-e-2 border-paper-line" : ""}`}>{v == null ? "—" : v}</td>)}</>;
/**
 * סולם אחד לפי מרחק מהתוצאה (הכרעת בעלים 03.11.2026): לבן = בדיוק, ואדום מתחזק ב-4 דרגות ככל שהנתון רחוק יותר — בלי ירוק,
 * כדי שלא ייראה "טוב יותר". המרחק יחסית לסטייה הגדולה ביותר באותו טור בטבלה.
 */
const STEPS = [0, 0.12, 0.24, 0.36, 0.5];
const scaleTint = (d: number, span: number): CSSProperties | undefined => {
  if (!span || d === 0) return undefined;
  const level = Math.min(4, Math.max(1, Math.round((Math.abs(d) / span) * 4)));
  return { backgroundColor: `rgb(var(--neg) / ${STEPS[level]})` };
};
/** הגושים בתוצאת האמת של המערכת (resultBloc, מקור אחד); אין תוצאה — אפסים, ואז אין צביעה */
const actualBlocs = (d: ElectionData) => d.blocs.map((b) => resultBloc(d, b.lists) ?? 0);
/** שלושת טורי הטעות (הכרעת בעלים 03.11.2026: טעו במנדטים / במפלגות / בגושים) — ראשונים בשורה, עם קו הפרדה משני הצדדים (הכרעת בעלים 03.11.2026) */
const accCells = (t: SeatTags | null) => <>
  <td className="px-1 text-center tabular-nums border-s-2 border-paper-line">{t ? 120 - t.seats : "—"}</td>
  <td className="px-1 text-center tabular-nums whitespace-nowrap"><bdi dir="ltr">{t ? `${t.of - t.exact}/${t.of}` : "—"}</bdi></td>
  <td className="px-1 text-center tabular-nums border-e-2 border-paper-line">{t?.blocErr ?? "—"}</td>
</>;
/** דיוק מול תוצאת אותה מערכת (מנדטים, מפלגות, גושים) — מקור אחד: seatTags */
const tagsOf = (d: ElectionData, values: Record<string, { s?: number }>) => d.result ? seatTags(seatsOfValues(values), d.result.seats, d.blocs) : null;


/**
 * מסך "סקרים" (הכרעת בעלים 03.11.2026): כותרת "כל הסקרים", שורת מסננים אחת, ומתחת מגירות — מדגמים (פתוחה), סקר אחרון, מהגשת הרשימות,
 * מהבחירות הקודמות, קבוצות אוכלוסייה, ובסוף `trailing` (מגמות). אותו רכיב לכל מערכת — רק הנתונים מ־electionData(id) משתנים (הכרעת בעלים 04.11.2026).
 */
export default function Polls({ id = K26_ID, trailing }: { id?: string; trailing?: ReactNode } = {}) {
  const d = electionData(id);
  return <PollsOf key={d.id} d={d} trailing={trailing} />;
}

function PollsOf({ d, trailing }: { d: ElectionData; trailing?: ReactNode }) {
  const { polls, exitPolls, subgroupPolls, finalIds: finalPollIds, listSubmission, day } = d;
  const pollRow = (p: Poll) => pollRowOf(d, p);
  const pollsters = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const p of polls) {
      const k = pollsterKey(p);
      const cur = m.get(k) ?? { label: pollsterLabel(p), n: 0 };
      cur.n += 1;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [polls]);
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  // מתג "הצגת המפלגות" (הכרעת בעלים 03.11.2026): כבוי — בלי טורי הרשימות; ברירת המחדל — מוצגות
  // ברירת המחדל (הכרעת בעלים 03.11.2026): בטלפון ובטאבלט צר (עד 1023px) — כבוי; במסך רחב — דולק
  const [parties, setParties] = useState<"on" | "off">(() => (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1023px)").matches ? "off" : "on"));

  const filtered = polls.filter(
    (p) => (!who || pollsterKey(p) === who) && (!from || p.end >= from) && (!to || p.end <= to),
  );
  // מדגמי 22:00 — בראש הארכיון, כשהמסננים כוללים את יום הבחירות ולא נבחר מכון
  const exitRows = (!who && (!from || day >= from) && (!to || day <= to) ? [...exitPolls] : []).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  // שלושה קטעים, כל אחד מהחדש לישן, עם קו הפרדה לרוחב: מדגמי 22:00 · הסקרים האחרונים · כל השאר (הכרעת בעלים 03.11.2026)
  const byNewest = (a: Poll, b: Poll) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start);
  const finalRows = filtered.filter((p) => finalPollIds.has(p.id)).sort(byNewest);
  // שתי טבלאות (הכרעת בעלים 03.11.2026): מהגשת הרשימות (סקר שהסתיים אחרי היום האחרון להגשה) · מבחירות 2022 ועד ההגשה
  const rest = filtered.filter((p) => !finalPollIds.has(p.id)).sort(byNewest);
  // תאריך ההגשה טרם הוזן למערכת ⇐ כל הסקרים בטבלה "מהבחירות הקודמות", ו"מהגשת הרשימות" — נתון חסר
  const sinceLists = listSubmission ? rest.filter((p) => p.end > listSubmission) : [];
  const restAll = listSubmission ? rest.filter((p) => p.end <= listSubmission) : rest;
  const restRows = restAll.slice(0, shown);
  return (
    <>

      <h2 className="text-2xl font-extrabold mb-3">כל הסקרים</h2>
      {/* שורה אחת במחשב; בטלפון — שורה לכל שם ושדה. השם והשדה באותה שורה */}
      <form className="c-poll-filters flex flex-col md:flex-row md:flex-wrap md:items-center gap-x-4 gap-y-2 mb-4" onSubmit={(e) => e.preventDefault()}>
        <label className="flex items-center gap-2 text-sm min-w-0">
          <span className="shrink-0 w-20 md:w-auto">מכון ומזמין</span>
          <select className="border border-paper-line rounded px-2 min-h-[40px] bg-paper-card min-w-0 flex-1 md:flex-none md:w-52" value={who} onChange={(e) => { setWho(e.target.value); setShown(PAGE); }}>
            <option value="">כולם ({polls.length})</option>
            {pollsters.map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} ({v.n})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm min-w-0">
          <span className="shrink-0 w-20 md:w-auto">מתאריך</span>
          <input type="date" className="border border-paper-line rounded px-2 min-h-[40px] bg-paper-card min-w-0 flex-1 md:flex-none md:w-36" value={from} onChange={(e) => { setFrom(e.target.value); setShown(PAGE); }} />
        </label>
        <label className="flex items-center gap-2 text-sm min-w-0">
          <span className="shrink-0 w-20 md:w-auto">עד תאריך</span>
          <input type="date" className="border border-paper-line rounded px-2 min-h-[40px] bg-paper-card min-w-0 flex-1 md:flex-none md:w-36" value={to} onChange={(e) => { setTo(e.target.value); setShown(PAGE); }} />
        </label>
        {/* כפתור אחד (הכרעת בעלים 03.11.2026): דולק — רגיל; כבוי — אפור */}
        <button type="button" aria-pressed={parties === "on"} onClick={() => setParties(parties === "on" ? "off" : "on")} className={`f-btn min-h-[40px] self-start md:self-auto${parties === "on" ? "" : " opacity-60 grayscale text-ink-soft"}`}>הצגת מפלגות</button>
      </form>
      {filtered.length === 0 && <p role="status" className="c-empty">אין סקרים בטווח שנבחר. <button type="button" className="underline min-h-11" onClick={() => { setWho(""); setFrom(""); setTo(""); setShown(PAGE); }}>איפוס המסננים</button></p>}
      {/* בלי סינון זה ממוצע הסקרים שבמגירה "הסקרים מול התוצאה" — מוצג רק כשיש סינון (הכרעת בעלים 03.11.2026) */}
      {(who || from || to) && <PersonalBlocs title="חלוקת הכנסת בסקרים המסוננים בארכיון" source="סיכום הגושים בסקרים המוצגים לפי המסננים" asOf={`${from || "תחילת הארכיון"} — ${to || "הסקר האחרון"}`} datasets={[...finalRows, ...sinceLists, ...restRows].map(p => ({ poll: p, values: Object.fromEntries(Object.keys(p.values).map(id => [id, p.values[id].s ?? (p.values[id].p !== undefined && p.values[id].p! < 3.25 ? 0 : undefined)])), source: `סקר ${pollsterLabel(p)}`, asOf: date(p.end) }))} />}
      {/* ארבע טבלאות נפרדות, כל אחת עם כותרת וסולם צבעים משלה (הכרעת בעלים 03.11.2026) */}
      <Fold title="מדגמים" open><ArchiveTable d={d} title="מדגמים" missing={exitPolls.length ? undefined : "מדגמי 22:00"} parties={parties} open={open} setOpen={setOpen} rows={exitRows.map((p) => ({
        id: p.id, values: p.values,
        head: <><span className="font-bold">{date(day)}</span> {p.firmHe} · {p.publisherHe}</>,
        blocs: d.blocs.map((b) => exitSeats(p, [...b.lists])),
        details: <dl className="text-sm bg-paper rounded p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-bold">סוג</dt><dd className="flex flex-wrap gap-1"><Badge tone="ok">מדגם 22:00</Badge><Badge>{p.verified ? "אומת" : "לא אומת"}</Badge></dd>
          <dt className="font-bold">עורך המדגם</dt><dd>{p.firmHe}</dd>
          {p.note && <><dt className="font-bold">הערה</dt><dd>{p.note}</dd></>}
          <dt className="font-bold">פרסום מקורי</dt>
          <dd className="break-all">{p.urls.map((u) => <a key={u} href={u} rel="noopener noreferrer" className="block">{u}</a>)}</dd>
        </dl>,
      }))} /></Fold>
      <Fold title="סקר אחרון"><ArchiveTable d={d} title="סקר אחרון" parties={parties} open={open} setOpen={setOpen} rows={finalRows.map(pollRow)} /></Fold>
      <Fold title="מהגשת הרשימות"><ArchiveTable d={d} title="מהגשת הרשימות" missing={listSubmission ? undefined : "היום האחרון להגשת הרשימות"} parties={parties} open={open} setOpen={setOpen} rows={sinceLists.map(pollRow)} meanLists={d.activeIds} /></Fold>
      <Fold title={d.prevLabel ? `מבחירות ${d.prevLabel}` : "מהבחירות הקודמות"}><ArchiveTable d={d} title={d.prevLabel ? `מבחירות ${d.prevLabel}` : "מהבחירות הקודמות"} parties={parties} open={open} setOpen={setOpen} rows={restRows.map(pollRow)} meanRows={restAll.map(pollRow)} foot={<>
        {shown < restAll.length && (
          <button type="button" className="f-btn mt-3" onClick={() => setShown((s) => s + PAGE)}>
            עוד {Math.min(PAGE, restAll.length - shown)} סקרים
          </button>
        )}
        <Note>
          אחוז בסוגריים = הרשימה מתחת לאחוז החסימה באותו סקר. "אומת" = הסקר הושווה לפרסום המקורי (מצב הבדיקה של כל שדה — בכרטיס הסקר). "תוקן לפי המקור" = נמצא
          הבדל מטבלת ויקיפדיה, והאתר מציג את מה שבפרסום המקורי (הפירוט בכרטיס הסקר). "מקור: ויקיפדיה" = טרם הושווה לפרסום המקורי.
          העדכון האחרון: {date(polls[0]?.end ?? "")}.
        </Note>
      </>} /></Fold>
      <Fold title="קבוצות אוכלוסייה"><ArchiveTable d={d} title="קבוצות אוכלוסייה" missing={subgroupPolls.length ? undefined : "סקרי קבוצות אוכלוסייה"} parties={parties} open={open} setOpen={setOpen} rows={subgroupPolls.map((p) => ({
        id: p.id, values: p.values,
        head: <><span className="font-bold whitespace-nowrap">{dateRange(p.start, p.end)}</span> {p.firmHe} · {p.publisherHe}</>,
        blocs: d.blocs.map((b) => sumSeats(p.values, [...b.lists])),
        details: <dl className="text-sm bg-paper rounded p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-bold">סוג</dt><dd><Badge>לא נכנס לסטטיסטיקות של כלל הציבור</Badge></dd>
          <dt className="font-bold">האוכלוסייה</dt><dd>{p.population}</dd>
          <dt className="font-bold">גודל המדגם</dt><dd>{num(p.sample)}</dd>
          {p.note && <><dt className="font-bold">הערה</dt><dd>{p.note}</dd></>}
          <dt className="font-bold">פרסום מקורי</dt>
          <dd className="break-all">{p.urls.map((u) => <a key={u} href={u} rel="noopener noreferrer" className="block">{u}</a>)}</dd>
        </dl>,
      }))} /></Fold>
      {trailing}
    </>
  );
}

/** שורת סקר בטבלאות "סקר אחרון" ו"כל הסקרים": במצב סגור — תאריך, מכון ומזמין; השאר בנתונים המלאים */
function pollRowOf(d: ElectionData, p: Poll): ArchiveRow {
  const finalPollIds = d.finalIds;
  const label = p.verification ? verificationLabel(p.verification.status) : null;
  return {
    id: p.id, values: p.values,
    head: <><span className="font-bold whitespace-nowrap">{dateRange(p.start, p.end)}</span> {pollsterLabel(p)}</>,
    blocs: d.blocs.map((b) => groupSeatsIn(p, [...b.lists])),
    details: <dl className="text-sm bg-paper rounded p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="font-bold">סוג</dt>
                    <dd className="flex flex-wrap gap-1">
                      {finalPollIds.has(p.id) && <Badge tone="ok">סקר אחרון</Badge>}
                      {!p.consistent && <Badge tone="warn">סכום המנדטים אינו 120</Badge>}
                      {p.erroneous && <Badge tone="warn">סומן כשגוי — לא נכנס לחישובים</Badge>}
                      {p.verification ? <Badge tone={label!.tone === "ok" ? "ok" : label!.tone === "warn" ? "warn" : "neutral"}>{label!.text}</Badge> : <Badge>מקור: ויקיפדיה</Badge>}
                    </dd>
                    <dt className="font-bold">עורך הסקר</dt>
                    <dd>{p.firmHe}</dd>
                    <dt className="font-bold">המזמין</dt>
                    <dd>{p.publisherHe ?? "לא צוין"}</dd>
                    <dt className="font-bold">תאריכי הסקר</dt>
                    <dd>{dateRange(p.start, p.end)}</dd>
                    <dt className="font-bold">גודל המדגם</dt>
                    <dd>{p.sample ? num(p.sample) : "לא צוין בטבלה"}</dd>
                    <dt className="font-bold">טעות הדגימה</dt>
                    <dd>{p.verification?.details?.moe ? String(p.verification.details.moe) : "לא נמצאה בפרסום המקורי, או שטרם נבדק"}</dd>
                    <dt className="font-bold">האוכלוסייה</dt>
                    <dd>{p.verification?.details?.population ?? "לא נמצאה בפרסום המקורי, או שטרם נבדק"}</dd>
                    <dt className="font-bold">נוסח השאלות</dt>
                    <dd>בפרסום המקורי, אם פורסם (קישור למטה)</dd>
                    {p.verification && (
                      <>
                        <dt className="font-bold">בדיקה מול המקור</dt>
                        <dd>
                          {label!.text}{p.verification.checkedAt && <> · נבדק {date(p.verification.checkedAt)}</>}
                        </dd>
                      </>
                    )}
                    {p.fieldChecks && (
                      <>
                        <dt className="font-bold">בדיקה לפי שדה</dt>
                        <dd>
                          <ul>
                            {FIELD_GROUPS.map((g) => {
                              const c = p.fieldChecks![g];
                              return (
                                <li key={g}>
                                  {FIELD_GROUP_LABEL[g]}: {FIELD_STATUS_LABEL[c?.status ?? "none"].text}
                                  {c?.note && <> ({c.note})</>}
                                </li>
                              );
                            })}
                          </ul>
                          <Link to="/method?tab=sources#data-checks" className="underline">איך נבדק כל שדה</Link>
                        </dd>
                      </>
                    )}
                    {p.corrections && p.corrections.length > 0 && (
                      <>
                        <dt className="font-bold">תיקונים</dt>
                        <dd>
                          <ul>
                            {p.corrections.map((c) => (
                              <li key={c.field}>
                                {fieldLabel(c.field)}: בטבלת ויקיפדיה <bdi>{String(c.from)}</bdi>, בפרסום המקורי <bdi>{String(c.to)}</bdi> — מוצג לפי המקור
                              </li>
                            ))}
                          </ul>
                          <Link to="/method?tab=sources#corrections-log" className="underline">יומן התיקונים המלא</Link>
                        </dd>
                      </>
                    )}
                    <dt className="font-bold">פרסום מקורי</dt>
                    <dd className="break-all">
                      {p.urls.length
                        ? p.urls.map((u) => (
                            <a key={u} href={u} rel="noopener noreferrer" className="block">
                              {u}
                            </a>
                          ))
                        : "—"}
                    </dd>
                    <dt className="font-bold">מקור הטבלה</dt>
                    <dd>
                      ויקיפדיה האנגלית, "{p.source.page}"{p.source.tableLine > 0 && ` (שורה ${p.source.tableLine} בטקסט המקור)`}
                    </dd>
                  </dl>,
  };
}

/** סכום המנדטים של קבוצת רשימות בסקר אוכלוסייה; סקר באחוזים בלבד — אין גוש */
const sumSeats = (values: Record<string, { s?: number }>, ids: string[]) => ids.some((id) => values[id]?.s !== undefined) ? ids.reduce((t, id) => t + (values[id]?.s ?? 0), 0) : null;

interface ArchiveRow { id: string; values: Record<string, { s?: number; p?: number }>; head: ReactNode; blocs: (number | null)[]; details: ReactNode }

/**
 * טבלת ארכיון אחת: שורת "תוצאות אמת" מודגשת, טורי דיוק, ארבעה גושים וטור לכל רשימה.
 * סולם 9 צבעים לכל הטורים, יחסית לסטייה הגדולה ביותר באותו טור בטבלה הזו בלבד (הכרעת בעלים 03.11.2026).
 * בטורי הדיוק — מרחק מהדיוק המלא (120 מנדטים, כל המפלגות, 0 טעות), ולכן רק אדום או לבן.
 */
/** פער מהתוצאה בעשיריות, עם חץ וצבע (Delta); בדיוק — 0; אין תוצאה או אין ממוצע — "—" */
const gap = (v: number | null | undefined, actual: number | null) => {
  if (v == null || actual == null) return "—";
  const d = Math.round((v - actual) * 10) / 10;
  return d === 0 ? "0" : <Delta change={{ up: d > 0, text: String(Math.abs(d)) }} />;
};

/** אחוז הערכים שזהים לתוצאה, מתוך הערכים הקיימים; אין ערכים — "—" */
const exactShare = (xs: (number | null | undefined)[], actual: number) => {
  const ok = xs.filter((x): x is number => x != null);
  return ok.length ? `${Math.round((ok.filter((x) => Math.round(x) === actual).length / ok.length) * 100)}%` : "—";
};

/** meanRows — השורות שעליהן מחושב הממוצע (ב"כל הסקרים": כל הסקרים בסינון, לא רק העמוד המוצג) */
function ArchiveTable({ d, missing, title, rows, meanRows = rows, meanLists, parties, open, setOpen, foot }: { d: ElectionData; missing?: string; title: string; rows: ArchiveRow[]; meanRows?: ArchiveRow[]; meanLists?: string[]; parties: "on" | "off"; open: string | null; setOpen: (id: string | null) => void; foot?: ReactNode }) {
  // אין נתון למערכת הזו — "נתון חסר · נשלים בהמשך" באותו מקום (הכרעת בעלים 02.11.2026)
  if (!rows.length) return missing ? <Missing what={missing} /> : null;
  const ready = d.result !== null;
  const actual: Record<string, number> = d.result?.seats ?? {};
  const BLOCS = d.blocs, ACTUAL_BLOCS = actualBlocs(d), listName = d.listName;
  const tagsOf1 = (values: Record<string, { s?: number }>) => tagsOf(d, values);
  const tags = rows.map((r) => tagsOf1(r.values));
  const listCols = parties === "off" ? [] : (() => {
    const seen = new Map<string, number>();
    if (ready) for (const [id, v] of Object.entries(actual)) if (v > 0) seen.set(id, v);
    for (const r of [...rows, ...meanRows]) for (const [id, v] of Object.entries(r.values)) if (!seen.has(id)) seen.set(id, v.s ?? -1);
    return [...seen.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
  })();
  const maxAbs = (xs: (number | null | undefined)[]) => xs.reduce<number>((m, x) => x == null ? m : Math.max(m, Math.abs(x)), 0);
  const listSpan = (id: string) => id in actual ? maxAbs(rows.map((r) => r.values[id]?.s === undefined ? null : r.values[id].s! - actual[id])) : 0;
  const spans = ready ? {
    seats: maxAbs(tags.map((t) => t && 120 - t.seats)),
    exact: maxAbs(tags.map((t) => t && t.of - t.exact)),
    blocErr: maxAbs(tags.map((t) => t?.blocErr)),
    blocs: BLOCS.map((_, i) => maxAbs(rows.map((r) => r.blocs[i] == null ? null : r.blocs[i]! - ACTUAL_BLOCS[i]))),
    lists: Object.fromEntries(listCols.map((id) => [id, listSpan(id)])),
  } : null;
  const cols = listCols.length + 4 + BLOCS.length;
  // שורת הממוצע (הכרעת בעלים 03.11.2026): לכל רשימה — ממוצע הסקרים שפרסמו לה מנדטים; לכל גוש — ממוצע הסקרים שבהם יש לגוש ערך
  const avg = (xs: (number | null | undefined)[]) => { const ok = xs.filter((x): x is number => x != null); return ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10 : null; };
  // תמיד 120 בדיוק (הכרעת בעלים 03.11.2026): הממוצעים מנורמלים ל-120 בשיטת השארית הגדולה, בעשיריות (largestRemainder, מקור אחד)
  const to120 = (w: Record<string, number>) => Object.fromEntries(Object.entries(largestRemainder(1200, w)).map(([k, v]) => [k, v / 10]));
  const rawMeans = Object.fromEntries([...new Set(meanRows.flatMap((r) => Object.keys(r.values)))].filter((id) => !meanLists || meanLists.includes(id)).flatMap((id) => { const m = avg(meanRows.map((r) => r.values[id]?.s)); return m == null ? [] : [[id, m]]; }));
  const meanValues = Object.fromEntries(Object.entries(to120(rawMeans)).filter(([id]) => rawMeans[id] > 0).map(([id, v]) => [id, { s: v }])) as Record<string, { s: number }>;
  const rawBlocs = BLOCS.map((_, i) => avg(meanRows.map((r) => r.blocs[i])));
  const blocs120 = rawBlocs.some((b) => b != null) ? to120(Object.fromEntries(rawBlocs.map((b, i) => [String(i), b ?? 0]))) : null;
  // ברשימות שלא פרשו בלבד — הגוש הוא סכום הממוצעים של הרשימות שבו, כך שגם הוא מגיע ל-120
  const meanBlocs = meanLists ? BLOCS.map((b) => Math.round(b.lists.reduce((t, id) => t + (meanValues[id]?.s ?? 0), 0) * 10) / 10) : rawBlocs.map((b, i) => b == null || !blocs120 ? null : blocs120[String(i)]);
  const accTinted = (t: SeatTags | null) => {
    if (!t || !spans) return accCells(t);
    return <>
      <td style={scaleTint(t.seats - 120, spans.seats)} className="px-1 text-center tabular-nums border-s-2 border-paper-line">{120 - t.seats}</td>
      <td style={scaleTint(t.exact - t.of, spans.exact)} className="px-1 text-center tabular-nums whitespace-nowrap"><bdi dir="ltr">{t.of - t.exact}/{t.of}</bdi></td>
      <td style={scaleTint(-t.blocErr, spans.blocErr)} className="px-1 text-center tabular-nums border-e-2 border-paper-line">{t.blocErr}</td>
    </>;
  };
  return (
    <Card>
      <h3 className="sr-only">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm">
          <caption className="sr-only">{title}: שורה לכל סקר, עמודה לכל רשימה</caption>
          <thead>
            <tr className="text-right border-b border-paper-line">
              <th scope="col" className="py-2 pe-2 min-w-[11rem]">סקר</th>
              <th scope="col" className="px-1 whitespace-nowrap border-s-2 border-paper-line">טעו במנדטים</th>
              <th scope="col" className="px-1 whitespace-nowrap">טעו במפלגות</th>
              <th scope="col" className="px-1 whitespace-nowrap border-e-2 border-paper-line">טעות בגושים</th>
              {BLOCS.map((b, i) => <th key={b.id} scope="col" className={`px-1 whitespace-nowrap${i === BLOCS.length - 1 ? " border-e-2 border-paper-line" : ""}`}>{b.short}</th>)}
              {listCols.map((id) => <th key={id} scope="col" className="px-1 font-medium whitespace-nowrap">{listName(id)}</th>)}
            </tr>
          </thead>
          <tbody>
            {/* תוצאות אמת — בולטת ומופרדת מהסקרים (הכרעת בעלים 03.11.2026) */}
            {ready && <tr className="bg-accent-soft text-sm md:text-base font-extrabold align-top border-b border-paper-line">
              <th scope="row" className="py-2.5 pe-2 text-right">תוצאות אמת</th>
              {accCells(tagsOf1(Object.fromEntries(Object.entries(actual).map(([id, v]) => [id, { s: v }]))))}
              {blocCells(ACTUAL_BLOCS)}
              {listCols.map((id) => <td key={id} className="px-1 text-center tabular-nums">{actual[id] ?? "—"}</td>)}
            </tr>}
            {/* "מרחק ממוצע" (הכרעת בעלים 03.11.2026): הממוצע (אותה נוסחה, מנורמל ל-120) פחות התוצאה, עם חץ וצבע — רכיב Delta האחיד באתר */}
            <tr className="border-b border-paper-line font-semibold align-top">
              <th scope="row" className="py-2 pe-2 text-right">מרחק ממוצע</th>
              {accCells(tagsOf1(meanValues))}
              {meanBlocs.map((v, i) => <td key={i} className={`px-1 text-center tabular-nums${i === meanBlocs.length - 1 ? " border-e-2 border-paper-line" : ""}`}>{gap(v, ready ? ACTUAL_BLOCS[i] : null)}</td>)}
              {listCols.map((id) => <td key={id} className="px-1 text-center tabular-nums">{gap(meanValues[id]?.s ?? (id in actual ? 0 : null), ready && id in actual ? actual[id] : null)}</td>)}
            </tr>
            {/* "אחוז שדייקו" (הכרעת בעלים 03.11.2026): מתוך הסקרים בטבלה שפרסמו נתון לרשימה או לגוש — כמה נתנו בדיוק את התוצאה */}
            {/* קו דק בין שלוש שורות הסיכום, וקו עבה בינן לבין הסקרים (הכרעת בעלים 03.11.2026) */}
            {ready && <tr className="font-semibold align-top [&>*]:border-b-4 [&>*]:border-b-ink">
              <th scope="row" className="py-2 pe-2 text-right">אחוז שדייקו</th>
              <td className="px-1 text-center border-s-2 border-paper-line">—</td><td className="px-1 text-center">—</td><td className="px-1 text-center border-e-2 border-paper-line">—</td>
              {BLOCS.map((_, i) => <td key={i} className={`px-1 text-center tabular-nums${i === BLOCS.length - 1 ? " border-e-2 border-paper-line" : ""}`}>{exactShare(meanRows.map((r) => r.blocs[i]), ACTUAL_BLOCS[i])}</td>)}
              {listCols.map((id) => <td key={id} className="px-1 text-center tabular-nums">{id in actual ? exactShare(meanRows.map((r) => r.values[id]?.s), actual[id]) : "—"}</td>)}
            </tr>}
            {rows.map((r, k) => {
              const isOpen = open === r.id;
              const pctOnly = Object.values(r.values).every((v) => v.s === undefined);
              return (
                <Fragment key={r.id}>
                  <tr className="c-archive-row border-b border-paper-line/60 align-top">
                    <th scope="row" className="py-2 pe-2 text-right font-normal">
                      <button type="button" className="min-h-11 text-right" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                        <span aria-hidden="true" className="text-accent font-bold me-1">{isOpen ? "−" : "+"}</span>
                        {r.head}
                      </button>
                    </th>
                    {accTinted(tags[k])}
                    {blocCells(r.blocs, spans ? (i, v) => scaleTint(v - ACTUAL_BLOCS[i], spans.blocs[i]) : undefined)}
                    {listCols.map((id) => {
                      const v = r.values[id];
                      const tint = spans && v?.s !== undefined && id in actual ? scaleTint(v.s - actual[id], spans.lists[id]) : undefined;
                      return <td key={id} style={tint} className="px-1 text-center tabular-nums whitespace-nowrap">{!v ? "—" : v.s ?? (pctOnly ? `${v.p}%` : `(${v.p}%)`)}</td>;
                    })}
                  </tr>
                  {isOpen && <tr><td colSpan={cols} className="pb-3">{r.details}</td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {foot}
    </Card>
  );
}

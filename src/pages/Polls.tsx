import PersonalBlocs from "../components/PersonalBlocs";
import { seatsOfValues } from "../components/PollAccuracyTags";
import { seatTags, type SeatTags } from "../lib/guessAccuracy";
import { ELECTION_DAY, finalPolls, hasResults, results2026 } from "../lib/guessAccuracyData";
import { SIMPLE_BLOCS } from "../lib/simpleSources";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, Note, Split } from "../components/ui";
import { FIELD_GROUP_LABEL, FIELD_STATUS_LABEL, exitSeats, fieldLabel, groupSeatsIn, listName, polls, pollsterKey, pollsterLabel, subgroupPolls, exitPolls, verificationLabel, type Poll, type SubgroupPoll } from "../lib/data";
import { date, dateRange, num } from "../lib/format";

const FIELD_GROUPS = ["seats", "pct", "sample", "dates"] as const;

const PAGE = 50;
/** ארבעת הגושים בכל סקר — אחרי טורי הדיוק, עם קו הפרדה בסוף (הכרעת בעלים 03.11.2026); החישוב — groupSeatsIn / exitSeats (מקור אחד) */
const blocCells = (vals: (number | null | undefined)[]) => <>{vals.map((v, i) => <td key={i} className={`px-1 text-center tabular-nums${i === vals.length - 1 ? " border-e-2 border-paper-line" : ""}`}>{v == null ? "—" : v}</td>)}</>;
/** שלושת טורי הדיוק — ראשונים בשורה, עם קו הפרדה משני הצדדים (הכרעת בעלים 03.11.2026) */
const accCells = (t: SeatTags | null) => <>
  <td className="px-1 text-center tabular-nums border-s-2 border-paper-line">{t?.seats ?? "—"}</td>
  <td className="px-1 text-center tabular-nums whitespace-nowrap"><bdi dir="ltr">{t ? `${t.exact}/${t.of}` : "—"}</bdi></td>
  <td className="px-1 text-center tabular-nums border-e-2 border-paper-line">{t?.blocErr ?? "—"}</td>
</>;
/** הסקרים האחרונים של כל מכון לפני הבחירות — לתווית "סקר אחרון" */
const finalPollIds = new Set(finalPolls.map((p) => p.id));
/** דיוק מול תוצאות 2026 (מנדטים, מפלגות, גושים) — מקור אחד: seatTags */
const tagsOf = (values: Record<string, { s?: number }>) => hasResults() ? seatTags(seatsOfValues(values), results2026.seats, SIMPLE_BLOCS) : null;

function valuesText(p: Pick<Poll, "values"> | SubgroupPoll) {
  // סקר שהמכון לא המיר למנדטים (רק אחוזים): מציגים אחוז רגיל; הסוגריים שמורים ל"מתחת לאחוז החסימה" בסקר עם מנדטים
  const pctOnly = Object.values(p.values).every((v) => v.s === undefined);
  return Object.entries(p.values)
    .sort(([, a], [, b]) => (b.s ?? b.p ?? -1) - (a.s ?? a.p ?? -1))
    .map(([id, v]) => `${listName(id)} ${v.s ?? (pctOnly ? `${v.p}%` : `(${v.p}%)`)}`)
    .join(" · ");
}

export default function Polls() {
  const pollsters = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const p of polls) {
      const k = pollsterKey(p);
      const cur = m.get(k) ?? { label: pollsterLabel(p), n: 0 };
      cur.n += 1;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, []);
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  // מתג "הצגת המפלגות" (הכרעת בעלים 03.11.2026): כבוי — בלי טורי הרשימות; ברירת המחדל — מוצגות
  const [parties, setParties] = useState<"on" | "off">("on");

  const filtered = polls.filter(
    (p) => (!who || pollsterKey(p) === who) && (!from || p.end >= from) && (!to || p.end <= to),
  );
  // מדגמי 22:00 — בראש הארכיון, כשהמסננים כוללים את יום הבחירות ולא נבחר מכון
  const exitRows = (!who && (!from || ELECTION_DAY >= from) && (!to || ELECTION_DAY <= to) ? [...exitPolls] : []).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  // שלושה קטעים, כל אחד מהחדש לישן, עם קו הפרדה לרוחב: מדגמי 22:00 · הסקרים האחרונים · כל השאר (הכרעת בעלים 03.11.2026)
  const byNewest = (a: Poll, b: Poll) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start);
  const finalRows = filtered.filter((p) => finalPollIds.has(p.id)).sort(byNewest);
  const restAll = filtered.filter((p) => !finalPollIds.has(p.id)).sort(byNewest);
  const restRows = restAll.slice(0, shown);
  // עמודה לכל רשימה שמופיעה בשורות המוצגות, לפי הגודל בשורה הראשונה שבה הופיעה
  const listCols = parties === "off" ? [] : (() => {
    const seen = new Map<string, number>();
    for (const p of [...exitRows, ...finalRows, ...restRows]) for (const [id, v] of Object.entries(p.values) as [string, { s?: number; p?: number }][]) if (!seen.has(id)) seen.set(id, v.s ?? -1);
    return [...seen.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
  })();

  return (
    <>

      <Split title="ארכיון הסקרים" lead="כל סקרי המנדטים מאז הבחירות לכנסת ה-25 (נובמבר 2022), מהחדש לישן. ההרכב של המפלגות השתנה במהלך המחזור — כל סקר מוצג כפי שפורסם." primary={<>
      <Card>
        <form className="flex flex-wrap gap-3 items-end" onSubmit={(e) => e.preventDefault()}>
          <label className="flex flex-col text-sm w-full sm:w-auto min-w-0">
            מכון ומזמין
            <select className="border border-paper-line rounded px-2 py-1 mt-1 w-full sm:w-auto max-w-full" value={who} onChange={(e) => { setWho(e.target.value); setShown(PAGE); }}>
              <option value="">כולם ({polls.length})</option>
              {pollsters.map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.n})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm w-full sm:w-auto min-w-0">
            מתאריך
            <input type="date" className="border border-paper-line rounded px-2 py-1 mt-1 w-full sm:w-auto max-w-full" value={from} onChange={(e) => { setFrom(e.target.value); setShown(PAGE); }} />
          </label>
          <label className="flex flex-col text-sm w-full sm:w-auto min-w-0">
            עד תאריך
            <input type="date" className="border border-paper-line rounded px-2 py-1 mt-1 w-full sm:w-auto max-w-full" value={to} onChange={(e) => { setTo(e.target.value); setShown(PAGE); }} />
          </label>
          {/* כפתור אחד (הכרעת בעלים 03.11.2026): דולק — רגיל; כבוי — אפור */}
          <button type="button" aria-pressed={parties === "on"} onClick={() => setParties(parties === "on" ? "off" : "on")} className={`f-btn min-h-11${parties === "on" ? "" : " opacity-60 grayscale text-ink-soft"}`}>הצגת מפלגות</button>
        </form>
      </Card>

      </>} secondary={<>
      {filtered.length === 0 && <p role="status" className="c-empty">אין סקרים בטווח שנבחר. <button type="button" className="underline min-h-11" onClick={() => { setWho(""); setFrom(""); setTo(""); setShown(PAGE); }}>איפוס המסננים</button></p>}
      {/* בלי סינון זה ממוצע הסקרים שבמגירה "הסקרים מול התוצאה" — מוצג רק כשיש סינון (הכרעת בעלים 03.11.2026) */}
      {(who || from || to) && <PersonalBlocs title="חלוקת הכנסת בסקרים המסוננים בארכיון" source="סיכום הגושים בסקרים המוצגים לפי המסננים" asOf={`${from || "תחילת הארכיון"} — ${to || "הסקר האחרון"}`} datasets={[...finalRows, ...restRows].map(p => ({ poll: p, values: Object.fromEntries(Object.keys(p.values).map(id => [id, p.values[id].s ?? (p.values[id].p !== undefined && p.values[id].p! < 3.25 ? 0 : undefined)])), source: `סקר ${pollsterLabel(p)}`, asOf: date(p.end) }))} />}
      <Card>
        {/* טבלה אחת לכל הסקרים, כולל הסקר האחרון של כל מכון ומדגמי 22:00, עם תווית (הכרעת בעלים 03.11.2026); שורת ההסבר — באישור הבעלים */}
        <p className="text-sm text-ink-soft mb-2">לחיצה על סקר מציגה את הנתונים המלאים שלו.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <caption className="sr-only">ארכיון הסקרים: שורה לכל סקר, עמודה לכל רשימה</caption>
            <thead>
              <tr className="text-right border-b border-paper-line">
                <th scope="col" className="py-2 pe-2 min-w-[11rem]">סקר</th>
                <th scope="col" className="px-1 whitespace-nowrap border-s-2 border-paper-line">מנדטים מדויקים</th>
                <th scope="col" className="px-1 whitespace-nowrap">מפלגות מדויקות</th>
                <th scope="col" className="px-1 whitespace-nowrap border-e-2 border-paper-line">טעות בגושים</th>
                {SIMPLE_BLOCS.map((b, i) => <th key={b.id} scope="col" className={`px-1 whitespace-nowrap${i === SIMPLE_BLOCS.length - 1 ? " border-e-2 border-paper-line" : ""}`}>{b.short}</th>)}
                {listCols.map((id) => <th key={id} scope="col" className="px-1 font-medium whitespace-nowrap">{listName(id)}</th>)}
              </tr>
            </thead>
            <tbody>
              {exitRows.map((p) => {
                const isOpen = open === p.id;
                const t = tagsOf(p.values);
                return (
                  <Fragment key={p.id}>
                    <tr className="border-b border-paper-line/60 align-top">
                      <th scope="row" className="py-2 pe-2 text-right font-normal">
                        <button type="button" className="min-h-11 text-right" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                          <span aria-hidden="true" className="text-accent font-bold me-1">{isOpen ? "−" : "+"}</span>
                          <span className="font-bold">{date(ELECTION_DAY)}</span> {p.firmHe} · {p.publisherHe}
                        </button>
                      </th>
                      {accCells(t)}
                      {blocCells(SIMPLE_BLOCS.map((b) => exitSeats(p, [...b.lists])))}
                      {listCols.map((id) => <td key={id} className="px-1 text-center tabular-nums">{p.values[id]?.s ?? "—"}</td>)}
                    </tr>
                    {isOpen && <tr><td colSpan={listCols.length + 4 + SIMPLE_BLOCS.length} className="pb-3">
                      <dl className="text-sm bg-paper rounded p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <dt className="font-bold">סוג</dt><dd className="flex flex-wrap gap-1"><Badge tone="ok">מדגם 22:00</Badge><Badge>{p.verified ? "אומת" : "לא אומת"}</Badge></dd>
                        <dt className="font-bold">עורך המדגם</dt><dd>{p.firmHe}</dd>
                        {p.note && <><dt className="font-bold">הערה</dt><dd>{p.note}</dd></>}
                        <dt className="font-bold">פרסום מקורי</dt>
                        <dd className="break-all">{p.urls.map((u) => <a key={u} href={u} rel="noopener noreferrer" className="block">{u}</a>)}</dd>
                      </dl>
                    </td></tr>}
                  </Fragment>
                );
              })}
              {[...finalRows, ...restRows].map((p, k) => {
                // קו הפרדה לרוחב בתחילת כל קטע
                const sectionStart = (k === 0 && exitRows.length > 0) || (k === finalRows.length && finalRows.length > 0);
                const isOpen = open === p.id;
                const label = p.verification ? verificationLabel(p.verification.status) : null;
                const pctOnly = Object.values(p.values).every((v) => v.s === undefined);
                const t = tagsOf(p.values);
                return (
                  <Fragment key={p.id}>
                    <tr className={`c-archive-row border-b border-paper-line/60 align-top${sectionStart ? " [&>*]:border-t-4 [&>*]:border-t-ink-soft" : ""}`}>
                      <th scope="row" className="py-2 pe-2 text-right font-normal">
                        <button type="button" className="min-h-11 text-right" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                          <span aria-hidden="true" className="text-accent font-bold me-1">{isOpen ? "−" : "+"}</span>
                          <span className="font-bold whitespace-nowrap">{dateRange(p.start, p.end)}</span> {pollsterLabel(p)}
                        </button>
                      </th>
                      {accCells(t)}
                      {blocCells(SIMPLE_BLOCS.map((b) => groupSeatsIn(p, [...b.lists])))}
                      {listCols.map((id) => { const v = p.values[id]; return <td key={id} className="px-1 text-center tabular-nums whitespace-nowrap">{!v ? "—" : v.s ?? (pctOnly ? `${v.p}%` : `(${v.p}%)`)}</td>; })}
                    </tr>
                    {isOpen && <tr><td colSpan={listCols.length + 4 + SIMPLE_BLOCS.length} className="pb-3">
                  <dl className="text-sm bg-paper rounded p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
                          {label!.text} · נבדק {date(p.verification.checkedAt)}
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
                      ויקיפדיה האנגלית, "{p.source.page}" (שורה {p.source.tableLine} בטקסט המקור)
                    </dd>
                  </dl>
                    </td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown < restAll.length && (
          <button type="button" className="mt-3 border border-paper-line rounded px-3 py-2" onClick={() => setShown((s) => s + PAGE)}>
            עוד {Math.min(PAGE, restAll.length - shown)} סקרים
          </button>
        )}
        <Note>
          אחוז בסוגריים = הרשימה מתחת לאחוז החסימה באותו סקר. "אומת" = הסקר הושווה לפרסום המקורי (מצב הבדיקה של כל שדה — בכרטיס הסקר). "תוקן לפי המקור" = נמצא
          הבדל מטבלת ויקיפדיה, והאתר מציג את מה שבפרסום המקורי (הפירוט בכרטיס הסקר). "מקור: ויקיפדיה" = טרם הושווה לפרסום המקורי.
          העדכון האחרון: {date(polls[0]?.end ?? "")}.
        </Note>
      </Card>
      {/* מדגמי 22:00 — מגירה נפרדת במסך "סקרים" (הכרעת בעלים 02.11.2026) */}
      {subgroupPolls.length > 0 && (
        <Card>
          <h2 className="font-bold text-lg">סקרים על קבוצת אוכלוסייה מסוימת</h2>
          <p className="text-sm text-ink-soft mt-1">
            סקרים שנשאלה בהם רק קבוצה אחת (למשל צעירים, ליברלים או הציבור הערבי), ולכן אינם מייצגים את כלל הציבור. הם מוצגים כאן לעיון בלבד, ואינם נכנסים לממוצעים ולחישובים. סקר שהמכון לא המיר למנדטים מוצג באחוזים.
          </p>
          <ul className="divide-y divide-paper-line mt-2">
            {subgroupPolls.map((p) => (
              <li key={p.id} className="py-3 min-w-0">
                <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                  <span className="font-bold whitespace-nowrap">{dateRange(p.start, p.end)}</span>
                  <span>{p.firmHe} · {p.publisherHe}</span>
                  <span className="text-ink-soft text-sm">מדגם {num(p.sample)}</span>
                  <Badge>לא נכנס לסטטיסטיקות של כלל הציבור</Badge>
                </div>
                <p className="text-sm mt-1"><span className="font-bold">האוכלוסייה:</span> {p.population}</p>
                <p className="text-sm text-ink-soft mt-1">{valuesText(p)}</p>
                {p.note && <p className="text-sm text-ink-soft mt-1">{p.note}</p>}
                <p className="text-sm mt-1 break-all">
                  פרסום מקורי:{" "}
                  {p.urls.map((u) => (
                    <a key={u} href={u} rel="noopener noreferrer">{u}</a>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
      </>} />
    </>
  );
}

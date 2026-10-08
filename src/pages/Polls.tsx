import PersonalBlocs from "../components/PersonalBlocs";
import { useMemo, useState } from "react";
import { Badge, Card, Note, PageTitle } from "../components/ui";
import { fieldLabel, listName, polls, pollsterKey, pollsterLabel, verificationLabel, type Poll } from "../lib/data";
import { date, dateRange, num } from "../lib/format";

const PAGE = 50;

function valuesText(p: Poll) {
  return Object.entries(p.values)
    .sort(([, a], [, b]) => (b.s ?? -1) - (a.s ?? -1))
    .map(([id, v]) => `${listName(id)} ${v.s ?? `(${v.p}%)`}`)
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

  const filtered = polls.filter(
    (p) => (!who || pollsterKey(p) === who) && (!from || p.end >= from) && (!to || p.end <= to),
  );

  return (
    <>
      <PageTitle lead="כל סקרי המנדטים מאז הבחירות לכנסת ה-25 (נובמבר 2022), מהחדש לישן. ההרכב של המפלגות השתנה במהלך המחזור — כל סקר מוצג כפי שפורסם.">
        ארכיון הסקרים
      </PageTitle>

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
          <p className="text-sm text-ink-soft" aria-live="polite">
            {filtered.length} סקרים
          </p>
        </form>
      </Card>

      <Card>
        <ul className="divide-y divide-paper-line">
          {filtered.slice(0, shown).map((p) => {
            const isOpen = open === p.id;
            const label = p.verification ? verificationLabel(p.verification.status) : null;
            return (
              <li key={p.id} className="py-3 min-w-0">
                <button
                  type="button"
                  className="w-full text-right flex flex-wrap gap-x-3 gap-y-1 items-baseline"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : p.id)}
                >
                  <span className="font-bold whitespace-nowrap">{dateRange(p.start, p.end)}</span>
                  <span>{pollsterLabel(p)}</span>
                  {p.sample && <span className="text-ink-soft text-sm">מדגם {num(p.sample)}</span>}
                  {!p.consistent && <Badge tone="warn">סכום המנדטים אינו 120</Badge>}
                  {p.verification ? (
                    <Badge tone={label!.tone === "ok" ? "ok" : label!.tone === "warn" ? "warn" : "neutral"}>
                      {label!.text}
                    </Badge>
                  ) : (
                    <Badge>מקור: ויקיפדיה</Badge>
                  )}
                </button>
                <p className="text-sm text-ink-soft mt-1">{valuesText(p)}</p>
                <PersonalBlocs values={Object.fromEntries(Object.keys(p.values).map(id => [id, p.values[id].s ?? (p.values[id].p !== undefined && p.values[id].p! < 3.25 ? 0 : undefined)]))} source={`סקר ${pollsterLabel(p)}`} asOf={date(p.end)} />
                {isOpen && (
                  <dl className="mt-2 text-sm bg-paper rounded p-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
                )}
              </li>
            );
          })}
        </ul>
        {shown < filtered.length && (
          <button type="button" className="mt-3 border border-paper-line rounded px-3 py-2" onClick={() => setShown((s) => s + PAGE)}>
            עוד {Math.min(PAGE, filtered.length - shown)} סקרים
          </button>
        )}
        <Note>
          אחוז בסוגריים = הרשימה מתחת לאחוז החסימה באותו סקר. "אומת" = המספרים הושוו לפרסום המקורי ותואמים. "תוקן לפי המקור" = נמצא
          הבדל מטבלת ויקיפדיה, והאתר מציג את מה שבפרסום המקורי (הפירוט בכרטיס הסקר). "מקור: ויקיפדיה" = טרם הושווה לפרסום המקורי.
          העדכון האחרון: {date(polls[0]?.end ?? "")}.
        </Note>
      </Card>
    </>
  );
}

import { POLL_AVERAGE } from "../lib/sources";
import { useState } from "react";
import { Link } from "react-router-dom";
import PersonalBlocs from "../components/PersonalBlocs";
import Explained from "../components/Explained";
import { Segmented } from "../components/Choice";
import { PollRanges, Ranking } from "../components/homeCharts";
import { Badge, Fold, Note, Split } from "../components/ui";
import { lists2026, listName, mean, meta, passesInMost, pollsterLabel, seatsIn, summarize, type Poll } from "../lib/data";
import { date, dateRange, num, rng, seatsFmt } from "../lib/format";
import { HOME, LATEST_POLLS } from "../lib/homeData";

const WINDOW_DAYS = 14;

function govSum(p: Poll): number | undefined {
  const ids = lists2026.filter((l) => l.gov37).map((l) => l.id);
  let s = 0;
  for (const id of ids) {
    const v = seatsIn(p, id);
    if (v === undefined) return undefined;
    s += v;
  }
  return s;
}

type BlocBasis = "model" | "polls";

export default function Today() {
  const asOf = POLL_AVERAGE.asOf;
  const latest = LATEST_POLLS;
  const ids = lists2026.map((l) => l.id);
  const summary = summarize(latest, ids);
  const above = summary.filter(passesInMost);
  const below = summary.filter((s) => !passesInMost(s));
  const govs = latest.map(govSum).filter((x): x is number => typeof x === "number");
  const likudBy = latest
    .map((p) => ({ p, v: seatsIn(p, "likud") }))
    .filter((x): x is { p: Poll; v: number } => typeof x.v === "number")
    .sort((a, b) => b.v - a.v);
  const asOfText = `הסקרים שפורסמו עד ${date(asOf)}`;
  // מופע אחד של "הגושים שלי" (החלטה 10, 9.10.2026): מעבר בין ממוצע המודל לבין כל סקר אחרון
  const [basis, setBasis] = useState<BlocBasis>("model");

  return (
    <>
      <Split
        title="המצב היום"
        secondaryFirst
        lead={`${POLL_AVERAGE.polls} סקרים של ${POLL_AVERAGE.pollsters} מכונים, עד ${date(POLL_AVERAGE.asOf)}.`}
        primary={
          <>
            <Segmented
              label="הגושים שלי לפי"
              value={basis}
              onChange={setBasis}
              options={[{ id: "model", label: "ממוצע המודל" }, { id: "polls", label: "כל סקר אחרון" }]}
            />
            {basis === "model" ? (
              <PersonalBlocs title="הגושים שלי לפי ממוצע הסקרים" values={POLL_AVERAGE.seats} source="מנדטים לפי ממוצע המודל, זהים לטבלת המפלגות" asOf={date(POLL_AVERAGE.asOf)} />
            ) : (
              <PersonalBlocs
                title="הגושים שלי בכל סקר אחרון"
                source="הסקרים האחרונים של המכונים, כל מקור בנפרד"
                asOf={date(POLL_AVERAGE.asOf)}
                datasets={latest.map((p) => ({ poll: p, values: Object.fromEntries(ids.map((id) => [id, seatsIn(p, id)])), source: pollsterLabel(p), asOf: date(p.end) }))}
              />
            )}
          </>
        }
        secondary={
          <>
            <section aria-label="הרשימות היום" className="mb-6">
              <h2 className="text-xl font-display leading-tight mb-3">כל הרשימות</h2>
              <Explained
                kind="תרחיש"
                source={`${POLL_AVERAGE.polls} סקרים, מנוע החוק (אחוז חסימה, הסכמי עודפים שדווחו, באדר-עופר) ו-${num(20000)} תרחישים`}
                asOf={`הסקרים עד ${date(POLL_AVERAGE.asOf)}`}
                assumption="מנדטים לפי הממוצע של המודל; הטווח והסטטוס — מתוך התרחישים ליום הבחירות. לא תחזית ולא סיכוי."
                methodAnchor="model"
              >
                <Ranking home={HOME} />
              </Explained>
              <p className="mt-3">
                <Link to="/today?tab=scenarios" className="font-bold">
                  כל התרחישים, הטווחים ובדיקת העבר
                </Link>
              </p>
            </section>

            <Fold title="לפי המכונים: הסקר האחרון של כל אחד">
              <p className="text-sm text-ink-soft mb-3">
                {`הסקר האחרון של כל מכון ב-${WINDOW_DAYS} הימים שעד ${date(asOf)} — ${latest.length} מכונים. הממוצע בין המכונים, והטווח מהנמוך לגבוה.`}
              </p>
              <Explained
                kind="סיכום סקרים"
                source="טבלאות הסקרים בוויקיפדיה האנגלית, עם קישור לפרסום המקורי של כל סקר"
                asOf={asOfText}
                assumption="כל מכון נספר פעם אחת (הסקר האחרון שלו). זה סיכום תיאורי של מה שפורסם — לא תחזית ולא מודל."
                methodAnchor="current"
              >
                <PollRanges rows={above.map((s) => ({ id: s.id, name: listName(s.id), central: Math.round(s.mean * 10) / 10, values: latest.map((p) => seatsIn(p, s.id)).filter((x): x is number => typeof x === "number") }))} />
              </Explained>
              {below.length > 0 && (
                <Note>
                  מתחת לאחוז החסימה אצל רוב המכונים: {below.map((s) => `${listName(s.id)} (עוברת ב-${s.n - s.belowCount} מתוך ${s.n} מכונים)`).join(" · ")}.
                </Note>
              )}
            </Fold>

            <div className="grid md:grid-cols-2 gap-5 [&>*]:min-w-0">
              <Fold title="מפלגות הממשלה היוצאת בסקרים האחרונים">
                <Explained
                  kind="סיכום סקרים"
                  source="סכום המנדטים של הליכוד, הציונות הדתית-זהות, עוצמה יהודית, ש&quot;ס ויהדות התורה בכל סקר"
                  asOf={asOfText}
                  assumption="הקבוצה מוגדרת לפי הרכב הממשלה ה-37, לא לפי הצהרות על קואליציה עתידית. במחשב אפשר להגדיר קבוצה אחרת."
                  methodAnchor="current"
                >
                  <p className="text-4xl font-extrabold tabular-nums">
                    {govs.length ? seatsFmt(mean(govs)) : "—"}
                    <span className="text-lg font-medium text-ink-soft"> מנדטים, ממוצע המכונים</span>
                  </p>
                  {govs.length > 0 && (
                    <p className="text-ink-soft">
                      טווח בין המכונים: {rng(Math.min(...govs), Math.max(...govs))} · רוב בכנסת: 61
                    </p>
                  )}
                </Explained>
              </Fold>

              <Fold title="הפער בין מכוני הסקרים">
                <p className="text-sm text-ink-soft mb-2">הליכוד בסקר האחרון של כל מכון:</p>
                <ul className="text-sm space-y-1">
                  {likudBy.map(({ p, v }) => (
                    <li key={p.id} className="flex justify-between gap-3">
                      <span>{pollsterLabel(p)}</span>
                      <span className="tabular-nums font-bold">{v}</span>
                    </li>
                  ))}
                </ul>
                <Note>
                  הפער בין המכונים גדול מטעות הדגימה של כל סקר בודד. לכן מוצג טווח ולא מספר אחד, ואפשר לראות כל מכון בנפרד ב
                  <Link to="/polls?tab=trends">מגמות</Link>.
                </Note>
              </Fold>
            </div>

            <Fold title="הסקרים שנכללו">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">הסקר האחרון של כל מכון, לפי רשימה</caption>
                  <thead>
                    <tr className="text-right border-b border-paper-line">
                      <th scope="col" className="py-2 pe-3">מכון · מזמין</th>
                      <th scope="col" className="pe-3">תאריך</th>
                      <th scope="col" className="pe-3">מדגם</th>
                      {above.map((s) => (
                        <th key={s.id} scope="col" className="pe-2 font-medium whitespace-nowrap">
                          {listName(s.id)}
                        </th>
                      ))}
                      <th scope="col">פרטים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.map((p) => (
                      <tr key={p.id} className="border-b border-paper-line/60">
                        <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">
                          {pollsterLabel(p)} {p.verification && p.verified && <Badge tone="ok">{p.verification.status === "corrected" ? "תוקן לפי המקור" : "אומת"}</Badge>}
                        </th>
                        <td className="pe-3 whitespace-nowrap">{dateRange(p.start, p.end)}</td>
                        <td className="pe-3 tabular-nums">{p.sample ? num(p.sample) : "—"}</td>
                        {above.map((s) => {
                          const v = p.values[s.id];
                          return (
                            <td key={s.id} className="pe-2 tabular-nums">
                              {v?.s ?? (v?.p !== undefined ? <span className="text-ink-faint">{v.p}%</span> : "—")}
                            </td>
                          );
                        })}
                        <td>
                          {p.urls[0] ? (
                            <a href={p.urls[0]} rel="noopener noreferrer">
                              מקור
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Note>
                אחוז בתא = הרשימה מתחת לאחוז החסימה באותו סקר. "—" = לא נשאלה או לא דווחה. סקר שפורסם לציבור נכנס לאתר ללא השהיה נוספת. נתונים נכונים ל-{date(meta.dataAsOf)}.
              </Note>
            </Fold>
          </>
        }
      />
    </>
  );
}

import { Link } from "react-router-dom";
import Explained from "../components/Explained";
import { SeatRangeBars } from "../components/charts";
import ListsView, { type ListRow } from "../components/ListsView";
import modelFile from "../data/model.json";
import { useTheme } from "../lib/theme";
import { Badge, Card, Fold, Note, PageTitle } from "../components/ui";
import { lastPollDate, latestPerPollster, lists2026, listName, median, meta, passesInAll, pollsterLabel, results, seatsIn, summarize, type Poll } from "../lib/data";
import { date, dateLong, dateRange, num, seatsFmt } from "../lib/format";

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

interface ModelLite {
  asof: string;
  polls: number;
  pollsters: number;
  central: { seats: Record<string, number> };
  scenarios: { lists: Record<string, { seats: number[]; pass: number; share: number[] }>; wasted: number[]; bloc: { seats: number[]; atLeast61: number } };
}
const model = modelFile as unknown as ModelLite;
const modelRows: ListRow[] = Object.keys(model.scenarios.lists)
  .map((id) => ({ id, name: "", central: model.central.seats[id], lo: model.scenarios.lists[id].seats[0], hi: model.scenarios.lists[id].seats[2], pass: model.scenarios.lists[id].pass }))
  .sort((a, b) => b.central - a.central || model.scenarios.lists[b.id].share[1] - model.scenarios.lists[a.id].share[1]);
const r1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("he-IL");

const k25 = results[results.length - 1];
const passing2022 = k25.lists.filter((l) => l.seats > 0).reduce((a, l) => a + l.votes, 0);
const wasted2022 = k25.valid - passing2022;

export default function Today() {
  const asOf = lastPollDate();
  const latest = latestPerPollster(asOf, WINDOW_DAYS);
  const ids = lists2026.map((l) => l.id);
  const summary = summarize(latest, ids);
  const above = summary.filter((s) => s.median > 0);
  const below = summary.filter((s) => s.median === 0);
  const govs = latest.map(govSum).filter((x): x is number => typeof x === "number");
  const likudBy = latest
    .map((p) => ({ p, v: seatsIn(p, "likud") }))
    .filter((x): x is { p: Poll; v: number } => typeof x.v === "number")
    .sort((a, b) => b.v - a.v);
  const asOfText = `הסקרים שפורסמו עד ${dateLong(asOf)}`;
  const [theme] = useTheme();
  const rows = modelRows.map((r) => ({ ...r, name: listName(r.id), sure: passesInAll(latest, r.id) }));
  const edge = rows.filter((r) => !r.sure && r.pass > 0.005 && r.pass < 0.995);
  const sc = model.scenarios;

  return (
    <>
      <PageTitle
        lead={`לפי ממוצע הסקרים מאז הגשת הרשימות: ${model.polls} סקרים מאומתים של ${model.pollsters} מכונים, עד ${dateLong(model.asof)}. לכל רשימה — כמה מנדטים לפי הממוצע, הטווח ב-80% מהתרחישים, והאם היא עוברת את אחוז החסימה.`}
      >
        המצב היום
      </PageTitle>

      <section aria-label="הרשימות היום" className="mb-6">
        <Explained
          kind="תרחיש"
          source={`${model.polls} סקרים מאומתים, מנוע החוק (אחוז חסימה, הסכמי עודפים שדווחו, באדר-עופר) ו-${num(20000)} תרחישים`}
          asOf={`הסקרים עד ${dateLong(model.asof)}`}
          assumption="מנדטים לפי הממוצע של המודל; הטווח והסטטוס — מתוך התרחישים ליום הבחירות. לא תחזית ולא סיכוי."
          methodAnchor="model"
        >
          <ListsView rows={rows} theme={theme} />
        </Explained>
      </section>

      <Card title="מה רואים היום">
        <ul className="space-y-2 text-base leading-relaxed">
          {edge.length > 0 && (
            <li>
              {edge.length === 1 ? "רשימה אחת על הסף" : `${edge.length} רשימות על הסף`}:{" "}
              {edge.map((r) => `${r.name} עוברת ב-${Math.round(r.pass * 100)}% מהתרחישים`).join(", ")}.
            </li>
          )}
          <li>
            בחציון התרחישים, כ-{r1(sc.wasted[1])}% מהקולות הכשרים לא יהפכו למנדטים, כי ילכו לרשימות שלא עוברות את הסף (ב-2022:{" "}
            {r1((wasted2022 / k25.valid) * 100)}%).
          </li>
          <li>
            מפלגות הממשלה היוצאת: {sc.bloc.seats[1]} מנדטים בחציון התרחישים, ובין {sc.bloc.seats[0]} ל-{sc.bloc.seats[2]} ב-80% מהם.
          </li>
        </ul>
        <p className="mt-3">
          <Link to="/today?tab=scenarios" className="font-bold">
            כל התרחישים, הטווחים ובדיקת העבר
          </Link>
        </p>
      </Card>

      <Fold title="לפי המכונים: הסקר האחרון של כל אחד">
        <p className="text-sm text-ink-soft mb-3">
          {`הסקר האחרון של כל מכון ב-${WINDOW_DAYS} הימים שעד ${dateLong(asOf)} — ${latest.length} מכונים. החציון בין המכונים, והטווח מהנמוך לגבוה.`}
        </p>
        <Explained
          kind="סיכום סקרים"
          source="טבלאות הסקרים בוויקיפדיה האנגלית, עם קישור לפרסום המקורי של כל סקר"
          asOf={asOfText}
          assumption="כל מכון נספר פעם אחת (הסקר האחרון שלו). זה סיכום תיאורי של מה שפורסם — לא תחזית ולא מודל."
          methodAnchor="current"
        >
          <SeatRangeBars
            caption="חציון וטווח המנדטים לכל רשימה בסקרים האחרונים"
            rows={above.map((s) => ({ id: s.id, name: listName(s.id), median: s.median, min: s.min, max: s.max }))}
          />
        </Explained>
        {below.length > 0 && (
          <Note>
            מתחת לאחוז החסימה בחציון: {below.map((s) => `${listName(s.id)} (עוברת ב-${s.n - s.belowCount} מתוך ${s.n} מכונים)`).join(" · ")}.
          </Note>
        )}
      </Fold>

      <div className="grid md:grid-cols-2 gap-5 [&>*]:min-w-0">
        <Fold title="מפלגות הממשלה היוצאת (ממשלה 37)">
          <Explained
            kind="סיכום סקרים"
            source="סכום המנדטים של הליכוד, הציונות הדתית-זהות, עוצמה יהודית, ש&quot;ס ויהדות התורה בכל סקר"
            asOf={asOfText}
            assumption="הקבוצה מוגדרת לפי הרכב הממשלה ה-37, לא לפי הצהרות על קואליציה עתידית. במחשבון אפשר להגדיר קבוצה אחרת."
            methodAnchor="current"
          >
            <p className="text-4xl font-extrabold tabular-nums">
              {govs.length ? seatsFmt(median(govs)) : "—"}
              <span className="text-lg font-medium text-ink-soft"> מנדטים בחציון</span>
            </p>
            {govs.length > 0 && (
              <p className="text-ink-soft">
                טווח בין המכונים: {Math.min(...govs)}–{Math.max(...govs)} · רוב בכנסת: 61
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
          אחוז בתא = הרשימה מתחת לאחוז החסימה באותו סקר. "—" = לא נשאלה או לא דווחה. סקר נכנס לאתר 24 שעות אחרי פרסומו
          הראשון. נתונים נכונים ל-{date(meta.dataAsOf)}.
        </Note>
      </Fold>

    </>
  );
}

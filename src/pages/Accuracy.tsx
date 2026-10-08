import PersonalBlocs from "../components/PersonalBlocs";
import { useMemo, useState } from "react";
import { EstimateVsActual, TrendChart, type Series } from "../components/charts";
import Explained from "../components/Explained";
import { Card, ChartWithTable, Note, PageTitle } from "../components/ui";
import historyFile from "../data/history.json";
import { results } from "../lib/data";
import { dateRange, date, seatsFmt, signed } from "../lib/format";
import {
  EVE_DAYS,
  campaignTrend,
  comparedLists,
  familyRows,
  pollGap,
  pollsterRecords,
  seatsOf,
  summarizeCycle,
  toTime,
  usable,
  type Cycle,
  type ElectionResult,
} from "../lib/history";

const cycles = historyFile.cycles as unknown as Cycle[];
const res = results as unknown as ElectionResult[];
const summaries = cycles.map((c) => summarizeCycle(c, res.find((r) => r.id === c.id)!));
const families = familyRows(summaries);
const pollsters = pollsterRecords(cycles, res).filter((p) => p.entries.length >= 2);
const newestFirst = [...summaries].reverse();

/** הפרש עם סימן, בכיוון קריאה תקין גם בתוך טקסט עברי */
function Signed({ n }: { n: number }) {
  return <bdi dir="ltr">{signed(n)}</bdi>;
}

const fmtEst = (x: number) => (Number.isNaN(x) ? "—" : seatsFmt(x));
const SOURCE = "טבלאות הסקרים בוויקיפדיה האנגלית לכל מערכת (עם קישור לפרסום המקורי), והתוצאות הרשמיות של ועדת הבחירות";

/** דפוס שחזר: כיוון ההפרש זהה בכל המערכות, או בכולן חוץ מאחת */
function patternText(r: (typeof families)[number]): string | null {
  const n = r.cells.length;
  const avg = seatsFmt(Math.abs(Math.round(r.meanDiff * 10) / 10));
  const [k, dir] = r.under >= r.over ? [r.under, "גבוהה"] : [r.over, "נמוכה"];
  if (k === n) return `${r.name}: בכל ${n} המערכות התוצאה בפועל הייתה ${dir} מחציון הסקרים (בממוצע ב-${avg} מנדטים).`;
  if (k === n - 1) return `${r.name}: ב-${k} מתוך ${n} המערכות התוצאה בפועל הייתה ${dir} מחציון הסקרים.`;
  return null;
}

/** טווח סך הפער בין המכונים בכל מערכת — כדי להראות שההבדל בין מערכות גדול מההבדל בין מכונים */
const spread = cycles.map((c) => {
  const gaps = pollsterRecords([c], res).map((p) => p.entries[0].gap);
  return { label: c.label, min: Math.min(...gaps), max: Math.max(...gaps) };
});
const r1 = (x: number) => seatsFmt(Math.round(x * 10) / 10);

export default function Accuracy() {
  const [id, setId] = useState("k25");
  const s = summaries.find((x) => x.cycle.id === id)!;
  const c = s.cycle;
  const lists = useMemo(() => comparedLists(c, s.result).sort((a, b) => b.seats - a.seats), [c, s.result]);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const shown = picked[id] ?? lists.slice(0, 6).map((l) => l.letters);
  const toggle = (letters: string) =>
    setPicked((cur) => ({ ...cur, [id]: shown.includes(letters) ? shown.filter((x) => x !== letters) : [...shown, letters] }));

  const all = usable(c);
  const first = all.reduce((a, p) => (p.end < a ? p.end : a), all[0].end);
  const series: Series[] = shown
    .map((letters) => {
      const l = lists.find((x) => x.letters === letters);
      const points = campaignTrend(c, letters);
      const last = points[points.length - 1];
      return { id: letters, name: l?.short ?? letters, points, endLabel: last ? `${l?.short} ${seatsFmt(last.v)} ⇐ ${l?.seats}` : undefined };
    })
    .filter((x) => x.points.length > 0);
  const markers = shown.map((letters) => ({ id: letters, t: toTime(c.date), v: lists.find((l) => l.letters === letters)?.seats ?? 0 }));
  const dots = all.flatMap((p) => shown.map((letters) => ({ id: letters, t: toTime(p.end), v: seatsOf(p, letters) }))).filter(
    (d): d is { id: string; t: number; v: number } => typeof d.v === "number",
  );
  const yMax = Math.max(10, Math.ceil(Math.max(...series.flatMap((x) => x.points.map((p) => p.v)), ...markers.map((m) => m.v), 0) / 5) * 5 + 5);
  const maxSeats = Math.max(30, ...s.rows.map((r) => Math.max(r.actual, Number.isNaN(r.max) ? 0 : r.max))) + 2;
  const eveText = `הסקר האחרון של כל מכון ב-${EVE_DAYS} הימים שלפני ${date(c.date)}`;

  return (
    <>
      <PageTitle
        lead={`מה אמרו הסקרים ערב כל אחת מחמש מערכות הבחירות האחרונות, ומה יצא בפועל. החישוב זהה לעמוד "המצב היום": הסקר האחרון של כל מכון ב-${EVE_DAYS} הימים שלפני הבחירות, והחציון ביניהם.`}
      >
        דיוק הסקרים בעבר
      </PageTitle>

      <Card title="חמש מערכות במבט אחד">
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf="ערב כל מערכת בחירות"
          assumption='"סך הפער" = סכום ההפרשים בין חציון הסקרים לתוצאה, על פני כל הרשימות. הגוש = הרשימות שהמליצו על נתניהו לנשיא המדינה אחרי אותן בחירות — עובדה, לא סיווג.'
          methodAnchor="accuracy"
        >
          <ul className="md:hidden space-y-3 text-sm">
            {newestFirst.map((x) => (
              <li key={x.cycle.id} className="border-b border-paper-line/60 pb-2">
                <p className="font-bold">
                  הכנסת ה-{x.cycle.knesset} ({x.cycle.label})
                </p>
                <p>
                  סך הפער: <span className="tabular-nums">{seatsFmt(x.gap)}</span> מנדטים · {x.snapshot.length} מכונים
                </p>
                <p className="tabular-nums">
                  הרשימות שהמליצו על נתניהו: {seatsFmt(x.bloc.estimate)} ⇐ <strong>{x.bloc.actual}</strong> (<Signed n={x.bloc.estimate - x.bloc.actual} />)
                </p>
                <p>
                  טעות בשאלת אחוז החסימה:{" "}
                  {x.misses.length ? x.misses.map((m) => `${m.name} (סקרים ${fmtEst(m.estimate)}, בפועל ${m.actual})`).join(" · ") : "אין"}
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">לכל מערכת: מספר המכונים, סך הפער, הגוש בסקרים ובפועל, וטעויות בשאלת אחוז החסימה</caption>
              <thead>
                <tr className="text-right border-b border-paper-line">
                  <th scope="col" className="py-2 pe-3">מערכת</th>
                  <th scope="col" className="pe-3">מכונים</th>
                  <th scope="col" className="pe-3">סך הפער</th>
                  <th scope="col" className="pe-3">הרשימות שהמליצו על נתניהו: סקרים ⇐ בפועל</th>
                  <th scope="col">טעות בשאלת אחוז החסימה</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((x) => (
                  <tr key={x.cycle.id} className="border-b border-paper-line/60">
                    <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">
                      הכנסת ה-{x.cycle.knesset} ({x.cycle.label})
                    </th>
                    <td className="pe-3 tabular-nums">{x.snapshot.length}</td>
                    <td className="pe-3 tabular-nums">{seatsFmt(x.gap)} מנדטים</td>
                    <td className="pe-3 tabular-nums whitespace-nowrap">
                      {seatsFmt(x.bloc.estimate)} ⇐ <strong>{x.bloc.actual}</strong> (<Signed n={x.bloc.estimate - x.bloc.actual} />)
                    </td>
                    <td>
                      {x.misses.length
                        ? x.misses.map((m) => `${m.name} (סקרים ${fmtEst(m.estimate)}, בפועל ${m.actual})`).join(" · ")
                        : "אין"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Explained>
        <Note>
          הפרש עם מינוס = הסקרים נתנו פחות ממה שהתקבל בפועל. "טעות בשאלת אחוז החסימה" = בחציון הסקרים הרשימה עברה ובפועל לא, או
          להפך — כלומר כל הקולות שלה "נשרפו" בניגוד לתמונה שהציגו הסקרים, או ההפך.
        </Note>
      </Card>

      <Card title="מה חזר על עצמו">
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf="ערב כל מערכת בחירות"
          assumption='לכל רשימה (או קבוצת רשימות) — חציון הסקרים פחות התוצאה בכל מערכת. "המפלגות הערביות" = כל הרשימות שהתמודדו בכל מערכת, ביחד.'
          methodAnchor="accuracy"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">ההפרש בין חציון הסקרים לתוצאה, לפי רשימה ומערכת</caption>
              <thead>
                <tr className="text-right border-b border-paper-line">
                  <th scope="col" className="py-2 pe-3">רשימה</th>
                  {summaries.map((x) => (
                    <th key={x.cycle.id} scope="col" className="pe-3 whitespace-nowrap">
                      {x.cycle.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {families.map((f) => (
                  <tr key={f.id} className="border-b border-paper-line/60">
                    <th scope="row" className="py-2 pe-3 text-right font-medium">
                      {f.name}
                    </th>
                    {f.cells.map((x) => (
                      <td key={x.cycleId} className="pe-3 tabular-nums whitespace-nowrap">
                        <Signed n={x.diff} /> <span className="hidden sm:inline text-ink-faint text-xs">({seatsFmt(x.estimate)} ⇐ {x.actual})</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Explained>
        <ul className="list-disc ps-5 text-sm mt-3 space-y-1">
          {families.map(patternText).filter((t): t is string => !!t).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <Note>
          חמש מערכות הן מדגם קטן, והמכונים משנים שיטות, שותפים ולוחות זמנים בין מערכת למערכת. דפוס שחזר בעבר אינו מבטיח שיחזור הפעם — ולכן
          האתר אינו "מתקן" את הסקרים של היום לפיו.
        </Note>
      </Card>

      <Card title="מערכת אחת מקרוב">
        <label className="text-sm flex flex-col max-w-xs mb-4">
          מערכת בחירות
          <select className="border border-paper-line rounded px-2 py-1 mt-1" value={id} onChange={(e) => setId(e.target.value)}>
            {newestFirst.map((x) => (
              <option key={x.cycle.id} value={x.cycle.id}>
                הכנסת ה-{x.cycle.knesset} ({x.cycle.label})
              </option>
            ))}
          </select>
        </label>

        <h3 className="font-bold mb-2">ערב הבחירות: חציון הסקרים מול התוצאה</h3>
        <Explained kind="סיכום סקרים" source={SOURCE} asOf={eveText} assumption="רשימה מתחת לאחוז החסימה בסקר נספרת כאפס מנדטים." methodAnchor="accuracy">
          <ChartWithTable
            summary={`${s.snapshot.length} מכונים · סך הפער ${seatsFmt(s.gap)} מנדטים. פס = חציון הסקרים, קו דק = הטווח בין המכונים, מעוין = התוצאה בפועל.`}
            chart={<EstimateVsActual rows={s.rows.map((r) => ({ id: r.letters, ...r }))} maxSeats={maxSeats} caption={`חציון הסקרים מול התוצאה, הכנסת ה-${c.knesset}`} />}
            table={
              <table className="text-sm w-full">
                <caption className="sr-only">לכל רשימה: חציון הסקרים, הטווח, התוצאה וההפרש</caption>
                <thead>
                  <tr className="text-right border-b border-paper-line">
                    <th scope="col" className="py-1 pe-3">רשימה</th>
                    <th scope="col" className="pe-3">חציון הסקרים</th>
                    <th scope="col" className="pe-3">טווח</th>
                    <th scope="col" className="pe-3">עברה את הסף אצל</th>
                    <th scope="col" className="pe-3">בפועל</th>
                    <th scope="col">הפרש</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.letters} className="border-b border-paper-line/60">
                      <th scope="row" className="py-1 pe-3 text-right font-medium">{r.name}</th>
                      <td className="pe-3 tabular-nums">{fmtEst(r.estimate)}</td>
                      <td className="pe-3 tabular-nums">{r.n ? `${r.min}–${r.max}` : "—"}</td>
                      <td className="pe-3 tabular-nums">{r.n ? `${r.above} מתוך ${r.n} מכונים` : "—"}</td>
                      <td className="pe-3 tabular-nums font-bold">{r.actual}</td>
                      <td className="tabular-nums"><Signed n={r.diff} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </Explained>

        <h3 className="font-bold mt-6 mb-2">לאורך המערכה</h3>
        <fieldset className="mb-3">
          <legend className="text-sm mb-1">רשימות בגרף</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {lists.map((l) => (
              <label key={l.letters} className="text-sm flex items-center gap-1">
                <input type="checkbox" checked={shown.includes(l.letters)} onChange={() => toggle(l.letters)} />
                {l.short}
              </label>
            ))}
          </div>
        </fieldset>
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf={`מהגשת הרשימות (${date(first)}) ועד הבחירות`}
          assumption="בכל יום: חציון הסקרים מ-7 הימים שקדמו לו, לפחות 3 סקרים. מעוין = התוצאה ביום הבחירות."
          methodAnchor="accuracy"
        >
          <ChartWithTable
            summary={`${all.length} סקרים, ${date(first)}–${date(c.date)}. הנקודות הבהירות הן הסקרים עצמם; המעוינים בקצה — התוצאה בפועל.`}
            chart={<TrendChart series={series} dots={dots} markers={markers} from={toTime(first)} to={toTime(c.date)} yMax={yMax} title={`מגמת הסקרים והתוצאה, הכנסת ה-${c.knesset}`} />}
            table={
              <table className="text-sm w-full">
                <caption className="sr-only">לכל רשימה: חציון הסקרים בתחילת המערכה ובסופה, והתוצאה</caption>
                <thead>
                  <tr className="text-right border-b border-paper-line">
                    <th scope="col" className="py-1 pe-3">רשימה</th>
                    <th scope="col" className="pe-3">תחילת המערכה</th>
                    <th scope="col" className="pe-3">סוף המערכה</th>
                    <th scope="col">בפועל</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((x) => (
                    <tr key={x.id} className="border-b border-paper-line/60">
                      <th scope="row" className="py-1 pe-3 text-right font-medium">{x.name}</th>
                      <td className="pe-3 tabular-nums">{seatsFmt(x.points[0].v)} ({date(new Date(x.points[0].t).toISOString())})</td>
                      <td className="pe-3 tabular-nums">
                        {seatsFmt(x.points[x.points.length - 1].v)} ({date(new Date(x.points[x.points.length - 1].t).toISOString())})
                      </td>
                      <td className="tabular-nums font-bold">{markers.find((m) => m.id === x.id)?.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </Explained>

        <h3 className="font-bold mt-6 mb-2">המכונים ערב הבחירות</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">הסקר האחרון של כל מכון ומזמין, והפער שלו מהתוצאה</caption>
            <thead>
              <tr className="text-right border-b border-paper-line">
                <th scope="col" className="py-2 pe-3">מכון · מזמין</th>
                <th scope="col" className="pe-3">העבודה בשטח</th>
                <th scope="col" className="pe-3">סך הפער</th>
                <th scope="col" className="pe-3">הגוש בסקר (בפועל {s.bloc.actual})</th>
                <th scope="col">פרסום</th>
              </tr>
            </thead>
            <tbody>
              {s.snapshot.map((p) => {
                const g = pollGap(c, s.result, p);
                return (
                  <tr key={p.id} className="border-b border-paper-line/60">
                    <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">
                      {p.firmHe}
                      {p.publisherHe ? ` · ${p.publisherHe}` : ""}
                    </th>
                    <td className="pe-3 whitespace-nowrap">{dateRange(p.start, p.end)}</td>
                    <td className="pe-3 tabular-nums">{seatsFmt(g.gap)}</td>
                    <td className="pe-3 tabular-nums">
                      {seatsFmt(g.bloc)} (<Signed n={g.bloc - s.bloc.actual} />)
                    </td>
                    <td>{p.urls[0] ? <a href={p.urls[0]} rel="noopener noreferrer">מקור</a> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <details className="mt-6">
          <summary className="cursor-pointer font-bold">כל הסקרים מהמערכה ({c.polls.length})</summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <caption className="sr-only">כל הסקרים שפורסמו מהגשת הרשימות ועד הבחירות</caption>
              <thead>
                <tr className="text-right border-b border-paper-line">
                  <th scope="col" className="py-2 pe-3">מכון · מזמין</th>
                  <th scope="col" className="pe-3">העבודה בשטח</th>
                  {lists.map((l) => (
                    <th key={l.letters} scope="col" className="pe-2 font-medium whitespace-nowrap">{l.short}</th>
                  ))}
                  <th scope="col">פרסום</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-paper-line bg-accent-soft">
                  <th scope="row" className="py-2 pe-3 text-right">התוצאה בפועל</th>
                  <td className="pe-3 whitespace-nowrap">{date(c.date)}</td>
                  {lists.map((l) => (
                    <td key={l.letters} className="pe-2 tabular-nums font-bold">
                      {l.seats > 0 ? l.seats : <span className="text-ink-faint font-normal">{((l.votes / s.result.valid) * 100).toFixed(2)}%</span>}
                    </td>
                  ))}
                  <td>—</td>
                </tr>
                {c.polls.map((p) => (
                  <tr key={p.id} className={`border-b border-paper-line/60 ${p.consistent ? "" : "text-ink-faint"}`}>
                    <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">
                      {p.firmHe}
                      {p.publisherHe ? ` · ${p.publisherHe}` : ""}
                      {!p.consistent && <span className="sr-only"> (לא נכלל בניתוח: סכום המנדטים {p.seatSum})</span>}
                    </th>
                    <td className="pe-3 whitespace-nowrap">{dateRange(p.start, p.end)}</td>
                    {lists.map((l) => {
                      const v = p.values[l.letters];
                      return (
                        <td key={l.letters} className="pe-2 tabular-nums">
                          {v?.s ?? (v?.p !== undefined ? <span className="text-ink-faint">{v.p}%</span> : "—")}
                        </td>
                      );
                    })}
                    <td>{p.urls[0] ? <a href={p.urls[0]} rel="noopener noreferrer">מקור</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            אחוז בתא = הרשימה מתחת לאחוז החסימה באותו סקר. "—" = לא נשאלה. שורה באפור = סכום המנדטים בה רחוק מ-120 (טעות העתקה או
            פרסום חלקי), ולכן אינה נכללת בחישובים. מקור הטבלה: "{c.source.page}" בוויקיפדיה האנגלית.
          </Note>
        </details>
      </Card>

      <PersonalBlocs title="הגושים שלי: סקרים ערב הבחירות מול תוצאות האמת" source="הגושים: חציוני מפלגות בסקרים מול תוצאות אמת" asOf={eveText} compare datasets={[
        { historical: true, mapping: id === "k25" ? undefined : {}, values: Object.fromEntries(s.rows.map(r => [r.letters, r.estimate])), source: `סכום חציוני מפלגות לפני ${c.label}; אינו חציון הגוש`, asOf: eveText },
        { historical: true, mapping: id === "k25" ? undefined : {}, values: Object.fromEntries(s.result.lists.map(l => [l.letters, l.seats])), source: `תוצאות אמת ${c.label}`, asOf: "תוצאות סופיות" },
      ]} />
      <Card title="מכוני הסקרים לאורך זמן">
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf="ערב כל מערכת בחירות"
          assumption="לכל מכון — הסקרים שלו מהיום האחרון שבו פרסם לפני הבחירות; אם פרסם באותו יום לכמה גופים, נלקח הממוצע. מוצגים מכונים שפעלו בשתי מערכות לפחות."
          methodAnchor="accuracy"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">סך הפער של הסקר האחרון של כל מכון, לפי מערכת</caption>
              <thead>
                <tr className="text-right border-b border-paper-line">
                  <th scope="col" className="py-2 pe-3">מכון</th>
                  {summaries.map((x) => (
                    <th key={x.cycle.id} scope="col" className="pe-3 whitespace-nowrap">{x.cycle.label}</th>
                  ))}
                  <th scope="col">ממוצע</th>
                </tr>
              </thead>
              <tbody>
                {pollsters.map((p) => (
                  <tr key={p.firmKey} className="border-b border-paper-line/60">
                    <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">{p.firmHe}</th>
                    {summaries.map((x) => {
                      const e = p.entries.find((en) => en.cycleId === x.cycle.id);
                      return (
                        <td key={x.cycle.id} className="pe-3 tabular-nums" title={e ? e.publishers.join(", ") : undefined}>
                          {e ? seatsFmt(Math.round(e.gap * 10) / 10) : "—"}
                        </td>
                      );
                    })}
                    <td className="tabular-nums font-bold">{seatsFmt(Math.round(p.meanGap * 10) / 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Explained>
        <Note>
          המספר = סך הפער של המכון באותה מערכת (במנדטים). ההבדלים בין המערכות גדולים מההבדלים בין המכונים באותה מערכת — סך הפער של
          המכונים היה {spread.map((x) => `ב${x.label} — בין ${r1(x.min)} ל-${r1(x.max)}`).join("; ")}. לכן "המכון המדויק ביותר" אינו מסקנה
          בטוחה מחמש מערכות.
        </Note>
      </Card>
    </>
  );
}

import PersonalBlocs from "../components/PersonalBlocs";
import { Link } from "react-router-dom";
import { ScenarioRanges, TrendChart, type Series } from "../components/charts";
import Explained from "../components/Explained";
import { Card, ChartWithTable, Note, PageTitle, Split } from "../components/ui";

import modelFile from "../data/model.json";
import backtestFile from "../data/backtest.json";
import { listName, meta, results } from "../lib/data";
import { date, dateLong, num, seatsFmt } from "../lib/format";

interface ListScenario {
  seats: number[];
  seatsMean: number;
  share: number[];
  pass: number;
  agreementGain?: number;
}
interface ModelData {
  start: string;
  asof: string;
  electionDay: string;
  polls: number;
  pollsters: number;
  skipped: string[];
  others: number;
  central: { date: string; seats: Record<string, number>; shares: Record<string, number> };
  trend: { date: string; seats: Record<string, number>; shares: Record<string, number> }[];
  scenarios: {
    n: number;
    horizonDays: number;
    lists: Record<string, ListScenario>;
    bloc: { lists: string[]; seats: number[]; atLeast61: number };
    wasted: number[];
    agreementsMoveSeat: number;
  };
  house: { pollster: string; firmHe: string; publisherHe: string | null; polls: number; seats: Record<string, number> }[];
  params: Record<string, number>;
}
interface BacktestRow {
  cycle: string;
  label: string;
  horizon: number;
  coverage80: number;
  mae: number;
  baselineMae: Record<string, number>;
  bloc: { model: number[]; actual: number };
}
interface BacktestData {
  rows: BacktestRow[];
  summary: Record<string, { mae: number; coverage80: number; brier: number; baselineMae: Record<string, number>; blocCovered: number }>;
  horizons: number[];
}

const m = modelFile as unknown as ModelData;
const bt = backtestFile as unknown as BacktestData;
const sc = m.scenarios;
const ids = Object.keys(sc.lists).sort((a, b) => m.central.seats[b] - m.central.seats[a] || sc.lists[b].share[1] - sc.lists[a].share[1]);
const pctTxt = (x: number) => (x >= 0.995 ? "כמעט בכל התרחישים" : x < 0.005 ? "כמעט באף תרחיש" : `ב-${Math.round(x * 100)}% מהתרחישים`);
const r1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("he-IL");
const edge = ids.filter((id) => sc.lists[id].pass > 0.005 && sc.lists[id].pass < 0.995);
const k25 = results[results.length - 1];
const wasted2022 = ((k25.valid - k25.lists.filter((l) => l.seats > 0).reduce((a, l) => a + l.votes, 0)) / k25.valid) * 100;
const SOURCE = `${m.polls} סקרים מאומתים של ${m.pollsters} מכונים, מאז הגשת הרשימות (${date(m.start)}); מנוע החוק עם הסכמי העודפים שדווחו`;

function coverageRange() {
  const byCycle = new Map<string, number[]>();
  for (const r of bt.rows) byCycle.set(r.label, [...(byCycle.get(r.label) ?? []), r.coverage80]);
  return [...byCycle.entries()].map(([label, xs]) => ({ label, avg: xs.reduce((a, b) => a + b, 0) / xs.length }));
}

export default function Scenarios() {
  const asOfText = `הסקרים עד ${dateLong(m.asof)} · ${num(sc.n)} תרחישים ליום הבחירות (${sc.horizonDays} ימים קדימה)`;
  const trendIds = ids.filter((id) => m.central.seats[id] > 0).slice(0, 9);
  // באחוזים ולא במנדטים: שינוי של עשיריות האחוז אינו מזיז מנדט שלם, והקו היה נראה שטוח
  const series: Series[] = trendIds.map((id) => ({
    id,
    name: listName(id),
    points: m.trend.map((p) => ({ t: Date.parse(p.date + "T12:00:00Z"), v: p.shares[id] })),
    endLabel: `${listName(id)} ${r1(m.trend[m.trend.length - 1].shares[id])}%`,
  }));
  const t0 = Date.parse(m.trend[0].date + "T12:00:00Z");
  const t1 = Date.parse(m.trend[m.trend.length - 1].date + "T12:00:00Z");
  const cov = coverageRange();
  const govNames = sc.bloc.lists.map(listName).join(", ");
  const houseIds = ids.filter((id) => m.central.seats[id] > 0);

  return (
    <>
      <PageTitle
        lead={`התחזית ליום הבחירות: ממוצע הסקרים, ו-${num(sc.n)} תרחישים סביבו. לכל רשימה הטווח שבו נמצאים 80% מהתרחישים, ובכמה מהתרחישים היא עוברת את אחוז החסימה. לא "סיכוי".`}
      >
        תחזית ותרחישים
      </PageTitle>
      <Split primary={<PersonalBlocs title="הגושים שלי: שינוי לאורך זמן והבדלים בין מכונים" source="תחילת וסוף המגמה והשוואת המכונים" asOf={dateLong(m.asof)} datasets={[{ values: m.trend[0].seats, source: "תחילת המגמה", asOf: dateLong(m.trend[0].date) }, { values: m.trend[m.trend.length - 1].seats, source: "סוף המגמה", asOf: dateLong(m.trend[m.trend.length - 1].date) }, ...m.house.map(h => ({ values: h.seats, source: `הממוצע מעוגן במכון ${h.firmHe}`, asOf: dateLong(m.asof) }))]} />} secondary={<>

      <Card title="לכל רשימה">
        <Explained
          kind="תרחיש"
          source={SOURCE}
          asOf={asOfText}
          assumption="שלוש שכבות אי-ודאות: כמה הממוצע של היום בטוח · כמה הוא עוד יזוז עד יום הבחירות · וטעות הסקרים המשותפת כפי שנמדדה בחמש המערכות הקודמות. כל תרחיש עובר במנוע החוק — אחוז החסימה, הסכמי העודפים ובאדר-עופר."
          methodAnchor="model"
        >
          <ChartWithTable
            summary={`קו = המנדטים לפי הממוצע · רצועה = 80% מהתרחישים. ${edge.length ? `על סף אחוז החסימה: ${edge.map((id) => listName(id)).join(", ")}.` : ""}`}
            chart={
              <ScenarioRanges
                caption="מנדטים לפי הממוצע וטווח 80% של התרחישים לכל רשימה"
                rows={ids.map((id) => ({ id, name: listName(id), central: m.central.seats[id], lo: sc.lists[id].seats[0], hi: sc.lists[id].seats[2], pass: sc.lists[id].pass }))}
              />
            }
            table={
              <table className="text-sm w-full">
                <caption className="sr-only">לכל רשימה: מנדטים לפי הממוצע, טווח 80% של התרחישים, אחוז הקולות ושיעור התרחישים שבהם היא עוברת</caption>
                <thead>
                  <tr className="text-right border-b border-paper-line">
                    <th scope="col" className="py-1 pe-3">רשימה</th>
                    <th scope="col" className="pe-3">לפי הממוצע</th>
                    <th scope="col" className="pe-3">80% מהתרחישים</th>
                    <th scope="col" className="pe-3">אחוז הקולות (80%)</th>
                    <th scope="col">עוברת את הסף</th>
                  </tr>
                </thead>
                <tbody>
                  {ids.map((id) => {
                    const l = sc.lists[id];
                    return (
                      <tr key={id} className="border-b border-paper-line/60">
                        <th scope="row" className="py-1 pe-3 text-right font-medium">{listName(id)}</th>
                        <td className="pe-3 tabular-nums font-bold">{m.central.seats[id]}</td>
                        <td className="pe-3 tabular-nums">{l.seats[0]}–{l.seats[2]}</td>
                        <td className="pe-3 tabular-nums">{r1(l.share[0])}%–{r1(l.share[2])}%</td>
                        <td>{pctTxt(l.pass)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            }
          />
        </Explained>
        <Note>
          "לפי הממוצע" = המנדטים שהחוק נותן לאחוזים של הממוצע עצמו. הטווח רחב בכוונה: הוא כולל גם את הטעות שהסקרים עשו יחד בבחירות קודמות.
          ב-2019א, למשל, כל המכונים נתנו לליכוד 7 מנדטים פחות ממה שקיבל.
        </Note>
      </Card>


      <div className="grid md:grid-cols-2 gap-5 [&>*]:min-w-0">
        <Card title="על סף אחוז החסימה">
          <Explained kind="תרחיש" source={SOURCE} asOf={asOfText} assumption="רשימה שלא עוברת את הסף מקבלת אפס מנדטים, וקולותיה אינם נספרים בחלוקה." methodAnchor="model">
            {edge.length ? (
              <ul className="text-sm space-y-1">
                {edge.map((id) => (
                  <li key={id}>
                    <strong>{listName(id)}</strong> עוברת {pctTxt(sc.lists[id].pass)} · אחוז הקולות:{" "}
                    <span className="whitespace-nowrap">
                      {r1(sc.lists[id].share[0])}%–{r1(sc.lists[id].share[2])}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">אין כרגע רשימה שעוברת בחלק מהתרחישים בלבד.</p>
            )}
            <p className="text-sm mt-3">
              קולות כשרים לרשימות שלא עוברות את הסף: חציון {r1(sc.wasted[1])}%, וב-80% מהתרחישים בין {r1(sc.wasted[0])}% ל-{r1(sc.wasted[2])}%.
              ב-2022 זה היה {r1(wasted2022)}%.
            </p>
          </Explained>
        </Card>

        <Card title="מפלגות הממשלה היוצאת">
          <Explained
            kind="תרחיש"
            source={SOURCE}
            asOf={asOfText}
            assumption={`הקבוצה = ${govNames} — לפי הרכב הממשלה ה-37, לא לפי הצהרות על קואליציה עתידית.`}
            methodAnchor="model"
          >
            <p className="text-4xl font-extrabold tabular-nums">
              {sc.bloc.seats[1]}
              <span className="text-lg font-medium text-ink-soft"> מנדטים בחציון התרחישים</span>
            </p>
            <p className="text-ink-soft text-sm">
              ב-80% מהתרחישים: {sc.bloc.seats[0]}–{sc.bloc.seats[2]} · 61 ומעלה: {pctTxt(sc.bloc.atLeast61)}
            </p>
          </Explained>
          <Note>
            קבוצה אחרת אפשר להגדיר <Link to="/guess?section=blocs">בעריכת הגושים</Link>.
          </Note>
        </Card>
      </div>

      <Card title="הסכמי העודפים בתרחישים">
        <Explained
          kind="תרחיש"
          source={`${SOURCE}; ההסכמים: ${meta.agreements2026.map((a) => `${listName(a.pair[0])}–${listName(a.pair[1])}`).join(" · ")}`}
          asOf={asOfText}
          assumption="אותם קולות בדיוק, עם ההסכמים שדווחו ובלעדיהם. ההסכמים הרשמיים יפורסמו ב-19.10.2026."
          methodAnchor="agreements"
        >
          <p className="text-sm">
            {pctTxt(sc.agreementsMoveSeat)} ההסכמים מזיזים לפחות מנדט אחד. בממוצע על פני כל התרחישים:
          </p>
          <ul className="text-sm mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {ids
              .filter((id) => Math.abs(sc.lists[id].agreementGain ?? 0) >= 0.03)
              .sort((a, b) => (sc.lists[b].agreementGain ?? 0) - (sc.lists[a].agreementGain ?? 0))
              .map((id) => (
                <li key={id} className="flex justify-between gap-3">
                  <span>{listName(id)}</span>
                  <span className="tabular-nums">
                    <bdi dir="ltr">{(sc.lists[id].agreementGain ?? 0) > 0 ? "+" : "−"}{Math.abs(sc.lists[id].agreementGain ?? 0).toFixed(2)}</bdi> מנדט
                  </span>
                </li>
              ))}
          </ul>
        </Explained>
        <Note>מספר כמו "+0.10 מנדט" פירושו: ההסכם נותן לרשימה מנדט נוסף בכעשירית מהתרחישים.</Note>
      </Card>

      <Card title="הממוצע של המודל לאורך זמן — אחוז מהקולות הכשרים">
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf={`הסקרים עד ${dateLong(m.asof)}`}
          assumption="בכל יום: הממוצע המוחלק אחרי תיקון אפקט הבית של כל מכון. באחוזים — כי שינוי של עשיריות האחוז אינו מזיז מנדט שלם."
          methodAnchor="model"
        >
          <ChartWithTable
            summary={`${trendIds.length} הרשימות הגדולות, ${date(m.trend[0].date)}–${date(m.trend[m.trend.length - 1].date)}.`}
            chart={<TrendChart series={series} from={t0} to={t1} yMax={Math.ceil((Math.max(...series.flatMap((s) => s.points.map((p) => p.v))) + 2) / 5) * 5} title="הממוצע של המודל באחוזים לאורך זמן" />}
            table={
              <table className="text-sm w-full">
                <caption className="sr-only">האחוז והמנדטים לפי הממוצע בתחילת החלון ובסופו</caption>
                <thead>
                  <tr className="text-right border-b border-paper-line">
                    <th scope="col" className="py-1 pe-3">רשימה</th>
                    <th scope="col" className="pe-3">{date(m.trend[0].date)}</th>
                    <th scope="col">{date(m.trend[m.trend.length - 1].date)}</th>
                  </tr>
                </thead>
                <tbody>
                  {trendIds.map((id) => (
                    <tr key={id} className="border-b border-paper-line/60">
                      <th scope="row" className="py-1 pe-3 text-right font-medium">{listName(id)}</th>
                      <td className="pe-3 tabular-nums">{r1(m.trend[0].shares[id])}% ({m.trend[0].seats[id]} מנדטים)</td>
                      <td className="tabular-nums">
                        {r1(m.trend[m.trend.length - 1].shares[id])}% ({m.trend[m.trend.length - 1].seats[id]} מנדטים)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </Explained>
      </Card>


      <Card title="המכונים: אילו הממוצע היה מעוגן במכון אחד">
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf={`הסקרים עד ${dateLong(m.asof)}`}
          assumption="לכל מכון נאמד 'אפקט בית' — כמה הוא שונה בעקביות מהשאר. הממוצע מניח שסכום האפקטים הוא אפס, כלומר שהמכונים יחד אינם מוטים. זו הנחה, לא עובדה."
          methodAnchor="model"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">המנדטים לכל רשימה אילו הממוצע היה מעוגן בכל מכון בנפרד</caption>
              <thead>
                <tr className="text-right border-b border-paper-line">
                  <th scope="col" className="py-2 pe-3">מכון · מזמין</th>
                  <th scope="col" className="pe-3">סקרים</th>
                  {houseIds.map((id) => (
                    <th key={id} scope="col" className="pe-2 font-medium whitespace-nowrap">{listName(id)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-paper-line bg-accent-soft">
                  <th scope="row" className="py-2 pe-3 text-right">הממוצע (כל המכונים)</th>
                  <td className="pe-3 tabular-nums">{m.polls}</td>
                  {houseIds.map((id) => (
                    <td key={id} className="pe-2 tabular-nums font-bold">{m.central.seats[id]}</td>
                  ))}
                </tr>
                {[...m.house].sort((a, b) => b.seats.likud - a.seats.likud).map((h) => (
                  <tr key={h.pollster} className="border-b border-paper-line/60">
                    <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">
                      {h.firmHe}
                      {h.publisherHe ? ` · ${h.publisherHe}` : ""}
                    </th>
                    <td className="pe-3 tabular-nums">{h.polls}</td>
                    {houseIds.map((id) => {
                      const d = h.seats[id] - m.central.seats[id];
                      return (
                        <td key={id} className={`pe-2 tabular-nums ${Math.abs(d) >= 3 ? "font-bold text-warn" : ""}`}>
                          {h.seats[id]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Explained>
        <Note>מודגש = הפרש של 3 מנדטים ומעלה מהממוצע. מכון עם סקר אחד בלבד נאמד בזהירות (האפקט שלו מכווץ לכיוון אפס).</Note>
      </Card>

      <Card title="בדיקת עבר: איך המודל היה מתפקד בחמש המערכות הקודמות">
        <Explained
          kind="תרחיש"
          source="אותו מודל בדיוק, על סקרי 2019–2022 — בכל נקודה רק עם הסקרים שפורסמו עד אז; טעות הסקרים ההיסטורית נאמדה לכל מערכת מארבע האחרות בלבד"
          asOf="21, 14, 7 ויום אחד לפני כל מערכת"
          assumption='"פער ממוצע" = כמה מנדטים בממוצע לרשימה בין הממוצע לתוצאה. "כיסוי" = בכמה מהרשימות התוצאה נפלה בטווח 80% של התרחישים.'
          methodAnchor="model"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">פער ממוצע וכיסוי של המודל מול שלוש שיטות פשוטות, לפי מרחק מהבחירות</caption>
              <thead>
                <tr className="text-right border-b border-paper-line">
                  <th scope="col" className="py-2 pe-3">ימים לפני הבחירות</th>
                  <th scope="col" className="pe-3">המודל</th>
                  <th scope="col" className="pe-3">חציון המכונים (14 יום)</th>
                  <th scope="col" className="pe-3">ממוצע 7 ימים</th>
                  <th scope="col" className="pe-3">הסקר האחרון</th>
                  <th scope="col">כיסוי טווח 80%</th>
                </tr>
              </thead>
              <tbody>
                {bt.horizons.map((h) => {
                  const s = bt.summary[String(h)];
                  return (
                    <tr key={h} className="border-b border-paper-line/60">
                      <th scope="row" className="py-2 pe-3 text-right font-medium">{h}</th>
                      <td className="pe-3 tabular-nums">{seatsFmt(Math.round(s.mae * 100) / 100)}</td>
                      <td className="pe-3 tabular-nums">{seatsFmt(Math.round(s.baselineMae.median14 * 100) / 100)}</td>
                      <td className="pe-3 tabular-nums">{seatsFmt(Math.round(s.baselineMae.avg7 * 100) / 100)}</td>
                      <td className="pe-3 tabular-nums">{seatsFmt(Math.round(s.baselineMae.lastPoll * 100) / 100)}</td>
                      <td className="tabular-nums">{Math.round(s.coverage80 * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Explained>
        <ul className="list-disc ps-5 text-sm mt-3 space-y-1">
          <li>
            הממוצע של המודל <strong>לא היה מדויק יותר</strong> מהשיטות הפשוטות — הפער הממוצע דומה. היתרון שלו הוא אחר: הוא מתרגם את הסקרים
            לתרחישים דרך החוק עצמו, כולל אחוז החסימה והסכמי העודפים.
          </li>
          <li>
            הטווחים הכילו את התוצאה בכ-{Math.round((bt.horizons.reduce((a, h) => a + bt.summary[String(h)].coverage80, 0) / bt.horizons.length) * 100)}%
            מהמקרים — מעט יותר מ-80%, כלומר רחבים מעט ממה שצריך. אבל זה ממוצע של מערכות שונות מאוד:{" "}
            {cov.map((c) => `${c.label} ${Math.round(c.avg * 100)}%`).join(" · ")}.
          </li>
          <li>חמש מערכות אינן מספיקות כדי להוכיח שהמספרים "מכוילים". לכן האתר מדבר על "שיעור התרחישים", ולא על סיכוי.</li>
        </ul>
      </Card>
      </>} />
    </>
  );
}

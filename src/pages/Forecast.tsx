import { Link } from "react-router-dom";
import Explained from "../components/Explained";
import ListsView, { type ListRow } from "../components/ListsView";
import forecastFile from "../data/forecast.json";
import { listName } from "../lib/data";
import { dateLong, num } from "../lib/format";
import { useTheme } from "../lib/theme";
import { Badge, Card, Note, PageTitle } from "../components/ui";

interface GateRow {
  passed: boolean;
  valid: boolean;
  logged: boolean;
  invalidElections: number[];
  summary: Record<string, { voteAccuracy: number; seatAccuracy: number }>;
  perElection: Record<string, [number, number]>;
}
interface ForecastFile {
  asof: string;
  daysToElection: number;
  horizon: number;
  specVersion: number;
  variant: string;
  series: string[];
  seriesLabels: Record<string, string>;
  enough: boolean;
  params: { others: number; beta: number; betaElections: number; trainedOn: number[]; weights: Record<string, number> };
  lists: Record<string, { share: number; seats: number; seatsRange: number[]; shareRange: number[]; pass: number }>;
  bloc: { seats: number[]; atLeast61: number | null; central: number };
  wasted: number[];
  gate: { elections: number[]; minVote: number; minSeat: number; atHorizon: GateRow; passedAtHorizon: boolean | null };
  attempts: { versions: number[]; runs: number; bestVoteAccuracy: number };
}
const fc = forecastFile as unknown as ForecastFile;

const ELECTION: Record<string, string> = {
  "19": "2013", "20": "2015", "21": "אפריל 2019", "22": "ספטמבר 2019", "23": "מרץ 2020", "24": "מרץ 2021", "25": "נובמבר 2022",
};
const p1 = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString("he-IL")}%`;
const LOG_URL = "https://github.com/hopetohelp/26/blob/main/pipeline/forecast_runs.jsonl";

const rows: ListRow[] = Object.entries(fc.lists)
  .map(([id, v]) => ({ id, name: listName(id), central: v.seats, lo: v.seatsRange[0], hi: v.seatsRange[2], pass: v.pass }))
  .sort((a, b) => b.central - a.central || fc.lists[b.id].share - fc.lists[a.id].share);

export default function Forecast() {
  const [theme] = useTheme();
  const gate = fc.gate.atHorizon;
  const main = gate?.summary[fc.variant];
  const base = gate?.summary.V0;
  const passed = fc.gate.passedAtHorizon === true;
  const votesOk = main ? main.voteAccuracy >= fc.gate.minVote : false;
  const seatsOk = main ? main.seatAccuracy >= fc.gate.minSeat : false;

  return (
    <>
      <PageTitle
        lead={`מה יהיו התוצאות ביום הבחירות, לפי מודל שמשקלל את כל המכונים לפי הדיוק שלהם בבחירות הקודמות ומתקן את הטעויות שחזרו בהן. נכון ל-${dateLong(fc.asof)}, ${fc.daysToElection} ימים לפני הבחירות.`}
      >
        תחזית התוצאות
      </PageTitle>

      <Card title="לפני שמסתכלים: עד כמה המודל צדק בעבר" className={passed ? "" : "border-warn"}>
        {gate && main && base ? (
          <>
            <p className="text-base leading-relaxed mb-3">
              הרצנו את אותו מודל בדיוק על חמש מערכות הבחירות 2019–2022, בכל פעם רק עם מה שהיה ידוע עד אז, ובדיוק {fc.horizon} ימים לפני
              הבחירות{fc.horizon === fc.daysToElection ? " — אותו מרחק כמו היום" : ""}. קבענו מראש רף: לפחות {p1(fc.gate.minVote)} דיוק בקולות
              ולפחות {p1(fc.gate.minSeat)} במנדטים, בממוצע. ככל שהבחירות מתקרבות הסקרים מדויקים יותר, ולכן הבדיקה מתעדכנת כל יום למרחק של אותו יום.
            </p>
            <ul className="space-y-2 text-base mb-3">
              <li className="flex flex-wrap items-center gap-2">
                <span>
                  דיוק בקולות: <strong className="tabular">{p1(main.voteAccuracy)}</strong> (הרף: {p1(fc.gate.minVote)})
                </span>
                <Badge tone={votesOk ? "ok" : "warn"}>{votesOk ? "עובר" : "לא עובר"}</Badge>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span>
                  דיוק במנדטים: <strong className="tabular">{p1(main.seatAccuracy)}</strong> (הרף: {p1(fc.gate.minSeat)})
                </span>
                <Badge tone={seatsOk ? "ok" : "warn"}>{seatsOk ? "עובר" : "לא עובר"}</Badge>
              </li>
            </ul>
            {!passed && (
              <p className="text-base font-bold text-warn mb-3">
                המודל לא עבר את הרף שנקבע מראש. התחזית מוצגת בכל זאת, עם הנתונים האלה, כדי שתוכלו לשפוט בעצמכם.
              </p>
            )}
            <p className="text-sm text-ink-soft">
              להשוואה: חציון פשוט של הסקרים האחרונים הגיע ל-{p1(base.voteAccuracy)} בקולות ו-{p1(base.seatAccuracy)} במנדטים. דיוק בקולות =
              100% פחות מחצית סכום הפערים בין האחוז החזוי לאחוז בפועל; דיוק במנדטים = 100% פחות סכום פערי המנדטים חלקי 240.
            </p>
          </>
        ) : gate && !gate.valid ? (
          <p className="text-base font-bold text-warn">
            במרחק של {fc.horizon} ימים מהבחירות אי אפשר לבדוק את המודל כראוי: בבחירות{" "}
            {gate.invalidElections.map((k) => ELECTION[String(k)] ?? k).join(", ")} פורסמו באותו שבוע סקרים של פחות משלושה מכונים (הכלל שנקבע
            מראש). לכן אין היום נתון דיוק להצגה — אין להסתמך על התחזית.
          </p>
        ) : (
          <p className="text-base font-bold text-warn">הבדיקה על הבחירות הקודמות טרם הורצה באופק הזה — אין להסתמך על התחזית.</p>
        )}
      </Card>

      {fc.enough ? (
        <section aria-label="התחזית לכל רשימה" className="mb-6">
          <Explained
            kind="תחזית"
            source={`הסקר האחרון של כל אחת מ-${fc.series.length} סדרות סקרים בשבוע האחרון, משוקללים לפי הדיוק בעבר ומתוקנים לפי הטעויות שחזרו; מנוע החוק (אחוז חסימה, הסכמי עודפים שדווחו, באדר-עופר); ${num(10000)} תרחישים`}
            asOf={dateLong(fc.asof)}
            assumption="המכונים יטעו השנה בערך כמו שטעו בממוצע בעבר. הטווח — 80% מהתרחישים, לפי הטעויות של המודל עצמו בבדיקת העבר, מוגדלות ברבע."
            methodAnchor="forecast"
          >
            <ListsView rows={rows} theme={theme} basis="התחזית" />
          </Explained>
        </section>
      ) : (
        <Card>
          <p className="text-base">אין מספיק סקרים בשבוע האחרון (פחות משלוש סדרות) — התחזית אינה מחושבת היום.</p>
        </Card>
      )}

      {fc.enough && fc.bloc.seats.length > 0 && (
        <Card title="מה עוד התחזית אומרת">
          <ul className="space-y-2 text-base leading-relaxed">
            <li>
              מפלגות הממשלה היוצאת: {fc.bloc.central} מנדטים לפי התחזית, ובין {fc.bloc.seats[0]} ל-{fc.bloc.seats[2]} ב-80% מהתרחישים
              {fc.bloc.atLeast61 !== null && ` (61 ומעלה ב-${Math.round(fc.bloc.atLeast61 * 100)}% מהתרחישים)`}.
            </li>
            <li>
              כ-{fc.wasted[1].toLocaleString("he-IL")}% מהקולות הכשרים לא יהפכו למנדטים בחציון התרחישים (רשימות מתחת לסף ורשימות קטנות שהסקרים
              אינם מציגים).
            </li>
          </ul>
        </Card>
      )}

      {gate && (
        <Card title="הבדיקה על הבחירות הקודמות, מערכת אחר מערכת">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <caption className="sr-only">דיוק המודל בכל מערכת בחירות, {fc.horizon} ימים לפני הבחירות</caption>
              <thead>
                <tr className="text-ink-soft text-right">
                  <th scope="col" className="py-1.5 font-normal">בחירות</th>
                  <th scope="col" className="py-1.5 font-normal">קולות</th>
                  <th scope="col" className="py-1.5 font-normal">מנדטים</th>
                  <th scope="col" className="py-1.5 font-normal">חלק מהרף?</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(gate.perElection).map(([k, [v, s]]) => (
                  <tr key={k} className="border-t border-paper-line">
                    <th scope="row" className="py-1.5 font-medium text-right">{ELECTION[k] ?? k}</th>
                    <td className="py-1.5">{p1(v)}</td>
                    <td className="py-1.5">{p1(s)}</td>
                    <td className="py-1.5">{fc.gate.elections.includes(Number(k)) ? "כן" : "אימון בלבד"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>
            2013 ו-2015 משמשות ללמידה בלבד ואינן בחישוב הרף. מספר הגרסאות שנוסו עד היום: {fc.attempts.versions.length} ({fc.attempts.runs} הרצות). כל
            הרצה נרשמת ביומן שאינו נמחק: <a href={LOG_URL}>יומן ההרצות</a>. כל שינוי במודל נבדק מחדש על כל המערכות, לפי אותם כללים.
          </Note>
        </Card>
      )}

      <Card title="מה המודל למד מהעבר">
        <ul className="space-y-2 text-base leading-relaxed">
          <li>
            משקל לכל מכון לפי הדיוק שלו בבחירות הקודמות, כולל מגמת השתפרות או התדרדרות שנמדדה בפועל. מכון בלי עבר מקבל משקל ממוצע.
          </li>
          <li>תיקון לפי גושים ולפי מפלגות שהמכונים העריכו ביתר או בחסר באופן עקבי, ותיקון לרשימות סביב אחוז החסימה.</li>
          <li>כ-{fc.params.others.toLocaleString("he-IL")}% מהקולות הולכים בדרך כלל לרשימות קטנות שהסקרים לא מציגים.</li>
          <li>
            {fc.params.betaElections === 0
              ? "תנועה בסקרים בשבוע שלפני השבוע האחרון: אין עדיין מספיק נתונים מהעבר כדי לדעת אם היא נמשכת — לכן אינה משפיעה."
              : `תנועה בסקרים בשבוע שלפני השבוע האחרון: בעבר נמשכה בכ-${Math.round(fc.params.beta * 100)}% מגודלה עד יום הבחירות (לפי ${fc.params.betaElections} מערכות), וכך היא מוכנסת לתחזית.`}
          </li>
        </ul>
        {fc.series.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tabular">
              <caption className="text-right text-ink-soft mb-1">המשקל של כל מכון בתחזית של היום</caption>
              <thead>
                <tr className="text-ink-soft text-right">
                  <th scope="col" className="py-1.5 font-normal">מכון</th>
                  <th scope="col" className="py-1.5 font-normal">משקל</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(fc.params.weights)
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, w]) => (
                    <tr key={s} className="border-t border-paper-line">
                      <th scope="row" className="py-1.5 font-medium text-right">{fc.seriesLabels?.[s] ?? s}</th>
                      <td className="py-1.5">{p1(w)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3">
          <Link to="/method#forecast" className="font-bold">
            השיטה המלאה של התחזית
          </Link>
          {" · "}
          <Link to="/accuracy" className="font-bold">
            דיוק הסקרים בעבר
          </Link>
        </p>
      </Card>
    </>
  );
}

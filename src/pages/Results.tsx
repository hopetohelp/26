import LocalityResults from "../components/LocalityResults";
import PersonalBlocs from "../components/PersonalBlocs";
import Explained from "../components/Explained";
import { Badge, Card, Fold, Note, Split } from "../components/ui";
import { allocate, type Agreement } from "../engine/baderOfer";
import { results } from "../lib/data";
import { K26_RESULT } from "../lib/election2026";
import { seatChanges } from "../engine/seatChange";
import { partialLine } from "../lib/voterFlow";
import { ShiftLine } from "./Results2026";
import Missing from "../components/Missing";
import { Link } from "react-router-dom";
import { k25Families } from "../lib/lineage";
import { num, pct } from "../lib/format";

type Election = Omit<(typeof results)[number], "lists"> & { lists: ((typeof results)[number]["lists"][number] & { ballot?: string })[] };
/** כל המערכות, כולל 2026 — באותו מבנה (הכרעת בעלים 02.11.2026: מסך "תוצאות" זהה לכל מערכת) */
const ELECTIONS: Election[] = [...results, K26_RESULT as unknown as Election];

function analysis(e: Election) {
  const votes = Object.fromEntries(e.lists.map((l) => [l.letters, l.votes]));
  const ag = e.agreements.map(([a, b]) => [a, b] as Agreement);
  const withAll = allocate(votes, e.valid, ag);
  const none = allocate(votes, e.valid, []);
  const diff = (a: Record<string, number>, b: Record<string, number>) =>
    Object.keys(votes).map((k) => [k, (a[k] ?? 0) - (b[k] ?? 0)] as const).filter(([, d]) => d !== 0);
  const single = ag.map((pair) => {
    const rest = ag.filter((x) => x !== pair);
    return { pair, diff: diff(withAll.seats, allocate(votes, e.valid, rest).seats) };
  });
  return { votes, withAll, allVsNone: diff(withAll.seats, none.seats), single };
}

const shortOf = (e: Election, letters: string) => e.lists.find((l) => l.letters === letters)?.short ?? letters;
const fmtDiffOf = (e: Election, d: readonly (readonly [string, number])[]) =>
  d.length ? d.map(([k, v]) => `${shortOf(e, k)} \u2066${v > 0 ? "+" : ""}${v}\u2069`).join(" · ") : "לא שינו דבר";

/** חישובי כל המערכות — לטבלת ההשוואה */
const ALL = ELECTIONS.map((e) => ({ e, a: analysis(e) }));

/** "בקצרה": אותו הסבר לכל מערכת, נגזר מהנתונים הרשמיים */
function Story({ e, a }: { e: Election; a: ReturnType<typeof analysis> }) {
  const passing = e.lists.filter((l) => l.seats > 0);
  const failed = [...e.lists.filter((l) => l.seats === 0)].sort((x, y) => y.votes - x.votes);
  const top = Math.max(...passing.map((l) => l.seats));
  const biggest = passing.filter((l) => l.seats === top);
  const thr = a.withAll.thresholdVotes;
  const nearMiss = failed[0];
  const lowestIn = [...passing].sort((x, y) => x.votes - y.votes)[0];
  const notable = failed.filter((l) => l.votes >= e.valid * 0.01);
  const active = e.agreements.length - a.withAll.inactiveAgreements.length;
  return (
    <ul className="space-y-2 text-base leading-relaxed">
      <li>
        הצביעו {pct((e.voted / e.eligible) * 100)} מבעלי זכות הבחירה ({num(e.voted)} מתוך {num(e.eligible)}). {passing.length} רשימות עברו את
        אחוז החסימה, שעמד על {num(thr)} קולות.
      </li>
      <li>
        {biggest.length === 1
          ? `הרשימה הגדולה: ${biggest[0].short}, עם ${top} מנדטים (${pct((biggest[0].votes / e.valid) * 100)} מהקולות הכשרים).`
          : `הרשימות הגדולות: ${biggest.map((l) => `${l.short} (${pct((l.votes / e.valid) * 100)})`).join(" ו")} — ${top} מנדטים כל אחת.`}
      </li>
      <li>
        {num(a.withAll.wasted)} קולות ({pct((a.withAll.wasted / e.valid) * 100)}) הלכו לרשימות שלא עברו — כ-{(a.withAll.wasted / a.withAll.quota).toFixed(1)}{" "}
        מנדטים.
        {notable.length > 0 && ` הבולטות: ${notable.map((l) => `${l.short} (${pct((l.votes / e.valid) * 100)})`).join(", ")}.`}
      </li>
      {nearMiss && (
        <li>
          הכי קרוב לסף בלי לעבור: {nearMiss.short} — חסרו לה {num(Math.ceil(thr - nearMiss.votes))} קולות. הרשימה
          הקטנה ביותר שעברה: {lowestIn.short}, {num(Math.floor(lowestIn.votes - thr))} קולות מעל הסף.
        </li>
      )}
      <li>
        הסכמי העודפים: {active} פעילים מתוך {e.agreements.length}. כולם יחד, לעומת אף הסכם: {fmtDiffOf(e, a.allVsNone)}.
      </li>
    </ul>
  );
}

/** חלוקת הכנסת לגושים בתוצאות מערכת שהסתיימה — במסך "מה השתנה" (הכרעות בעלים 02.11.2026) */
export function PastBlocs({ id }: { id: string }) {
  const e = results.find((x) => x.id === id)!;
  return <PersonalBlocs title={`חלוקת הכנסת בתוצאות ${e.label}`} source={`תוצאות אמת ${e.label}; לפי השיוך במסך "מה השתנה"`} asOf="התוצאות הסופיות" datasets={[e.knesset === 25
        ? { families: k25Families(), values: Object.fromEntries(e.lists.map(l => [l.letters, l.seats])), source: `תוצאות אמת ${e.label}; לפי השיוך במסך "מה השתנה"`, asOf: "התוצאות הסופיות" }
        : { historical: true, mapping: {}, values: Object.fromEntries(e.lists.map(l => [l.letters, l.seats])), source: `תוצאות אמת ${e.label}; התאמות מובהקות בלבד`, asOf: "התוצאות הסופיות" }]} />;
}

/**
 * "תוצאות" של מערכת שהסתיימה — לפי בורר המערכת שבפס העליון (הכרעות בעלים 02.11.2026).
 * בעלי הזכות, ההצבעה והגושים עברו ל"מה השתנה" (שם — הערך והשינוי מהקודמת); כאן — מה שאינו השוואה.
 */
export default function Results({ id }: { id: string }) {
  const e = ELECTIONS.find((x) => x.id === id)!;
  // השינוי הקרוב במנדטים — לכל מערכת, מאותו מנוע (src/engine/seatChange.ts)
  const changes = seatChanges(Object.fromEntries(e.lists.map((l) => [l.letters, l.votes])), e.valid, e.agreements.map(([x, y]) => [x, y] as Agreement));
  const short = (letters: string) => shortOf(e, letters);
  const a = ALL.find((x) => x.e.id === id)!.a;
  const passing = e.lists.filter((l) => l.seats > 0);
  const failed = e.lists.filter((l) => l.seats === 0);
  const wasted = a.withAll.wasted;
  const fmtDiff = (d: readonly (readonly [string, number])[]) => fmtDiffOf(e, d);
  return (
    <>
      <Split title="איך נראתה הכנסת שנבחרה?" lead="תוצאות רשמיות וחלוקת המנדטים. המערכת נבחרת בכפתור שבפס העליון." primary={<>
      <Card>
        <h2 className="text-xl font-display leading-tight">
          הכנסת ה-{e.knesset} · {e.label}
        </h2>
        {e.id === "k26" && <p className="text-sm text-ink-soft">{partialLine()}</p>}
        <dl className="c-result-stats grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 mt-4 text-sm">
          <div><dt className="text-ink-soft">קולות כשרים</dt><dd className="text-xl font-bold tabular-nums">{num(e.valid)}</dd></div>
          <div><dt className="text-ink-soft">אחוז החסימה בקולות</dt><dd className="text-xl font-bold tabular-nums">{num(a.withAll.thresholdVotes)}</dd></div>
        </dl>
      </Card>
      </>} secondary={<>
      <Card title="בקצרה">
        <Explained
          kind="נתון רשמי"
          source={`ועדת הבחירות המרכזית — votes${e.knesset}.bechirot.gov.il, ומנוע החוק של האתר`}
          asOf="התוצאות הסופיות"
          assumption="כל המספרים מהתוצאות הרשמיות. 'מה הזיזו ההסכמים' — השוואה נגד-עובדתית על אותם קולות."
          methodAnchor="results"
        >
          <Story e={e} a={a} />
        </Explained>
      </Card>

      <Card title="הקולות שלא הומרו למנדטים">
        <Explained
          kind="נתון רשמי"
          source={`ועדת הבחירות המרכזית — votes${e.knesset}.bechirot.gov.il`}
          asOf="התוצאות הסופיות"
          assumption="'לא הומרו' = קולות כשרים לרשימות שלא עברו את אחוז החסימה (בלי הפתקים הפסולים)."
          methodAnchor="results"
        >
          <p className="text-3xl font-extrabold tabular-nums">
            {num(wasted)} <span className="text-lg font-medium">קולות · {pct((wasted / e.valid) * 100)} מהכשרים · כ-{(wasted / a.withAll.quota).toFixed(1)} מנדטים</span>
          </p>
          <p className="text-sm text-ink-soft mt-1">
            {failed.filter((l) => l.votes >= e.valid * 0.005).map((l) => `${l.short} ${num(l.votes)} (${pct((l.votes / e.valid) * 100)})`).join(" · ")}
            {failed.filter((l) => l.votes < e.valid * 0.005).length > 0 && ` · ועוד ${failed.filter((l) => l.votes < e.valid * 0.005).length} רשימות קטנות`}
          </p>
        </Explained>
      </Card>

      <Card title="הרשימות שנכנסו לכנסת">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">הרשימות שעברו את אחוז החסימה</caption>
            <thead>
              <tr className="text-right border-b border-paper-line">
                <th scope="col" className="py-1">רשימה</th>
                <th scope="col">אותיות</th>
                <th scope="col">קולות</th>
                <th scope="col">אחוז</th>
                <th scope="col">מנדטים</th>
                <th scope="col">השינוי הקרוב במנדטים</th>
              </tr>
            </thead>
            <tbody>
              {passing.map((l) => (
                <tr key={l.letters} className="border-b border-paper-line/60">
                  <th scope="row" className="text-right py-1 font-medium" title={l.name}>{l.short}</th>
                  <td>{l.ballot ?? l.letters}</td>
                  <td className="tabular-nums">{num(l.votes)}</td>
                  <td className="tabular-nums">{pct((l.votes / e.valid) * 100)}</td>
                  <td className="tabular-nums font-bold">{l.seats}</td>
                  <td className="tabular-nums text-[11px]"><ShiftLine shift={changes?.[l.letters]?.up ?? null} up /><ShiftLine shift={changes?.[l.letters]?.down ?? null} up={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* היה בטבלת 2026 בלבד — עכשיו בכל מערכת */}
        <p className="text-sm mt-3"><Link to={e.id === "k26" ? "/changes" : `/changes?election=${e.id}`} className="f-btn">מאיפה הגיעו המצביעים של כל רשימה ⇐ מה השתנה</Link></p>
        <Fold title="פרטי חלוקת המנדטים">
          <p className="text-sm">המודד: {num(a.withAll.quota)} קולות למנדט שלם (סך הקולות של הרשימות שעברו, חלקי 120, החלק השלם — סעיף 81(ב) לחוק).</p>
          <ul className="text-sm mt-2">{passing.map((l) => <li key={l.letters}>{l.short}: {a.withAll.whole[l.letters]} מנדטים שלמים לפני חלוקת העודפים</li>)}</ul>
        </Fold>
      </Card>


      {e.id === "k26" ? <Card title="כל הקולות לפי יישוב"><Missing what="תוצאות 2026 לפי יישוב" /><p className="text-sm mt-2"><Link to="/changes" className="f-btn">חיפוש לפי עיר או קלפי ⇐ מה השתנה</Link></p></Card> : <LocalityResults key={e.id} electionId={e.id} />}
      <Card title="מה הזיזו הסכמי העודפים">
        <ul className="text-sm space-y-1 mb-3">
          {e.agreements.map(([x, y]) => {
            const inactive = a.withAll.inactiveAgreements.find((i) => i.pair[0] === x && i.pair[1] === y);
            return (
              <li key={x + y}>
                {short(x)} – {short(y)} {inactive ? <Badge tone="warn">לא פעיל: {short(inactive.pair.find((p) => !a.withAll.passing.includes(p)) ?? "")} לא עברה</Badge> : <Badge tone="ok">פעיל</Badge>}
              </li>
            );
          })}
        </ul>
        <Explained
          kind="חישוב לפי החוק"
          source="המנוע של האתר על הקולות הרשמיים"
          asOf="התוצאות הסופיות"
          assumption="השוואה נגד-עובדתית: אותם קולות בדיוק, בלי ההסכמים. בפועל בוחרים ומפלגות היו אולי מתנהגים אחרת."
          methodAnchor="agreements"
        >
          <p className="font-bold">כל ההסכמים לעומת אף הסכם: {fmtDiff(a.allVsNone)}</p>
          <p className="text-sm mt-2">כשמבטלים הסכם אחד בכל פעם (והשאר נשארים):</p>
          <ul className="text-sm list-disc ps-5">
            {a.single.map((s) => (
              <li key={s.pair.join()}>
                {short(s.pair[0])} – {short(s.pair[1])}: {fmtDiff(s.diff)}
              </li>
            ))}
          </ul>
          <Note>
            שימו לב: ההשפעה של הסכם תלויה בהסכמים האחרים. לכן "מה עשה הסכם מסוים" אינו תמיד מספר אחד, ולפעמים ההסכמים מקזזים זה את זה.
          </Note>
        </Explained>
      </Card>

      </>} />
    </>
  );
}

/** "סיכום" בבורר: ההשוואה בין המערכות (הכרעות בעלים 02.11.2026) */
export function ElectionSummary() { return <>
      <Fold title="פרטי החישוב בכל מערכת">
        <ul className="text-sm space-y-1">{[...ALL].reverse().map(({ e: x, a: ax }) => <li key={x.id}>{x.label}: אחוז החסימה {num(ax.withAll.thresholdVotes)} קולות; מודד {num(ax.withAll.quota)} קולות למנדט שלם.</li>)}</ul>
      </Fold>
      <Card title="כל המערכות, זו לצד זו">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">השוואה בין מערכות הבחירות 2015–2026</caption>
            <thead>
              <tr className="text-right border-b border-paper-line">
                <th scope="col" className="py-2 pe-3">מערכת</th>
                <th scope="col" className="pe-3">בעלי זכות</th>
                <th scope="col" className="pe-3">הצבעה</th>
                <th scope="col" className="pe-3">עברו</th>
                <th scope="col" className="pe-3">נשרפו</th>
                <th scope="col">מה הזיזו ההסכמים</th>
              </tr>
            </thead>
            <tbody>
              {[...ALL].reverse().map(({ e: x, a: ax }) => (
                <tr key={x.id} className={`border-b border-paper-line/60 `}>
                  <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">
                    {x.label} <span className="text-ink-soft font-normal">(ה-{x.knesset})</span>
                  </th>
                  <td className="pe-3 tabular-nums">{num(x.eligible)}</td>
                  <td className="pe-3 tabular-nums">{pct((x.voted / x.eligible) * 100)}</td>
                  <td className="pe-3 tabular-nums">{x.lists.filter((l) => l.seats > 0).length}</td>
                  <td className="pe-3 tabular-nums whitespace-nowrap">
                    {pct((ax.withAll.wasted / x.valid) * 100)} <span className="text-ink-soft">(כ-{(ax.withAll.wasted / ax.withAll.quota).toFixed(1)} מנדטים)</span>
                  </td>
                  <td>{fmtDiffOf(x, ax.allVsNone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>
          "נשרפו" = קולות כשרים לרשימות שלא עברו את אחוז החסימה. "מה הזיזו ההסכמים" = כל ההסכמים יחד לעומת אף הסכם, על אותם קולות.
        </Note>
      </Card>

</>; }

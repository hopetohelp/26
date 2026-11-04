import { Link } from "react-router-dom";
import PersonalBlocs from "../components/PersonalBlocs";
import Explained from "../components/Explained";
import { Card, Note, Split } from "../components/ui";
import { allocate, type Agreement } from "../engine/baderOfer";
import { results } from "../lib/data";
import { blocSlices, Stack } from "./simple/shared";
import { results2026 } from "../lib/guessAccuracyData";
import { K26_RESULT } from "../lib/election2026";
import { seatChanges } from "../engine/seatChange";
import ShiftLine from "../components/ShiftLine";
import { blocAssignment } from "../lib/electionBlocs";
import { K26_ID } from "../lib/election";
import { k25Families } from "../lib/lineage";
import { num, pct, pctOne } from "../lib/format";

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

/** חלוקת הכנסת לגושים בתוצאות מערכת שהסתיימה — במסך "מה השתנה" (הכרעות בעלים 02.11.2026) */
export function PastBlocs({ id }: { id: string }) {
  const e = results.find((x) => x.id === id)!;
  return <PersonalBlocs title={`חלוקת הכנסת בתוצאות ${e.label}`} source={`תוצאות אמת ${e.label}; לפי השיוך במסך "מה השתנה"`} asOf="התוצאות הסופיות" datasets={[e.knesset === 25
        ? { families: k25Families(), values: Object.fromEntries(e.lists.map(l => [l.letters, l.seats])), source: `תוצאות אמת ${e.label}; לפי השיוך במסך "מה השתנה"`, asOf: "התוצאות הסופיות" }
        : { historical: true, mapping: {}, values: Object.fromEntries(e.lists.map(l => [l.letters, l.seats])), source: `תוצאות אמת ${e.label}; התאמות מובהקות בלבד`, asOf: "התוצאות הסופיות" }]} />;
}

/**
 * "תוצאות" — לפי בורר המערכת שבפס העליון (הכרעות בעלים 02.11.2026; צומצם בהכרעת בעלים 03.11.2026):
 * רק מה שאין במסכים אחרים — קולות למנדט, וכמה קולות חסרים לכל רשימה למנדט נוסף או לאיבוד מנדט.
 * בעלי הזכות, ההצבעה והקולות שלא עברו — "מה השתנה" (OverviewCards); ההסכמים יחד — "סיכום"; לפי יישוב — "מה השתנה".
 */
export default function Results({ id }: { id: string }) {
  const e = ELECTIONS.find((x) => x.id === id)!;
  // השינוי הקרוב במנדטים — לכל מערכת, מאותו מנוע (src/engine/seatChange.ts)
  const changes = seatChanges(Object.fromEntries(e.lists.map((l) => [l.letters, l.votes])), e.valid, e.agreements.map(([x, y]) => [x, y] as Agreement));
  const short = (letters: string) => shortOf(e, letters);
  const a = ALL.find((x) => x.e.id === id)!.a;
  const passing = e.lists.filter((l) => l.seats > 0);
  const failed = e.lists.filter((l) => l.seats === 0).sort((x, y) => y.votes - x.votes);
  const blocs = blocAssignment(e.id);
  return (
    <>
      <Split primary={<>
      <Card>
        <Explained
          kind="חישוב לפי החוק"
          source={`ועדת הבחירות המרכזית — votes${e.knesset}.bechirot.gov.il, ומנוע החוק של האתר`}
          asOf="התוצאות הסופיות"
          assumption="המודד: סך הקולות של הרשימות שעברו את אחוז החסימה, חלקי 120, החלק השלם (סעיף 81(ב) לחוק). השינוי הקרוב — אותו מנוע, כולל הסכמי העודפים."
          methodAnchor="results"
          bare
        >
          {/* נתוני ההצבעה בראש המסך (הכרעת בעלים 03.11.2026) — בלי השוואה למערכת הקודמת */}
          {/* כרטיסים בעיצוב של "מה השתנה" (OverviewCards), בלי שינוי מהמערכת הקודמת (הכרעת בעלים 03.11.2026) */}
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-1">
            <StatCard label="בעלי זכות בחירה" value={e.eligible} />
            <StatCard label="הצביעו" value={e.voted} share={(e.voted / e.eligible) * 100} />
            <StatCard label="קולות שנשרפו" value={a.withAll.wasted} share={(a.withAll.wasted / e.valid) * 100} />
            <StatCard label="מצביעים למנדט" value={a.withAll.quota} />
            <StatCard label="אחוז החסימה בקולות" value={a.withAll.thresholdVotes} className="col-span-2 md:col-span-1" />
          </dl>
        </Explained>
      </Card>
      {/* חלוקת הכנסת לגושים — הועברה ממסך "מה השתנה" (הכרעת בעלים 03.11.2026) */}
      {/* כרטיס עם גרף שורה של ארבעת הגושים; לחיצה על גוש מציגה את הרשימות שבו (הכרעת בעלים 03.11.2026). 2015–2021 — אין שיוך לגושים, נשארת המגירה */}
      {/* לכל מערכת עם שיוך גושים (blocAssignment) — אותו כרטיס; בלי שיוך — המגירה ההיסטורית, עד שסשן ד ישלים (הכרעת בעלים 04.11.2026) */}
      {blocs ? <BlocBarCard defs={blocs} values={e.id === K26_ID ? results2026.seats : Object.fromEntries(e.lists.map((l) => [l.letters, l.seats]))} nameOf={e.id === K26_ID ? undefined : (x) => shortOf(e, x)} />
        : <PastBlocs id={e.id} />}
      </>} secondary={<>
      <Card title="כמה קולות חסרים למנדט הבא">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">לכל רשימה שנכנסה: מנדטים, וכמה קולות לשינוי הקרוב במנדטים</caption>
            <thead>
              <tr className="text-right border-b border-paper-line">
                <th scope="col" className="py-1">רשימה</th>
                <th scope="col">קולות</th>
                <th scope="col">אחוז</th>
                <th scope="col">מנדטים</th>
                <th scope="col">מעודפים</th>
                <th scope="col">פער לשינוי במנדט</th>
              </tr>
            </thead>
            <tbody>
              {/* כל הרשימות, כולל אלה שלא עברו את אחוז החסימה (הכרעת בעלים 03.11.2026) */}
              {[...passing, ...failed].map((l) => (
                <tr key={l.letters} className="border-b border-paper-line/60">
                  <th scope="row" className="text-right py-1 font-medium" title={l.name}>{l.short}</th>
                  <td className="tabular-nums">{num(l.votes)}</td>
                  <td className="tabular-nums">{pct((l.votes / e.valid) * 100)}</td>
                  <td className="tabular-nums font-bold">{l.seats}</td>
                  <td className="tabular-nums">{l.seats - (a.withAll.whole[l.letters] ?? 0) > 0 && `\u2066+${l.seats - (a.withAll.whole[l.letters] ?? 0)}\u2069`}</td>
                  <td className="tabular-nums text-[11px]"><ShiftLine shift={changes?.[l.letters]?.up ?? null} up /><ShiftLine shift={changes?.[l.letters]?.down ?? null} up={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>


      {/* כרטיס אחד, טקסט ממורכז (הכרעת בעלים 03.11.2026): מה ההסכמים, ומה היה קורה בלי אף הסכם */}
      {/* הכותרת בתוך הכרטיס, בשורה ממורכזת למעלה יחד עם "בלי אף הסכם" (הכרעת בעלים 03.11.2026) */}
      <Card>
        <Explained
          kind="חישוב לפי החוק"
          source="המנוע של האתר על הקולות הרשמיים"
          asOf="התוצאות הסופיות"
          assumption="השוואה נגד-עובדתית: אותם קולות בדיוק, בלי אף הסכם. בפועל בוחרים ומפלגות היו אולי מתנהגים אחרת."
          methodAnchor="agreements"
          bare
        >
          <div className="f-card text-center space-y-1.5 text-sm">
            <p><b>הסכמי העודפים</b> · <b>בלי אף הסכם: {a.allVsNone.length ? a.allVsNone.map(([k, d], i) => <span key={k}>{i ? ", " : ""}{short(k)} <bdi dir="ltr">{-d > 0 ? "+" : "−"}{Math.abs(d)}</bdi></span>) : "לא שינו דבר"}</b></p>
            <p>{e.agreements.map(([x, y]) => {
              const inactive = a.withAll.inactiveAgreements.some((i) => i.pair[0] === x && i.pair[1] === y);
              return `${short(x)} – ${short(y)}${inactive ? " (לא פעיל)" : ""}`;
            }).join(" · ")}</p>
          </div>
        </Explained>
      </Card>
      </>} />
      {/* שורת המקור אחת, בסוף העמוד (הכרעת בעלים 03.11.2026); קישור-טקסט — חריג מותר בשורת המקור */}
      <p className="mt-4 text-sm text-ink-soft"><Link to="/method#results" className="!text-ink-soft !font-normal underline">מידע ומקורות</Link></p>
    </>
  );
}

/** "סיכום" בבורר: ההשוואה בין המערכות (הכרעות בעלים 02.11.2026) */
export function ElectionSummary() { return <>
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

/** גרף שורה של ארבעת הגושים; לחיצה על גוש פותחת את חלון הפירוט הקיים של גרפי הגושים (Stack) */
function BlocBarCard({ defs, values, nameOf }: { defs: Parameters<typeof blocSlices>[2]; values: Record<string, number>; nameOf?: (id: string) => string }) {
  return <Card title="חלוקת הכנסת לגושים"><Stack slices={blocSlices(values, 0, defs)} values={values} label="חלוקת הכנסת לגושים" name={nameOf} /></Card>;
}

/** כרטיס נתון — אותו עיצוב כמו בכרטיסי "מה השתנה" (OverviewCards): מספר גדול, פס עליון בצבע ההדגשה, ואחוז מתחת */
function StatCard({ label, value, share, className = "" }: { label: string; value: number; share?: number; className?: string }) {
  return <div className={`rounded-theme border border-paper-line border-t-4 border-t-accent bg-paper-card shadow-md text-center min-w-0 flex flex-col items-center px-2 py-3 gap-1.5 ${className}`}>
    <dt className="font-bold text-ink-soft leading-tight text-xs md:text-sm">{label}</dt>
    <dd className="contents tabular-nums">
      <bdi dir="ltr" className="block font-display font-extrabold leading-none text-ink text-xl md:text-3xl">{num(value)}</bdi>
      {share != null && <span className="font-bold text-accent leading-none text-xs md:text-sm"><bdi dir="ltr">{pctOne(share)}</bdi></span>}
    </dd>
  </div>;
}

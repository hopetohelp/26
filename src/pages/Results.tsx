import PersonalBlocs from "../components/PersonalBlocs";
import { useState } from "react";
import Explained from "../components/Explained";
import { Badge, Card, Fold, Note, PageTitle, Split } from "../components/ui";
import { allocate, type Agreement } from "../engine/baderOfer";
import { results } from "../lib/data";
import { num, pct } from "../lib/format";

type Election = (typeof results)[number];

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
const yearLabel = (e: Election) => e.label.replace("אפריל", "אפר׳").replace("ספטמבר", "ספט׳");

/** הניתוח של כל המערכות — לטבלת ההשוואה */
const ALL = results.map((e) => ({ e, a: analysis(e) }));

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

export default function Results() {
  const [id, setId] = useState(results[results.length - 1].id);
  const e = results.find((x) => x.id === id)!;
  const short = (letters: string) => shortOf(e, letters);
  const a = ALL.find((x) => x.e.id === id)!.a;
  const passing = e.lists.filter((l) => l.seats > 0);
  const failed = e.lists.filter((l) => l.seats === 0);
  const wasted = a.withAll.wasted;
  const fmtDiff = (d: readonly (readonly [string, number])[]) => fmtDiffOf(e, d);

  return (
    <>
      <PageTitle lead={`התוצאות הרשמיות של ועדת הבחירות המרכזית בכל ${results.length} מערכות הבחירות מאז 2019, וחלוקת המנדטים כפי שהחוק קובע. לכל מערכת אותו ניתוח: מי עבר, כמה קולות נשרפו, ומה הזיזו הסכמי העודפים. המנוע של האתר משחזר כל אחת מהן בדיוק.`}>
        תוצאות אמת
      </PageTitle>

      <Split primary={<>
      <Card>
        <div role="radiogroup" aria-label="מערכת בחירות" className="flex flex-wrap gap-2">
          {[...results].reverse().map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === id}
              onClick={() => setId(x.id)}
              className={`min-h-[44px] px-4 rounded-full text-sm font-bold border ${x.id === id ? "bg-ink text-paper-card border-ink" : "border-ink-faint"}`}
            >
              {yearLabel(x)}
              <span className="sr-only"> — הכנסת ה-{x.knesset}</span>
            </button>
          ))}
        </div>
        <h2 className="font-display text-3xl leading-none mt-4">
          הכנסת ה-{e.knesset} · {e.label}
        </h2>
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 mt-4 text-sm">
          <div><dt className="text-ink-soft">בעלי זכות בחירה</dt><dd className="text-xl font-bold tabular-nums">{num(e.eligible)}</dd></div>
          <div><dt className="text-ink-soft">הצביעו</dt><dd className="text-xl font-bold tabular-nums">{num(e.voted)} <span className="text-sm font-normal">({pct((e.voted / e.eligible) * 100)})</span></dd></div>
          <div><dt className="text-ink-soft">קולות כשרים</dt><dd className="text-xl font-bold tabular-nums">{num(e.valid)}</dd></div>
          <div><dt className="text-ink-soft">אחוז החסימה בקולות</dt><dd className="text-xl font-bold tabular-nums">{num(a.withAll.thresholdVotes)}</dd></div>
        </dl>
      </Card>
      </>} secondary={<>
      <PersonalBlocs title={`הגושים שלי בתוצאות ${e.label}`} historical mapping={e.knesset === 25 ? undefined : {}} values={Object.fromEntries(e.lists.map(l => [l.letters, l.seats]))} source={`תוצאות אמת ${e.label}; התאמות מובהקות בלבד`} asOf="התוצאות הסופיות" />

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
              </tr>
            </thead>
            <tbody>
              {passing.map((l) => (
                <tr key={l.letters} className="border-b border-paper-line/60">
                  <th scope="row" className="text-right py-1 font-medium" title={l.name}>{l.short}</th>
                  <td>{l.letters}</td>
                  <td className="tabular-nums">{num(l.votes)}</td>
                  <td className="tabular-nums">{pct((l.votes / e.valid) * 100)}</td>
                  <td className="tabular-nums font-bold">{l.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Fold title="פרטי חלוקת המנדטים">
          <p className="text-sm">המודד: {num(a.withAll.quota)} קולות למנדט שלם (סך הקולות של הרשימות שעברו, חלקי 120, החלק השלם — סעיף 81(ב) לחוק).</p>
          <ul className="text-sm mt-2">{passing.map((l) => <li key={l.letters}>{l.short}: {a.withAll.whole[l.letters]} מנדטים שלמים לפני חלוקת העודפים</li>)}</ul>
        </Fold>
      </Card>


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

      <Fold title="פרטי החישוב בכל מערכת">
        <ul className="text-sm space-y-1">{[...ALL].reverse().map(({ e: x, a: ax }) => <li key={x.id}>{x.label}: אחוז החסימה {num(ax.withAll.thresholdVotes)} קולות; מודד {num(ax.withAll.quota)} קולות למנדט שלם.</li>)}</ul>
      </Fold>
      <Card title="כל המערכות מאז 2019, זו לצד זו">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">השוואה בין מערכות הבחירות 2019–2022</caption>
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
                <tr key={x.id} className={`border-b border-paper-line/60 ${x.id === id ? "bg-accent-soft" : ""}`}>
                  <th scope="row" className="py-2 pe-3 text-right font-medium whitespace-nowrap">
                    {x.label} <span className="text-ink-soft font-normal">(ה-{x.knesset})</span>
                  </th>
                  <td className="pe-3 tabular-nums">{num(x.eligible)}</td>
                  <td className="pe-3 tabular-nums">{pct((x.voted / x.eligible) * 100)}</td>
                  <td className="pe-3 tabular-nums">{x.lists.filter((l) => l.seats > 0).length}</td>
                  <td className="pe-3 tabular-nums whitespace-nowrap">
                    {pct((ax.withAll.wasted / x.valid) * 100)} <span className="text-ink-soft">(כ-{(ax.withAll.wasted / ax.withAll.quota).toFixed(1)} מנד׳)</span>
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
      </>} />
    </>
  );
}

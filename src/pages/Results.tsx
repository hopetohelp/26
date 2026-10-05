import { useState } from "react";
import Explained from "../components/Explained";
import { Badge, Card, Note, PageTitle } from "../components/ui";
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

export default function Results() {
  const [id, setId] = useState("k25");
  const e = results.find((x) => x.id === id)!;
  const short = (letters: string) => e.lists.find((l) => l.letters === letters)?.short ?? letters;
  const a = analysis(e);
  const passing = e.lists.filter((l) => l.seats > 0);
  const failed = e.lists.filter((l) => l.seats === 0);
  const wasted = a.withAll.wasted;
  const fmtDiff = (d: readonly (readonly [string, number])[]) =>
    d.length ? d.map(([k, v]) => `${short(k)} \u2066${v > 0 ? "+" : ""}${v}\u2069`).join(" · ") : "לא שינו דבר";

  return (
    <>
      <PageTitle lead="התוצאות הרשמיות של ועדת הבחירות המרכזית, וחלוקת המנדטים כפי שהחוק קובע. המנוע של האתר משחזר כל אחת מהן בדיוק.">
        תוצאות אמת
      </PageTitle>

      <Card>
        <label className="text-sm flex flex-col max-w-xs">
          מערכת בחירות
          <select className="border border-paper-line rounded px-2 py-1 mt-1" value={id} onChange={(ev) => setId(ev.target.value)}>
            {[...results].reverse().map((x) => (
              <option key={x.id} value={x.id}>
                הכנסת ה-{x.knesset} ({x.label})
              </option>
            ))}
          </select>
        </label>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
          <div><dt className="text-ink-soft">בעלי זכות בחירה</dt><dd className="text-xl font-bold tabular-nums">{num(e.eligible)}</dd></div>
          <div><dt className="text-ink-soft">הצביעו</dt><dd className="text-xl font-bold tabular-nums">{num(e.voted)} <span className="text-sm font-normal">({pct((e.voted / e.eligible) * 100)})</span></dd></div>
          <div><dt className="text-ink-soft">קולות כשרים</dt><dd className="text-xl font-bold tabular-nums">{num(e.valid)}</dd></div>
          <div><dt className="text-ink-soft">אחוז החסימה בקולות</dt><dd className="text-xl font-bold tabular-nums">{num(a.withAll.thresholdVotes)}</dd></div>
        </dl>
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
                <th scope="col">מנדטים שלמים</th>
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
                  <td className="tabular-nums">{a.withAll.whole[l.letters]}</td>
                  <td className="tabular-nums font-bold">{l.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>המודד: {num(a.withAll.quota)} קולות למנדט שלם (סך הקולות של הרשימות שעברו, חלקי 120, החלק השלם — סעיף 81(ב) לחוק).</Note>
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
    </>
  );
}

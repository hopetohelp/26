import Explained from "../components/Explained";
import { Fold, Note } from "../components/ui";
import historyFile from "../data/history.json";
import { results } from "../lib/data";
import { seatsFmt, signed } from "../lib/format";
import { familyRows, pollsterRecords, summarizeCycle, type Cycle, type ElectionResult } from "../lib/history";

/**
 * דיוק הסקרים לאורך המערכות — במסך "סיכום" של הבורר (הכרעות בעלים 02.11.2026).
 * "סקרים" של כל מערכת (כולל 2015–2022) — אותו מסך של 2026 (Polls + Trends, הכרעת בעלים 04.11.2026); תוכן "סקרים" הישן עבר לטבלאות הארכיון ולמגמות.
 */
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
  if (k === n) return `${r.name}: בכל ${n} המערכות התוצאה בפועל הייתה ${dir} מממוצע הסקרים (בפער ממוצע של ${avg} מנדטים).`;
  if (k === n - 1) return `${r.name}: ב-${k} מתוך ${n} המערכות התוצאה בפועל הייתה ${dir} מממוצע הסקרים.`;
  return null;
}

/** טווח סך הפער בין המכונים בכל מערכת — כדי להראות שההבדל בין מערכות גדול מההבדל בין מכונים */
const spread = cycles.map((c) => {
  const gaps = pollsterRecords([c], res).map((p) => p.entries[0].gap);
  return { label: c.label, min: Math.min(...gaps), max: Math.max(...gaps) };
});
const r1 = (x: number) => seatsFmt(Math.round(x * 10) / 10);


/** ההשוואה בין המערכות — במסך "סיכום" של הבורר (הכרעות בעלים 02.11.2026) */
export function AccuracyAcross() {
  return (
    <>
      <Fold title="חמש מערכות במבט אחד">
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf="ערב כל מערכת בחירות"
          assumption='"סך הפער" = סכום ההפרשים בין ממוצע הסקרים לתוצאה, על פני כל הרשימות. הגוש = הרשימות שהמליצו על נתניהו לנשיא המדינה אחרי אותן בחירות — עובדה, לא סיווג.'
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
          הפרש עם מינוס = הסקרים נתנו פחות ממה שהתקבל בפועל. "טעות בשאלת אחוז החסימה" = רוב הסקרים נתנו לרשימה מנדטים ובפועל לא עברה, או
          להפך — כלומר כל הקולות שלה "נשרפו" בניגוד לתמונה שהציגו הסקרים, או ההפך.
        </Note>
      </Fold>
      <Fold title="מה חזר על עצמו">
        <Explained
          kind="סיכום סקרים"
          source={SOURCE}
          asOf="ערב כל מערכת בחירות"
          assumption='לכל רשימה (או קבוצת רשימות) — ממוצע הסקרים פחות התוצאה בכל מערכת. "המפלגות הערביות" = כל הרשימות שהתמודדו בכל מערכת, ביחד.'
          methodAnchor="accuracy"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">ההפרש בין ממוצע הסקרים לתוצאה, לפי רשימה ומערכת</caption>
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
      </Fold>
      <Fold title="מכוני הסקרים לאורך זמן">
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
      </Fold>
    </>
  );
}

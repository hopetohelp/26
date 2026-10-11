import { useState } from "react";
import { Link } from "react-router-dom";
import PersonalBlocs from "../components/PersonalBlocs";
import Explained from "../components/Explained";
import DumbbellChart, { DUMBBELL_LEGEND, NameButton } from "../components/dumbbellChart";
import { Segmented } from "../components/Choice";
import { ChartBar, ChartWithTable, Fold, Note, Split } from "../components/ui";
import modelFile from "../data/model.json";
import { POLL_AVERAGE } from "../lib/sources";
import { listName } from "../lib/data";
import { diffText as diff, r1, type DumbbellRow, type DumbbellUnit, type ShareHist } from "../lib/dumbbell";
import { date, num, rng, seatsFmt, signed } from "../lib/format";
import { DEFAULT_LINEAGE, heirs, K25_LISTS, k25ListName, lineageProblem, lineageRows, manualFromCurrent, sharedLists, VALID_2022, type Category, type Lineage, type LineageRow, type Split as SplitKind } from "../lib/lineage";
import SaveButton, { SaveError } from "./guess/SaveButton";
import { ActionBar, Btn, ShortLabel } from "./guess/ui";
import { useSession } from "./guess/useCrowd";
import { useCrowdSeats, useLineage } from "./guess/useLineage";

interface Family { id: string; k26: string[]; why: string }
interface ModelLite {
  scenarios: { lists: Record<string, { share: number[]; shareHist?: ShareHist; seats: number[]; seatsHist?: number[] }> };
  changes: { alternatives: { id: string; families: Family[] }[] };
}
const m = modelFile as unknown as ModelLite;

/** מתג אחד לכל המסך: אחוזים או מנדטים (הכרעת בעלים 11.10.2026) */
const UNITS: { id: DumbbellUnit; label: string }[] = [
  { id: "pct", label: "אחוזים" },
  { id: "seats", label: "מנדטים" },
];
const CAMP = m.changes.alternatives.find((a) => a.id === "camp")!;

const CATEGORIES: { id: Category; title: string; lead: string }[] = [
  { id: "certain", title: "שיוך ודאי", lead: "אותה רשימה, או איחוד של רשימות מ-2022." },
  { id: "partial", title: "שיוך חלקי", lead: "רשימה של 2022 שהתפצלה. התוצאה שלה מתחלקת בין הרשימות של היום." },
  { id: "none", title: "אין שיוך", lead: "רשימות חדשות, בלי מקבילה ב-2022." },
];
const SPLITS: { id: SplitKind; label: string }[] = [
  { id: "polls", label: "לפי הסקרים" },
  { id: "crowd", label: "לפי המשתתפים" },
  { id: "manual", label: "ידני" },
];

const fromNames = (r: LineageRow) => r.from.map(k25ListName).join(" + ");
const approx = (r: LineageRow) => (r.category === "partial" ? "~" : "");
const seats22 = (r: LineageRow) => `${approx(r)}${seatsFmt(Math.round(r.seats2022 * 10) / 10)}`;
const share22 = (r: LineageRow) => `${approx(r)}${r1(r.share2022)}`;

/** למה כך שויך: ברירת המחדל מ-raw/lineage.json; שיוך ששונה — "השיוך שלכם" */
function why(id: string, lin: Lineage): string {
  if (JSON.stringify(lin.map[id]) !== JSON.stringify(DEFAULT_LINEAGE.map[id])) return "השיוך שלכם.";
  if (id === "noam") return "נעם התמודדה ב-2022 ברשימה המשותפת של הציונות הדתית, עוצמה יהודית ונעם.";
  return CAMP.families.find((f) => f.k26.includes(id))?.why ?? "רשימה חדשה, שלא התמודדה ב-2022.";
}

export default function Changes() {
  const session = useSession();
  const lineage = useLineage(session);
  const crowd = useCrowdSeats();
  const lin = lineage.draft;
  const effective = lin.split === "crowd" && !crowd ? { ...lin, split: "polls" as const } : lin;
  const { rows, unassigned2022 } = lineageRows(effective, crowd);
  const [open, setOpen] = useState<string | null>(null);
  // שני המתגים של המסך (שורת הבקרה העליונה) משפיעים על כל הכרטיסים, הגרפים והטבלאות
  const [unit, setUnit] = useState<DumbbellUnit>("seats");
  const [asTable, setAsTable] = useState(false);
  const problem = lineageProblem(lin);

  const setMap = (id: string, from: string[]) => setLin({ ...lin, map: { ...lin.map, [id]: from } });
  const setLin = (next: Lineage) => {
    // פיצול חדש בחלוקה ידנית ⇐ מתחיל מהחלוקה הנוכחית, כדי שלא יישאר סכום שאינו 100
    if (next.split === "manual") {
      const fresh = manualFromCurrent({ ...next, split: "polls" }, crowd);
      next = { ...next, manual: Object.fromEntries(Object.keys(fresh).map((l) => [l, sameKeys(next.manual[l], fresh[l]) ? next.manual[l] : fresh[l]])) };
    }
    lineage.setDraft(next);
  };
  const setSplit = (split: SplitKind) => setLin({ ...lin, split, manual: split === "manual" ? manualFromCurrent(effective, crowd) : lin.manual });
  const setManual = (l: string, id: string, v: number) => lineage.setDraft({ ...lin, manual: { ...lin.manual, [l]: { ...lin.manual[l], [id]: Math.max(0, Math.min(100, Math.round(v * 10) / 10)) } } });

  // הגושים: 2022 מחושב מהמפלגות לפי השיוך, כך שהגושים והמפלגות תמיד תואמים
  const assigned = rows.filter((r) => r.category !== "none");
  const values2022 = Object.fromEntries(assigned.map((r) => [r.id, Math.round(r.seats2022 * 10) / 10]));
  const shares2022 = Object.fromEntries(assigned.map((r) => [r.id, Math.round(r.share2022 * 10) / 10]));
  const showBar = lineage.custom || lineage.dirty;

  const pct = unit === "pct";
  const range = (id: string) => (pct ? m.scenarios.lists[id]?.share : m.scenarios.lists[id]?.seats);
  const toRow = (r: LineageRow): DumbbellRow => {
    const sc = m.scenarios.lists[r.id];
    const rg = range(r.id);
    return {
      id: r.id,
      name: listName(r.id),
      from: fromNames(r),
      approx: r.category === "partial",
      before: pct ? r.share2022 : r.seats2022,
      now: pct ? r.shareNow : r.seatsNow,
      hist: (pct ? sc?.shareHist : sc?.seatsHist) ?? null,
      range: rg ? [rg[0], rg[2]] : null,
    };
  };
  const toggle = (id: string) => setOpen(open === id ? null : id);

  const editor = (r: LineageRow) => (
    <fieldset id={`lineage-${r.id}`} className="rounded-theme border border-paper-line p-3 mt-2">
      <legend className="text-sm font-bold px-1">{listName(r.id)} באה מ…</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3">
        {K25_LISTS.map((l) => (
          <label key={l.id} className="flex items-center gap-2 min-h-[44px] text-sm">
            <input type="checkbox" checked={r.from.includes(l.id)} onChange={(e) => setMap(r.id, e.target.checked ? [...r.from, l.id] : r.from.filter((x) => x !== l.id))} />
            {l.name} <span className="text-ink-soft tabular">({l.seats})</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-ink-soft mt-1">בלי סימון — "אין שיוך". רשימה של 2022 שסומנה אצל כמה רשימות — מתחלקת ביניהן.</p>
      <Btn className="mt-2" onClick={() => setOpen(null)}>סיום</Btn>
    </fieldset>
  );
  const editorOf = (list: LineageRow[]) => {
    const current = list.find((r) => r.id === open);
    return current ? editor(current) : null;
  };

  /** בטבלה (ובאין שיוך) שם המפלגה הוא כפתור; בגרף השם בתוך השורה (`DumbbellChart`). העורך נפתח מתחת. */
  const nameButton = (r: LineageRow) => <NameButton id={r.id} name={listName(r.id)} open={open === r.id} onToggle={() => toggle(r.id)} />;

  const table = (list: LineageRow[]) => (
    <table className="w-full text-sm">
      <caption className="sr-only">2022 מול היום, לפי המפלגה, {pct ? "באחוזים" : "במנדטים"}</caption>
      <thead>
        <tr className="text-right border-b border-paper-line">
          <th scope="col" className="py-2 pe-3">היום</th>
          <th scope="col" className="pe-3">ב-2022</th>
          <th scope="col" className="pe-3">{pct ? "2022 %" : "2022 מנדטים"}</th>
          <th scope="col" className="pe-3">{pct ? "היום %" : "מנדטים היום"}</th>
          <th scope="col" className="pe-3">{pct ? "טווח 80%" : "טווח 80% (מנדטים)"}</th>
          <th scope="col">{pct ? "שינוי (נק')" : "שינוי (מנדטים)"}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => {
          const rg = range(r.id);
          const d = pct ? r.shareNow - r.share2022 : r.seatsNow - Math.round(r.seats2022 * 10) / 10;
          return (
            <tr key={r.id} className="border-b border-paper-line/60">
              <th scope="row" className="py-1 pe-3 text-right font-medium">{nameButton(r)}</th>
              <td className="pe-3">{fromNames(r)}</td>
              <td className="pe-3 tabular">{pct ? share22(r) : seats22(r)}</td>
              <td className="pe-3 tabular">{pct ? r1(r.shareNow) : r.seatsNow}</td>
              <td className="pe-3 tabular whitespace-nowrap">{rg ? (pct ? rng(r1(rg[0]), r1(rg[2])) : rng(seatsFmt(rg[0]), seatsFmt(rg[2]))) : "—"}</td>
              <td className="tabular" dir="ltr">{pct ? diff(d) : signed(Math.round(d * 10) / 10)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const shared = sharedLists(effective);
  const splitNote = lin.split === "manual" ? "לפי החלוקה שלכם" : effective.split === "crowd" ? "לפי ממוצע המשתתפים (אינו סקר)" : `לפי ממוצע הסקרים (${date(POLL_AVERAGE.asOf)})`;

  return (
    <>
      <Split
        title="מה השתנה מהבחירות האחרונות"
        lead="כל מפלגה של היום מול התוצאה של 2022. מפלגה שנוצרה מפיצול מקבלת חלק מהתוצאה של הרשימה שממנה באה."
        primary={
          <>
            <ChartBar legend={DUMBBELL_LEGEND} asTable={asTable} onAsTable={setAsTable}>
              <Segmented size="sm" label="יחידות" value={unit} onChange={setUnit} options={UNITS} className="w-36" />
            </ChartBar>
            <PersonalBlocs
                title="מעבר בין הגושים"
                source="תוצאות 2022 לפי השיוך שלמטה, מול ממוצע הסקרים היום"
                asOf={date(POLL_AVERAGE.asOf)}
                compare
                unit={unit}
                datasets={[
                  { values: pct ? shares2022 : values2022, source: "2022 לפי השיוך", asOf: "תוצאות סופיות" },
                  { values: pct ? POLL_AVERAGE.shares : POLL_AVERAGE.seats, source: "היום", asOf: date(POLL_AVERAGE.asOf) },
                ]}
              />
          </>
        }
        secondary={
          <>
            <Explained
              kind="השוואה"
              source={`תוצאות 2022 (ועדת הבחירות המרכזית) מול ממוצע הסקרים — ${POLL_AVERAGE.polls} סקרים עד ${date(POLL_AVERAGE.asOf)}`}
              asOf={`הסקרים עד ${date(POLL_AVERAGE.asOf)}`}
              assumption="שינוי נטו בין שתי תמונות, לא מעבר בוחרים. בפיצול — התוצאה של 2022 מתחלקת לפי היחס בין הרשימות היום."
              methodAnchor="changes"
            >
              {CATEGORIES.map((c) => {
                const list = rows.filter((r) => r.category === c.id);
                if (!list.length) return null;
                return (
                  <section key={c.id} className="border-t border-paper-line pt-4 mt-6 first:mt-0" aria-labelledby={`cat-${c.id}`}>
                    <h2 id={`cat-${c.id}`} className="text-xl font-display leading-tight">{c.title}</h2>
                    <p className="text-sm text-ink-soft mb-3">{c.lead}</p>
                    {c.id === "partial" && (
                      <div className="mb-3 space-y-2">
                        <Segmented
                          label="איך לחלק את התוצאה של 2022"
                          value={lin.split}
                          onChange={setSplit}
                          options={SPLITS.map((s) => ({ ...s, disabled: s.id === "crowd" && !crowd }))}
                        />
                        <p className="text-sm">החלוקה: {splitNote}.</p>
                        {lin.split === "manual" && shared.map((l) => (
                          <fieldset key={l} className="rounded-theme border border-paper-line p-3">
                            <legend className="text-sm font-bold px-1">{k25ListName(l)} — איך להתחלק (באחוזים)</legend>
                            <div className="flex flex-wrap gap-3">
                              {heirs(effective)[l].map((id) => (
                                <label key={id} className="text-sm flex items-center gap-2">
                                  {listName(id)}
                                  <input type="number" inputMode="decimal" min={0} max={100} step={0.1} value={lin.manual[l]?.[id] ?? 0} onChange={(e) => setManual(l, id, Number(e.target.value))} className="w-20 min-h-[44px] border border-paper-line rounded-theme px-2 tabular bg-paper-card" />
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ))}
                        {problem && <p role="alert" className="text-sm text-warn font-bold">{problem}</p>}
                      </div>
                    )}
                    {c.id !== "none" && (
                      <>
                        <ChartWithTable
                          asTable={asTable}
                          chart={
                            <DumbbellChart
                              rows={list.map(toRow)}
                              unit={unit}
                              legend={false}
                              onName={toggle}
                              openId={open}
                              below={(id) => { const r = list.find((x) => x.id === id); return r ? editor(r) : null; }}
                            />
                          }
                          table={table(list)}
                        />
                        {asTable && editorOf(list)}
                      </>
                    )}
                    {c.id === "none" && (
                      <>
                        <div className="flex flex-wrap gap-2">{list.map((r) => <span key={r.id}>{nameButton(r)}</span>)}</div>
                        {editorOf(list)}
                      </>
                    )}
                  </section>
                );
              })}
              <p className="text-sm text-ink-soft mt-4">
                לא שויך מ-2022: {r1(unassigned2022.share)}% מהקולות ({[...unassigned2022.lists.map(k25ListName), unassigned2022.others ? `${unassigned2022.others} רשימות קטנות` : ""].filter(Boolean).join(", ")}).
              </p>
            </Explained>

            <Fold title="הסברים">
              <div className="space-y-4 text-sm leading-relaxed">
                <div>
                  <h3 className="font-bold mb-1">איך מחלקים פיצול</h3>
                  <p>כשרשימה של 2022 התפצלה, התוצאה שלה מתחלקת בין הרשימות של היום לפי היחס ביניהן בסקרים. למשל: 14 מנדטים, ובסקרים היום 2, 4 ו-6 — החלוקה היא בערך 2.3, 4.7 ו-7. אפשר לבחור חלוקה לפי המשתתפים או חלוקה ידנית.</p>
                </div>
                <div>
                  <h3 className="font-bold mb-1">השיוך שלכם</h3>
                  <p>שם המפלגה (בגרף, בטבלה וב"אין שיוך") הוא כפתור שקובע מאיזו רשימה של 2022 היא באה. השיוך נשמר בחשבון שלכם (או בדפדפן, בלי חשבון), ומשמש גם את הטור "בחירות 22" ב<Link to="/guess">הכנסת שלי</Link> ואת הגושים. הוא לא משנה את הסטטיסטיקות של האתר. הרכב הגושים עצמו נערך בכפתור "עריכת הגושים".</p>
                </div>
                <div>
                  <h3 className="font-bold mb-1">למה כך שויך</h3>
                  <ul className="space-y-1.5">
                    {rows.map((r) => <li key={r.id}><span className="font-bold">{listName(r.id)}:</span> {why(r.id, lin)}</li>)}
                  </ul>
                </div>
                <div>
                  <h3 className="font-bold mb-1">מה אי אפשר ללמוד מכאן</h3>
                  <ul className="list-disc ps-5 space-y-1.5">
                    <li>מי עבר לאן. מפלגה שירדה בשתי נקודות יכלה לאבד עשר ולקבל שמונה — רואים רק את ההפרש.</li>
                    <li>חלוקה של פיצול היא הערכה, לא תוצאה. לכן היא מסומנת "~".</li>
                    <li>"היום" הוא ממוצע סקרים, לא תוצאה. ראו <Link to="/past?tab=accuracy">דיוק הסקרים</Link> ו<Link to="/today?tab=scenarios">תרחישים</Link>.</li>
                    <li>באחוזים מושווים אחוזי קולות, לא מספרי קולות: ב-2026 יש יותר בעלי זכות בחירה.</li>
                  </ul>
                </div>
                <Note>השיוך המקורי כתוב בקובץ אחד בריפו (raw/lineage.json), עם נימוק לכל שורה. ב-2022 היו {num(VALID_2022)} קולות כשרים.</Note>
              </div>
            </Fold>
          </>
        }
      />
      {showBar && (
        <ActionBar above={<>
          {lineage.unit.error && <div className="bg-paper-card rounded-theme"><SaveError unit={lineage.unit} /></div>}
          {problem && <p role="status" className="bg-paper-card rounded-theme p-2 text-sm text-warn">{problem}</p>}
        </>}>
          <Btn onClick={lineage.reset} disabled={!lineage.custom}><ShortLabel short="איפוס" full="איפוס השיוך" /></Btn>
          <SaveButton unit={lineage.unit} session={session} invalid={problem} compact />
        </ActionBar>
      )}
    </>
  );
}

const sameKeys = (a: Record<string, number> | undefined, b: Record<string, number>) => !!a && Object.keys(a).sort().join() === Object.keys(b).sort().join();

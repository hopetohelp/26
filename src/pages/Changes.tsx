import SourcePicker from "../components/SourcePicker";
import { useSourcePreference } from "../lib/sourcePreference";
import { resolveDataset, resolveSupport, resolveSupportMetric, selectedPolls, type Selection } from "../lib/dataResolver";
import { DATA_PRODUCTS } from "../lib/dataCatalog";
import { useState } from "react";
import { Link } from "react-router-dom";
import PersonalBlocs from "../components/PersonalBlocs";
import Explained from "../components/Explained";
import DumbbellChart, { DUMBBELL_LEGEND, NameButton } from "../components/dumbbellChart";
import { ModelInfo } from "../components/InfoTip";
import { Segmented } from "../components/Choice";
import { ChartBar, ChartWithTable, Fold, Note, Split } from "../components/ui";
import modelFile from "../data/model.json";
import { MODEL_AVERAGE } from "../lib/sources";
import { pollSeatValues } from "../lib/pollRange";
import { listName } from "../lib/data";
import { diffText as diff, pollSegs, type DumbbellRow, type DumbbellUnit } from "../lib/dumbbell";
import { date, num, pctValue, rng, seatsFmt, signed } from "../lib/format";
import { DEFAULT_LINEAGE, heirs, K25_LISTS, k25ListName, lineageProblem, lineageRows, manualFromCurrent, sharedLists, VALID_2022, type Category, type Lineage, type LineageRow, type Split as SplitKind } from "../lib/lineage";
import SaveButton, { SaveError } from "./guess/SaveButton";
import { ActionBar, Btn, ShortLabel } from "./guess/ui";
import { useSession } from "./guess/useCrowd";
import { useCrowdSeats, useLineage } from "./guess/useLineage";

interface Family { id: string; k26: string[]; why: string }
interface ModelLite {
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
const share22 = (r: LineageRow) => `${approx(r)}${pctValue(r.share2022, 1)}`;

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
  const preference = useSourcePreference("changes");
  const [temporary, setTemporary] = useState<Selection | null>(null);
  const selection = temporary ?? preference.selection;
  const current = resolveDataset(selection, "changes");
  const currentShares = resolveSupport(selection).shares ?? {};
  const LATEST_POLLS = selectedPolls(selection);
  const definition = { ...DATA_PRODUCTS[selection.product], name: current.rows[0]?.label ?? DATA_PRODUCTS[selection.product].name };
  const history = lineageRows(effective, crowd);
  const unassigned2022 = history.unassigned2022;
  const rows = history.rows.map(r => ({ ...r, seatsNow: current.seats[r.id] ?? NaN, shareNow: currentShares[r.id] ?? NaN }));
  const [open, setOpen] = useState<string | null>(null);
  // רשימה של 2022 שלא שויכה: נפתחת בחירה לאיזו רשימה של היום היא נכנסה
  const [openOld, setOpenOld] = useState<string | null>(null);
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
  /**
   * טווח הסקרים סביב "היום" (הכרעת בעלים 12.10.2026, הכרעה 6): מהסקר הנמוך עד הגבוה, הסקר האחרון של כל סדרה ב-14 הימים האחרונים.
   * באחוזים — גבולות המנדטים מומרים לאחוזים לפי החוק, והטווח כולל את הממוצע, בדיוק כמו ב"הכנסת שלי" (`pollPctRange` ב-Seats.tsx).
   */
  const pollBand = (r: LineageRow): { range: [number, number] | null; segs: DumbbellRow["segs"] } => {
    const vals = pollSeatValues(LATEST_POLLS, [r.id]);
    if (!vals.length) return { range: null, segs: [] };
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (!pct) return { range: [lo, hi], segs: pollSegs(vals) };
    const support = resolveSupportMetric(selection, [r.id], "changes");
    return { range: support.range, segs: pollSegs(support.values ?? []) };
  };
  const toRow = (r: LineageRow): DumbbellRow => {
    const band = pollBand(r);
    return {
      id: r.id,
      name: listName(r.id),
      from: fromNames(r),
      approx: r.category === "partial",
      before: pct ? r.share2022 : r.seats2022,
      now: pct ? r.shareNow : r.seatsNow,
      segs: band.segs,
      range: band.range,
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

  // בתצוגת טבלה (שאין לה "מקרא") — אייקון מידע אחד בלבד, בטבלה הראשונה במסך, וחל על כל הטבלאות (הכרעת בעלים 12.10.2026)
  const firstTable = CATEGORIES.find((c) => c.id !== "none" && rows.some((r) => r.category === c.id))?.id;
  const table = (list: LineageRow[], first: boolean) => (
    <table className="w-full text-sm">
      <caption className="sr-only">2022 מול היום, לפי המפלגה, {pct ? "באחוזים" : "במנדטים"}</caption>
      <thead>
        <tr className="text-right border-b border-paper-line">
          <th scope="col" className="py-2 pe-3">היום</th>
          <th scope="col" className="pe-3">ב-2022</th>
          <th scope="col" className="pe-3">{pct ? "2022 %" : "2022 מנדטים"}</th>
          <th scope="col" className="pe-3">{pct ? "היום %" : "מנדטים היום"}{first && selection.product === "model.mean" && <> <ModelInfo kind="mean" items={[`העמודה "${pct ? "היום %" : "מנדטים היום"}" בכל הטבלאות במסך`]} /></>}</th>
          <th scope="col" className="pe-3">{pct ? "טווח הסקרים %" : "טווח הסקרים (מנדטים)"}</th>
          <th scope="col">{pct ? "שינוי (אחוזים)" : "שינוי (מנדטים)"}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => {
          const rg = pollBand(r).range;
          const d = pct ? r.shareNow - r.share2022 : r.seatsNow - Math.round(r.seats2022 * 10) / 10;
          return (
            <tr key={r.id} className="border-b border-paper-line/60">
              <th scope="row" className="py-1 pe-3 text-right font-medium">{nameButton(r)}</th>
              <td className="pe-3">{fromNames(r)}</td>
              <td className="pe-3 tabular">{pct ? share22(r) : seats22(r)}</td>
              <td className="pe-3 tabular">{pct ? pctValue(r.shareNow, 1) : r.seatsNow}</td>
              <td className="pe-3 tabular whitespace-nowrap">{rg ? (pct ? rng(pctValue(rg[0], 1), pctValue(rg[1], 1)) : rng(seatsFmt(rg[0]), seatsFmt(rg[1]))) : "—"}</td>
              <td className="tabular" dir="ltr">{pct ? diff(d) : signed(Math.round(d * 10) / 10)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const shared = sharedLists(effective);
  const splitNote = lin.split === "manual" ? "לפי החלוקה שלכם" : effective.split === "crowd" ? "לפי ממוצע המשתתפים (אינו סקר)" : `לפי ממוצע המודל (${date(MODEL_AVERAGE.asOf)})`;

  return (
    <>
      <SourcePicker screen="changes" selection={selection} onChange={setTemporary} notice={preference.notice} />
      <Split
        title="מה השתנה מהבחירות האחרונות"
        lead="כל מפלגה של היום מול התוצאה של 2022. מפלגה שנוצרה מפיצול מקבלת חלק מהתוצאה של הרשימה שממנה באה."
        primary={
          <>
            <ChartBar legend={DUMBBELL_LEGEND.map(e => e.kind === "mean" ? { ...e, text: definition.name } : e)} asTable={asTable} onAsTable={setAsTable}>
              <Segmented size="sm" label="יחידות" value={unit} onChange={setUnit} options={UNITS} className="w-36" />
            </ChartBar>
            <PersonalBlocs
                title="מעבר בין הגושים"
                source={`תוצאות 2022 לפי השיוך, מול ${definition.name}`}
                asOf={date(MODEL_AVERAGE.asOf)}
                compare
                unit={unit}
                datasets={[
                  { values: pct ? shares2022 : values2022, source: "2022 לפי השיוך", asOf: "תוצאות סופיות" },
                  { selection, values: pct ? currentShares : current.seats, source: definition.name, asOf: date(MODEL_AVERAGE.asOf) },
                ]}
              />
          </>
        }
        secondary={
          <>
            {!current.rows.some(r => r.status === "available") && <p role="status">—</p>}
            <Explained
              kind="השוואה"
              source={`תוצאות 2022 (ועדת הבחירות המרכזית) מול ${definition.name} — עד ${date(MODEL_AVERAGE.asOf)}`}
              asOf={`הסקרים עד ${date(MODEL_AVERAGE.asOf)}`}
              assumption="שינוי נטו בין שתי תמונות, לא מעבר בוחרים. בפיצול — התוצאה של 2022 מתחלקת לפי היחס בין הרשימות היום."
              methodAnchor="changes"
            >
              {CATEGORIES.map((c) => {
                const list = rows.filter((r) => r.category === c.id && Number.isFinite(pct ? r.shareNow : r.seatsNow));
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
                          table={table(list, c.id === firstTable)}
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
              <div className="mt-4 text-sm text-ink-soft">
                <p>לא שויך מ-2022: {pctValue(unassigned2022.share, 1)}% מהקולות{unassigned2022.others ? ` (כולל ${unassigned2022.others} רשימות קטנות)` : ""}.</p>
                {unassigned2022.lists.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {unassigned2022.lists.map((l) => (
                      <NameButton key={l} id={`old-${l}`} name={k25ListName(l)} open={openOld === l} onToggle={() => setOpenOld(openOld === l ? null : l)} />
                    ))}
                  </div>
                )}
                {openOld && unassigned2022.lists.includes(openOld) && (
                  <fieldset id={`lineage-old-${openOld}`} className="rounded-theme border border-paper-line p-3 mt-2 text-ink">
                    <legend className="text-sm font-bold px-1">{k25ListName(openOld)} נכנסה ל…</legend>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3">
                      {rows.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 min-h-[44px] text-sm">
                          <input type="checkbox" checked={r.from.includes(openOld)} onChange={(e) => setMap(r.id, e.target.checked ? [...r.from, openOld] : r.from.filter((x) => x !== openOld))} />
                          {listName(r.id)}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-ink-soft mt-1">אפשר לסמן כמה רשימות — התוצאה של 2022 תתחלק ביניהן.</p>
                    <Btn className="mt-2" onClick={() => setOpenOld(null)}>סיום</Btn>
                  </fieldset>
                )}
              </div>
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

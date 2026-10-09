import { results } from "../lib/data";
import PersonalBlocs, { usePersonalBlocs } from "../components/PersonalBlocs";
import { historicalBlocValues } from "../lib/personalBlocs";
import { DEFAULT_BLOCS, normalizeBlocs } from "./guess/model";
import { useEffect, useRef, useState } from "react";
import { call } from "../lib/crowdApi";
import { ensureSession, useSession } from "./guess/useCrowd";
import { Link } from "react-router-dom";
import Explained from "../components/Explained";
import { Card, ChartWithTable, Note, Split } from "../components/ui";
import modelFile from "../data/model.json";
import { listName } from "../lib/data";
import { colorOf } from "../lib/colors";
import { dateLong, num } from "../lib/format";

interface Family {
  id: string;
  k25: string[];
  k26: string[];
  why: string;
  votes2022: number;
  share2022: number;
  seats2022: number;
  shareNow: number;
  /** null: מחנה ששיניתם ידנית — לטווח התרחישים נדרש חישוב בצינור, ולכן אינו מוצג */
  shareRange: number[] | null;
  seatsNow: number;
  seatsRange: number[] | null;
}
interface Alternative {
  id: string;
  name: string;
  desc: string;
  families: Family[];
  unassigned2022: { lists: string[]; others: number; share: number };
  unassignedNow: { lists: string[]; share: number };
}
interface ModelLite {
  central: { seats: Record<string, number>; shares: Record<string, number> };
  asof: string;
  polls: number;
  changes: { election2022: string; valid2022: number; alternatives: Alternative[] };
}
const m = modelFile as unknown as ModelLite;
const ALTS = m.changes.alternatives;
const PARTY = ALTS.find((a) => a.id === "party")!;
const CAMP = ALTS.find((a) => a.id === "camp")!;

/** המחנות שלכם: לכל רשימה של היום — מחנה 2022 שאליו היא משויכת (או "" — בלי שיוך).
 *  נשמרים על המשתמש (POST /prefs, הכרעת בעלים 8.10.2026) ובדפדפן; בלי חשבון — בדפדפן בלבד. */
type CampMap = Record<string, string>;
const CAMPS_KEY = "elections26.camps";
const LISTS_NOW = Object.keys(m.central.shares);
const DEFAULT_CAMPS: CampMap = Object.fromEntries(LISTS_NOW.map((id) => [id, CAMP.families.find((f) => f.k26.includes(id))?.id ?? ""]));
function cleanCamps(saved: unknown): CampMap | null {
  if (!saved || typeof saved !== "object") return null;
  return { ...DEFAULT_CAMPS, ...Object.fromEntries(Object.entries(saved as CampMap).filter(([k, v]) => k in DEFAULT_CAMPS && (v === "" || CAMP.families.some((f) => f.id === v)))) };
}
function loadCamps(): CampMap {
  try {
    return cleanCamps(JSON.parse(localStorage.getItem(CAMPS_KEY) ?? "null")) ?? DEFAULT_CAMPS;
  } catch { /* דפדפן בלי אחסון — ברירת המחדל */ }
  return DEFAULT_CAMPS;
}
function saveCamps(c: CampMap) {
  try { localStorage.setItem(CAMPS_KEY, JSON.stringify(c)); } catch { /* לא נשמר — עדיין מוצג */ }
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const votes2022 = Object.fromEntries((results.find((r) => r.knesset === 25)?.lists ?? []).map((l) => [l.short, { votes: l.votes, seats: l.seats }]));

/** חלופת "לפי המחנה" לפי המחנות שלכם. 2022 — מתוצאות האמת; היום — ממוצע המודל. טווח התרחישים רק למחנה שלא שונה. */
function campAlternative(camps: CampMap): Alternative {
  const families = CAMP.families.map((f) => {
    const k26 = LISTS_NOW.filter((id) => camps[id] === f.id);
    const same = sameSet(k26, f.k26);
    const v = f.k25.reduce((t, n) => t + (votes2022[n]?.votes ?? 0), 0);
    return {
      ...f,
      k26,
      why: same ? f.why : "שיוך ששיניתם ידנית.",
      votes2022: v,
      share2022: (v / m.changes.valid2022) * 100,
      seats2022: f.k25.reduce((t, n) => t + (votes2022[n]?.seats ?? 0), 0),
      shareNow: k26.reduce((t, id) => t + (m.central.shares[id] ?? 0), 0),
      seatsNow: k26.reduce((t, id) => t + (m.central.seats[id] ?? 0), 0),
      shareRange: same ? f.shareRange : null,
      seatsRange: same ? f.seatsRange : null,
    };
  });
  const free = LISTS_NOW.filter((id) => !camps[id]);
  return {
    ...CAMP,
    desc: "כל רשימה של היום מושווית למחנה שממנו באה ב-2022. ברירת המחדל: כמו לפי המפלגה, אבל המחנה הממלכתי מושווה לכחול לבן ולישר! יחד, כי גדי איזנקוט התמודד ב-2022 ברשימת המחנה הממלכתי. אפשר לשנות את המחנות, והשינוי נשמר בחשבון שלכם (או בדפדפן, בלי חשבון).",
    families,
    unassignedNow: { lists: free, share: Math.max(0, 100 - families.reduce((t, f) => t + f.shareNow, 0)) },
  };
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("he-IL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const diff = (x: number) => {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? "0.0" : `${v > 0 ? "+" : "−"}${r1(Math.abs(v))}`;
};
const names26 = (ids: string[]) => ids.map(listName).join(" + ");

/** שורה אחת: 2022 מול היום, על אותו סרגל. כיוון השינוי מסומן בסימן בלבד — אותו צבע לעלייה ולירידה (ניטרליות). */
function FamilyRow({ f, max }: { f: Family; max: number }) {
  const w = (x: number) => `${(Math.min(x, max) / max) * 100}%`;
  const d = f.shareNow - f.share2022;
  return (
    <li className="py-3 border-t border-paper-line first:border-t-0">
      <p className="sr-only">
        {`${names26(f.k26)}, לעומת ${f.k25.join(" ו")} ב-2022: ${r1(f.share2022)}% מהקולות הכשרים ב-2022; היום ${r1(f.shareNow)}% לפי הממוצע${f.shareRange ? `, ובין ${r1(f.shareRange[0])}% ל-${r1(f.shareRange[2])}% ב-80% מהתרחישים` : ""}. שינוי נטו: ${diff(d)} נקודות אחוז.`}
      </p>
      <div aria-hidden="true" className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-bold text-base flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(f.k26[0]) }} />
          {names26(f.k26)}
        </span>
        <span className="font-display text-2xl leading-none">
          <span className="tabular" dir="ltr">{diff(d)}</span>
          <span className="text-sm font-sans text-ink-soft"> נק'</span>
        </span>
      </div>
      <p aria-hidden="true" className="text-xs text-ink-soft mb-1.5">2022: {f.k25.join(" + ")}</p>
      <div aria-hidden="true" className="grid grid-cols-[3.2rem_1fr_3rem] items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-ink-soft">2022</span>
        <span className="relative h-2.5 bg-paper rounded-sm">
          <span className="absolute inset-y-0 right-0 rounded-sm bg-ink-faint/60" style={{ width: w(f.share2022) }} />
        </span>
        <span className="tabular text-left">{r1(f.share2022)}%</span>
        <span className="text-ink-soft">היום</span>
        <span className="relative h-2.5 bg-paper rounded-sm">
          {f.shareRange && <span className="absolute inset-y-0 rounded-sm bg-accent/25" style={{ right: w(f.shareRange[0]), width: `calc(${w(f.shareRange[2])} - ${w(f.shareRange[0])})` }} />}
          <span className="absolute inset-y-0 right-0 rounded-sm bg-accent" style={{ width: w(f.shareNow) }} />
        </span>
        <span className="tabular text-left font-bold">{r1(f.shareNow)}%</span>
      </div>
    </li>
  );
}

export default function Changes() {
  const personal = usePersonalBlocs();
  const blocs = personal.draft ? normalizeBlocs(personal.draft).blocs : DEFAULT_BLOCS.blocs;
  // שלוש דרכים (הכרעת בעלים 8.10.2026): הגושים שלי · לפי המפלגה · לפי המחנה (המחנות ניתנים לשינוי ידני ונשמרים)
  const [view, setView] = useState<"blocs" | "party" | "camp">("blocs");
  const session = useSession();
  const [camps, setCampsState] = useState<CampMap>(loadCamps);
  const [editing, setEditing] = useState(false);
  // מחנות שנשמרו על המשתמש גוברים על הדפדפן
  const accountCamps = session.me?.prefs?.camps;
  useEffect(() => {
    const c = cleanCamps(accountCamps);
    if (c) (setCampsState(c), saveCamps(c));
  }, [accountCamps]);
  // שמירה בחשבון — מיד (0.3 שנייה לאיחוד שינויים רצופים)
  const timer = useRef<number>();
  const [campsError, setCampsError] = useState(false);
  const setCamps = (c: CampMap) => {
    setCampsState(c);
    saveCamps(c);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void ensureSession().then((token) => { if (token) void call("/prefs", { token, body: { camps: c } }).then(() => setCampsError(false), () => setCampsError(true)); });
    }, 300);
  };
  const campAlt = campAlternative(camps);
  const alt = view === "party" ? PARTY : campAlt;
  const customized = LISTS_NOW.some((id) => camps[id] !== DEFAULT_CAMPS[id]);
  const max = Math.max(25, ...alt.families.flatMap((f) => [f.share2022, f.shareRange?.[2] ?? f.shareNow]));
  const u22 = alt.unassigned2022;
  const unow = alt.unassignedNow;
  const previous = results.find(r => r.knesset === 25)!;
  const historical = historicalBlocValues(blocs, alt.families, Object.fromEntries(previous.lists.map(l => [l.short, l.seats])));

  return (
    <>
      <Split title="מה השתנה מהבחירות האחרונות" lead="השוואת הגושים שלכם או משפחות המפלגות לבחירות קודמות. כרגע ההשוואה היא לתוצאות 2022 מול ממוצע הסקרים היום. בהרכבים שהתפצלו או התאחדו בוחרים דרך שיוך מפורשת." primary={<>
      <div className="bg-accent-soft text-ink rounded-theme p-3 mb-3 space-y-2">
        <p className="font-bold">אפשר לשנות את הרכב המחנות</p>
        <p className="text-sm">בחרו לאיזה מחנה לשייך כל מפלגה. השינוי מעדכן גם את השוואת הגושים שלכם.</p>
        <button type="button" aria-expanded={editing && view !== "party"} onClick={() => { if (view === "party") { setView("camp"); setEditing(true); } else setEditing(e => !e); }} className="min-h-[44px] px-4 rounded-full text-sm font-bold border border-ink bg-paper-card">
          {editing && view !== "party" ? "סגירת עריכת המחנות" : customized ? "עריכת הרכב המחנות (שונה)" : "עריכת הרכב המחנות"}
        </button>
      </div>
      <div role="radiogroup" aria-label="השוואה לפי" className="flex flex-wrap gap-2 mb-3">
        {([["blocs", "לפי הגושים שלי"], ["party", "לפי המפלגה"], ["camp", "לפי המחנה"]] as const).map(([id, name]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={view === id}
            onClick={() => setView(id)}
            className={`min-h-[44px] px-4 rounded-full text-sm font-bold border ${view === id ? "bg-ink text-paper-card border-ink" : "border-ink-faint"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="text-base leading-relaxed mb-3">
        {view === "blocs" ? "הגושים שלכם, 2022 מול היום. רשימות 2022 משויכות לפי המחנות (ראו \"לפי המחנה\")." : alt.desc}
      </p>

      </>} secondary={<>
      {editing && view !== "party" && (
        <Card title="המחנות שלי">
          <p className="text-sm text-ink-soft mb-3">לכל רשימה של היום — לאיזה מחנה של 2022 להשוות אותה. השינוי משמש גם בהשוואת הגושים, ו{session.token ? "נשמר בחשבון שלכם" : "בשינוי הראשון נוצר לכם קישור אישי, והשינוי נשמר בחשבון"}.</p>
          {campsError && <p role="alert" className="text-sm text-warn mb-2">השמירה בחשבון לא הצליחה כרגע. השינוי נשמר בדפדפן.</p>}
          <ul className="divide-y divide-paper-line">
            {LISTS_NOW.map((id) => (
              <li key={id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`camp-${id}`} className="font-bold">{listName(id)}</label>
                <select id={`camp-${id}`} value={camps[id]} onChange={(e) => setCamps({ ...camps, [id]: e.target.value })} className="border border-paper-line rounded px-2 py-1 min-h-[44px] max-w-full bg-paper-card">
                  {CAMP.families.map((f) => <option key={f.id} value={f.id}>2022: {f.k25.join(" + ")}</option>)}
                  <option value="">בלי שיוך</option>
                </select>
              </li>
            ))}
          </ul>
          {customized && (
            <button type="button" onClick={() => setCamps(DEFAULT_CAMPS)} className="mt-3 min-h-[44px] px-4 rounded-full text-sm font-bold border border-ink-faint">
              חזרה לברירת המחדל
            </button>
          )}
        </Card>
      )}
      {view === "blocs" && <PersonalBlocs title="הגושים שלי: תוצאות 2022 מול ממוצע הסקרים היום" source={`תוצאות 2022 מול המודל היום; שיוך ${alt.name}`} asOf={dateLong(m.asof)} compare datasets={[
        { rows: historical, source: "תוצאות 2022", asOf: "תוצאות סופיות" },
        { values: m.central.seats, source: "המנדטים היום לפי המודל", asOf: dateLong(m.asof) },
      ]} />}


      {view !== "blocs" && <Card title={`המשפחות — ${alt.name}`}>
        <Explained
          kind="השוואה"
          source={`תוצאות האמת של בחירות 2022 (ועדת הבחירות המרכזית) מול הממוצע מבוסס-המודל — ${m.polls} סקרים מאומתים עד ${dateLong(m.asof)}`}
          asOf={`הסקרים עד ${dateLong(m.asof)}`}
          assumption="שינוי נטו בין שתי תמונות: כמה אחוזים יש למשפחה היום לעומת 2022. זה לא מעבר בוחרים — אי אפשר לדעת מכאן מי עבר לאן."
          methodAnchor="changes"
        >
          <ChartWithTable
            summary="פס אפור: 2022 · פס כחול: היום לפי הממוצע · הרקע הבהיר: הטווח ב-80% מהתרחישים. המספר הגדול: השינוי בנקודות אחוז."
            chart={
              <ul aria-label="משפחות הרשימות, 2022 מול היום">
                {alt.families.map((f) => (
                  <FamilyRow key={f.id} f={f} max={max} />
                ))}
              </ul>
            }
            table={
              <table className="w-full text-sm">
                <caption className="sr-only">משפחות הרשימות: 2022 מול היום — {alt.name}</caption>
                <thead>
                  <tr className="text-right border-b border-paper-line">
                    <th scope="col" className="py-2 pe-3">היום</th>
                    <th scope="col" className="pe-3">ב-2022</th>
                    <th scope="col" className="pe-3">2022 %</th>
                    <th scope="col" className="pe-3">2022 מנדטים</th>
                    <th scope="col" className="pe-3">היום %</th>
                    <th scope="col" className="pe-3">טווח 80%</th>
                    <th scope="col" className="pe-3">מנדטים היום</th>
                    <th scope="col">שינוי (נק')</th>
                  </tr>
                </thead>
                <tbody>
                  {alt.families.map((f) => (
                    <tr key={f.id} className="border-b border-paper-line/60">
                      <th scope="row" className="py-2 pe-3 text-right font-medium">{names26(f.k26)}</th>
                      <td className="pe-3">{f.k25.join(" + ")}</td>
                      <td className="pe-3 tabular">{r1(f.share2022)}</td>
                      <td className="pe-3 tabular">{f.seats2022}</td>
                      <td className="pe-3 tabular">{r1(f.shareNow)}</td>
                      <td className="pe-3 tabular whitespace-nowrap">{f.shareRange ? `${r1(f.shareRange[0])}–${r1(f.shareRange[2])}` : "—"}</td>
                      <td className="pe-3 tabular whitespace-nowrap">{f.seatsNow}{f.seatsRange ? ` (${f.seatsRange[0]}–${f.seatsRange[2]})` : ""}</td>
                      <td className="tabular" dir="ltr">{diff(f.shareNow - f.share2022)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-2 pe-3 text-right font-medium">לא משויך</th>
                    <td className="pe-3">{[...u22.lists, u22.others ? `${u22.others} רשימות קטנות` : ""].filter(Boolean).join(", ")}</td>
                    <td className="pe-3 tabular">{r1(u22.share)}</td>
                    <td className="pe-3">—</td>
                    <td className="pe-3 tabular">{r1(unow.share)}</td>
                    <td className="pe-3">—</td>
                    <td className="pe-3">—</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            }
          />
        </Explained>
      </Card>}

      <Note>רשימת עבר נספרת פעם אחת בכל גוש. אם הגוש כולל רק חלק ממשפחה שהתפצלה, או מפלגה ללא שיוך בחלופה שנבחרה, אין השוואה מספרית מלאה. זו השוואת הרכבים לפי ההנחות הגלויות, ולא מדידה של מעבר בוחרים.</Note>

      {view !== "blocs" && <Card title="לא משויך">
        <div className="grid sm:grid-cols-2 gap-4 [&>*]:min-w-0">
          <div>
            <p className="font-display text-4xl leading-none tabular">{r1(u22.share)}%</p>
            <p className="text-sm text-ink-soft mt-1">מהקולות ב-2022 לא שויכו לאף משפחה</p>
            <p className="text-sm mt-2">
              {[...u22.lists, u22.others ? `ועוד ${u22.others} רשימות שקיבלו פחות מ-1%` : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div>
            <p className="font-display text-4xl leading-none tabular">{r1(unow.share)}%</p>
            <p className="text-sm text-ink-soft mt-1">מהקולות היום, לפי הממוצע, הולכים לרשימות שלא שויכו</p>
            <p className="text-sm mt-2">{[...unow.lists.map(listName), "רשימות שאינן בסקרים"].join(" · ")}</p>
          </div>
        </div>
        <Note>כל עמודה מסתכמת ב-100%: המשפחות ועוד מה שלא שויך.</Note>
      </Card>}

      <Card title="למה כך שויך">
        <ul className="space-y-2 text-sm leading-relaxed">
          {alt.families.map((f) => (
            <li key={f.id}>
              <span className="font-bold">{names26(f.k26)}:</span> {f.why}
            </li>
          ))}
        </ul>
        <Note>
          השיוך כתוב בקובץ אחד בריפו (raw/lineage.json), עם נימוק לכל שורה. ב-2022 היו {num(m.changes.valid2022)} קולות כשרים.
        </Note>
      </Card>

      <Card title="מה אי אפשר ללמוד מכאן">
        <ul className="list-disc ps-5 space-y-1.5 text-sm leading-relaxed">
          <li>מי עבר לאן. משפחה שירדה בשתי נקודות יכלה לאבד עשר ולקבל שמונה — ההשוואה רואה רק את ההפרש.</li>
          <li>השוואה מדויקת לרשימה שהשתנתה. כשרשימה צירפה רכיב חדש, חלק מהשינוי הוא הרכיב עצמו.</li>
          <li>
            "היום" הוא ממוצע סקרים, לא תוצאה. סקרים טעו בעבר בכמה נקודות — ראו <Link to="/past?tab=accuracy">דיוק הסקרים</Link> ו
            <Link to="/today?tab=scenarios">תרחישים</Link>.
          </li>
          <li>ב-2026 יש יותר בעלי זכות בחירה, ושיעור ההצבעה עשוי להשתנות. כאן משווים אחוזים, לא מספרי קולות.</li>
        </ul>
      </Card>
      </>} />
    </>
  );
}

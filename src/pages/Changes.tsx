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
import { Segmented } from "../components/Choice";
import modelFile from "../data/model.json";
import { listName } from "../lib/data";
import DumbbellChart from "../components/dumbbellChart";
import { diffText as diff, r1, type DumbbellRow } from "../lib/dumbbell";
import { dateLong, num, rng } from "../lib/format";

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

const names26 = (ids: string[]) => ids.map(listName).join(" + ");

const toRow = (f: Family): DumbbellRow => ({
  id: f.id,
  name: names26(f.k26),
  from: f.k25.join(" + "),
  before: f.share2022,
  now: f.shareNow,
  range: f.shareRange ? [f.shareRange[0], f.shareRange[2]] : null,
});

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
      <Segmented
        label="השוואה לפי"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[{ id: "blocs", label: "לפי הגושים שלי" }, { id: "party", label: "לפי המפלגה" }, { id: "camp", label: "לפי המחנה" }]}
      />
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
          source={`תוצאות האמת של בחירות 2022 (ועדת הבחירות המרכזית) מול הממוצע מבוסס-המודל — ${m.polls} סקרים עד ${dateLong(m.asof)}`}
          asOf={`הסקרים עד ${dateLong(m.asof)}`}
          assumption="שינוי נטו בין שתי תמונות: כמה אחוזים יש למשפחה היום לעומת 2022. זה לא מעבר בוחרים — אי אפשר לדעת מכאן מי עבר לאן."
          methodAnchor="changes"
        >
          <ChartWithTable
            summary="טבעת: 2022 · נקודה: היום לפי הממוצע · הרקע הבהיר: הטווח ב-80% מהתרחישים. המספר מימין: השינוי בנקודות אחוז."
            chart={<DumbbellChart rows={alt.families.map(toRow)} />}
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
                      <td className="pe-3 tabular whitespace-nowrap">{f.shareRange ? rng(r1(f.shareRange[0]), r1(f.shareRange[2])) : "—"}</td>
                      <td className="pe-3 tabular whitespace-nowrap">{f.seatsNow}{f.seatsRange ? ` (${rng(f.seatsRange[0], f.seatsRange[2])})` : ""}</td>
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

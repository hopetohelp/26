import { useState } from "react";
import SourcePicker from "../components/SourcePicker";
import { useSourcePreference } from "../lib/sourcePreference";
import { resolveData, resolveDataset, type Selection } from "../lib/dataResolver";
import { defaultBlocs } from "./guess/model";
import { DATA_PRODUCTS } from "../lib/dataCatalog";
import { seatsFmt } from "../lib/format";
import { Link } from "react-router-dom";
import { ScreenLegend } from "../components/ChartLegend";
import { Duel, ThresholdLine } from "../components/Duel";
import ExitPollClock from "../components/ExitPollClock";
import InstallApp from "../components/InstallApp";
import { ModelInfo } from "../components/InfoTip";
import { GovTrend, Hemicycle, MAJORITY } from "../components/homeCharts";
import { date } from "../lib/format";
import { GOV_POINTS, HOME, LATEST_POLLS } from "../lib/homeData";
import { MODEL_AVERAGE } from "../lib/sources";

/**
 * מסך הבית (הכרעת בעלים 11.10.2026), לפי הסדר: כותרת "תמונת מצב" עם התאריך של היום; לוח 120 המושבים עם "הממשלה היוצאת" בצד;
 * דו-קרב שתי הרשימות הגדולות; על קו החסימה (זו לצד זו); פעולה אחת "הכנסת שלי"; ובתחתית מגמת הממשלה היוצאת והכפתור "הכנסת שלי".
 * בכל המסך אין שורת סוג/תאריך/"איך זה חושב?" (`Explained bare`). הדירוג המלא — בלשונית "תרחישים".
 * מנדטי הממשלה היוצאת: סכום הממוצעים של הרשימות, אותו מספר בלוח, במגמה ובתרחישים (החלטה 14).
 * נתוני מודל (הכרעות בעלים 12.10.2026): אייקון מידע אחד לכל סוג — ממוצע המודל בחצי העיגול (חל גם על הדו-קרב), ושיעור התרחישים ליד הרשימה
 * הראשונה ב"על קו החסימה" (חל על כולן). בגרף המגמה, שיש לו "מקרא", ההסבר בתוך המקרא ולא באייקון. "על קו החסימה" לפי הסקרים האחרונים בלבד.
 */
const home = HOME;

export default function Home() {
  const preference = useSourcePreference("home");
  const [temporary, setTemporary] = useState<Selection | null>(null);
  const selection = temporary ?? preference.selection;
  const def = DATA_PRODUCTS[selection.product];
  const dataset = resolveDataset(selection, "home");
  const available = dataset.rows.some(r => r.status === "available");
  const definitions = defaultBlocs();
  const coalition = resolveData(selection, definitions.find(b => b.id === "gov")!.lists, "home").value;
  const arab = resolveData(selection, definitions.find(b => b.id === "arab")!.lists, "home").value;
  const opposition = resolveData(selection, definitions.find(b => b.id === "rest")!.lists, "home").value;
  const blocs = { coalition: coalition ?? 0, arab: arab ?? 0, opposition: opposition ?? 0 };
  const [a, b] = [...home.safe, ...home.edge].filter(r => dataset.seats[r.id] !== undefined).map(r => ({ ...r, central: dataset.seats[r.id] })).sort((x, y) => y.central - x.central);
  const asOf = date(MODEL_AVERAGE.asOf);
  return (
    <>
      {/* במקום כותרת גלויה: שעון עצר עד מדגמי הבחירות, בתוך חלל הפרסה. הכותרת נשארת לקורא מסך */}
      <h1 className="sr-only">תמונת מצב</h1>
      <SourcePicker screen="home" selection={selection} onChange={setTemporary} notice={preference.notice} />
      <p className="sr-only">גוש נתניהו: {blocs.coalition} מנדטים, המפלגות הערביות: {blocs.arab}, גוש אייזנקוט: {blocs.opposition}. לרוב דרושים {MAJORITY}.</p>

      {available ? selection.product === "polls.mean" ? <section aria-label="סיכום הגושים" className="flex flex-wrap justify-center gap-6 my-6">{[["גוש נתניהו", coalition], ["מפלגות ערביות", arab], ["גוש אייזנקוט", opposition]].map(([name, value]) => <div key={String(name)} className="text-center"><p className="font-num text-3xl">{value === null ? "—" : seatsFmt(Number(value))}</p><p className="text-sm">{name}</p></div>)}</section> : <section aria-label="הממשלה היוצאת בכנסת" className="mt-6 w-full max-w-[32rem] mx-auto">
        <Hemicycle coalition={blocs.coalition} arab={blocs.arab} opposition={blocs.opposition} duel={["גוש נתניהו", "גוש אייזנקוט"]} footer={<ExitPollClock compact />} info={selection.product === "model.mean" ? <ModelInfo kind="mean" items={["המספרים במרכז חצי העיגול (גוש נתניהו וגוש אייזנקוט)", "המספר הגדול של כל רשימה בדו-קרב"]} /> : undefined} />
      </section> : <p role="status" className="text-center my-6 text-ink-soft">—</p>}

      <div className="mt-8">{a && b && <Duel a={a} b={b} polls={LATEST_POLLS} asOf={asOf} label={def.name} method={def.method} />}</div>
      <ThresholdLine rows={home.edge} polls={LATEST_POLLS} asOf={asOf} />


      <ScreenLegend><section aria-labelledby="home-trend" className="mt-10">
        <GovTrend home={home} points={GOV_POINTS} heading={<h2 id="home-trend" className="text-xl font-display leading-tight">מגמת הממשלה היוצאת — ממוצע המודל</h2>} />
      </section></ScreenLegend>
      <aside aria-labelledby="home-cta" className="mt-10 rounded-theme bg-band text-band-ink p-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h2 id="home-cta" className="text-2xl font-display leading-tight">כמה תקבל כל רשימה? תנחשו.</h2>
          <p className="mt-2 text-sm text-band-soft">השערות משתתפים, אינן סקר.</p>
        </div>
        <Link
          to="/guess"
          className="ms-auto inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-signal text-signal-ink font-extrabold no-underline hover:text-signal-ink"
        >
          לבנות את הכנסת שלי
        </Link>
      </aside>
      <InstallApp />
    </>
  );
}

import { Link } from "react-router-dom";
import forecastFile from "../data/forecast.json";
import modelFile from "../data/model.json";
import { Split } from "../components/ui";
import { listName, meta, polls, results, usablePolls } from "../lib/data";
import { dateLong, num } from "../lib/format";
import { PAGES } from "../lib/pages";

/** מסך הבית: ריבוע לכל עמוד — מה רואים בו, ונתון אחד ממנו. כל נתון מחושב מאותם קבצים שהעמוד עצמו מציג. */

interface ModelLite {
  asof: string;
  start: string;
  central: { seats: Record<string, number> };
  trend: { date: string; seats: Record<string, number> }[];
  scenarios: { bloc: { atLeast61: number } };
  changes: { alternatives: { families: unknown[] }[] };
}
const model = modelFile as unknown as ModelLite;
const fc = forecastFile as unknown as {
  horizon: number;
  variant: string;
  gate: { atHorizon: { valid: boolean; summary: Record<string, { voteAccuracy: number }> } };
  selection?: { summary: Record<string, { voteAccuracy: number }> } | null;
};
const pct = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString("he-IL")}%`;

/** השינוי הגדול ביותר במנדטים לפי הממוצע, מאז תחילת המגמה */
function biggestMove(): string {
  const first = model.trend[0]?.seats ?? {};
  const last = model.central.seats;
  let best = { id: "", d: 0 };
  for (const id of Object.keys(last)) {
    const d = (last[id] ?? 0) - (first[id] ?? 0);
    if (Math.abs(d) > Math.abs(best.d)) best = { id, d };
  }
  if (!best.id) return "בלי שינוי במנדטים מאז הגשת הרשימות";
  return `${listName(best.id)}: ${best.d > 0 ? "+" : "−"}${Math.abs(best.d)} מנדטים מאז הגשת הרשימות`;
}

function stat(to: string): { value: string; label: string } {
  const above = Object.values(model.central.seats).filter((s) => s > 0).length;
  const acc = fc.selection?.summary.baseline?.voteAccuracy;
  switch (to) {
    case "/today":
      return acc !== undefined
        ? { value: String(above), label: `רשימות מעל הסף לפי הממוצע · דיוק ממוצע הסקרים בעבר ${pct(acc)}` }
        : { value: String(above), label: "רשימות מעל אחוז החסימה לפי הממוצע" };
    case "/polls":
      return { value: num(polls.length), label: `סקרים בארכיון · ${biggestMove()}` };
    case "/changes":
      return { value: String(model.changes.alternatives[0]?.families.length ?? 0), label: "משפחות מפלגות, 2022 מול היום" };
    case "/guess":
      return { value: "120", label: "מושבים לחלק — בדרך שלכם" };
    case "/community":
      return { value: "", label: "ממוצע ההשערות · גושים · הצבעה" };
    case "/past":
      return { value: String(results.length), label: `מערכות בחירות · ${num(meta.historyPolls ?? 0)} סקרים מול התוצאות` };
    case "/method":
      return { value: num(usablePolls.filter((p) => p.verified).length), label: `סקרים שהושוו לפרסום המקורי · עדכון אחרון ${dateLong(meta.dataAsOf)}` };
    default:
      return { value: "", label: "" };
  }
}

export default function Home() {
  return (
    <>
      {/* הכותרת הגלויה היא הסרגל העליון ("בחירות 26" והתאריך) — כאן רק לקורא מסך */}
      <h1 className="sr-only">בחירות 26 — כל עמודי האתר</h1>
      <Split primary={<Link
        to="/guess"
        className="flex items-center justify-between gap-4 flex-wrap mb-5 bg-frame text-frame-ink border-2 border-frame rounded-theme p-4 md:p-5 no-underline hover:text-frame-ink"
      >
        <span>
          <span className="font-display text-4xl md:text-5xl leading-none block">כמה תקבל כל רשימה? תנחשו.</span>
          <span className="text-sm text-frame-soft block mt-1">מחלקים 120 מושבים, ומשווים למה שמנחשים כל השאר. השערות גולשים, אינן סקר.</span>
        </span>
        <span className="shrink-0 min-h-[48px] px-5 rounded-full bg-signal text-signal-ink font-extrabold inline-flex items-center">לבנות את הכנסת שלי</span>
      </Link>} secondary={<ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3 [&>*]:min-w-0" aria-label="כל העמודים באתר">
        {PAGES.filter(p => p.to !== "/guess").map((p) => {
          const s = stat(p.to);
          return (
            <li key={p.to}>
              <Link
                to={p.to}
                className="group flex flex-col h-full gap-2 bg-paper-card border border-paper-line rounded-theme p-4 no-underline text-ink hover:border-ink-faint focus-visible:border-ink-faint"
              >
                <span className="font-display text-3xl leading-none">{p.label}</span>
                <span className="text-sm text-ink-soft leading-relaxed">{p.desc}</span>
                <span className="mt-auto pt-2 border-t border-paper-line flex items-baseline gap-2 flex-wrap">
                  {s.value && <span className="font-display text-3xl leading-none tabular" dir="ltr">{s.value}</span>}
                  <span className="text-sm font-bold">{s.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>} />
    </>
  );
}

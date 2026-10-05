import { colorOf } from "../lib/colors";
import type { ThemeId } from "../lib/theme";

/** שורה אחת: מנדטים לפי הממוצע, טווח 80% של התרחישים, ושיעור התרחישים שבהם הרשימה עוברת את הסף */
export interface ListRow {
  id: string;
  name: string;
  central: number;
  lo: number;
  hi: number;
  /** 0–1 */
  pass: number;
}

const passPct = (p: number) => Math.round(p * 100);
const isEdge = (r: ListRow) => r.pass > 0.005 && r.pass < 0.995;
const isOut = (r: ListRow) => r.pass <= 0.005;
const range = (r: ListRow) => (r.hi > 0 ? `${r.lo}–${r.hi}` : "—");
const statusText = (r: ListRow) => (isOut(r) ? "מתחת לסף" : isEdge(r) ? `על הסף, עוברת ב-${passPct(r.pass)}%` : "עוברת");
const srRow = (r: ListRow) =>
  `${r.name}: ${r.central} מנדטים לפי הממוצע; ב-80% מהתרחישים ${r.hi > 0 ? `בין ${r.lo} ל-${r.hi}` : "אפס"}; ${statusText(r)}`;

/** שלוש תצוגות של אותם נתונים — אחת לכל עיצוב. אותו מידע בדיוק, כולל לקורא מסך. */
export default function ListsView({ rows, theme }: { rows: ListRow[]; theme: ThemeId }) {
  if (theme === "league") return <League rows={rows} />;
  if (theme === "boxes") return <Boxes rows={rows} />;
  return <Board rows={rows} />;
}

/* ---------- לוח המודיעין ---------- */
function Board({ rows }: { rows: ListRow[] }) {
  return (
    <div className="bg-frame text-frame-ink rounded-theme overflow-hidden" role="table" aria-label="הרשימות: מנדטים לפי הממוצע, טווח וסטטוס">
      <div role="row" className="grid grid-cols-[1fr_auto_4.2rem_minmax(6.5rem,auto)] md:grid-cols-[1fr_auto_6rem_12rem] gap-x-3 px-4 py-2 text-[11px] md:text-xs text-frame-soft">
        <span role="columnheader">רשימה</span>
        <span role="columnheader">מנדטים</span>
        <span role="columnheader">טווח</span>
        <span role="columnheader">סטטוס</span>
      </div>
      {rows.map((r, i) => {
        const out = isOut(r);
        const edge = isEdge(r);
        const digits = String(r.central).padStart(2, " ").split("");
        return (
          <div
            role="row"
            key={r.id}
            className={`grid grid-cols-[1fr_auto_4.2rem_minmax(6.5rem,auto)] md:grid-cols-[1fr_auto_6rem_12rem] gap-x-3 items-center px-4 py-2 border-t border-frame-line ${i % 2 ? "" : "bg-white/[.03]"}`}
          >
            <span role="cell" className={`font-medium text-[15px] md:text-base ${out ? "text-frame-soft/70" : ""}`}>
              {r.name}
            </span>
            <span role="cell" className="flex gap-0.5" dir="ltr">
              <span className="sr-only">{r.central}</span>
              {digits.map((d, k) => (
                <span
                  key={k}
                  aria-hidden="true"
                  className="flap w-6 h-8 md:w-7 md:h-9 rounded-[3px] flex items-center justify-center font-display text-[30px] md:text-[34px] leading-none"
                  style={{
                    animationDelay: `${i * 35 + k * 60}ms`,
                    color: out ? "rgb(var(--frame-soft) / .5)" : "rgb(var(--signal))",
                    background: "linear-gradient(#061727 49%, rgb(var(--frame)) 49%, rgb(var(--frame)) 51%, #061727 51%)",
                  }}
                >
                  {d === " " ? "" : d}
                </span>
              ))}
            </span>
            <span role="cell" className="text-[13px] md:text-sm text-frame-soft tabular">
              {range(r)}
            </span>
            <span role="cell" className={`text-[13px] md:text-sm font-bold flex items-center gap-1.5 ${out ? "text-frame-soft/70" : edge ? "text-signal" : "text-[#9FE0B8]"}`}>
              {edge && <span aria-hidden="true" className="w-2 h-2 rounded-full bg-signal shadow-[0_0_0_3px_rgb(var(--signal)/.25)]" />}
              <span aria-hidden="true">{out ? "מתחת לסף" : edge ? `על הסף ${passPct(r.pass)}%` : "עוברת"}</span>
              <span className="sr-only">{statusText(r)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- טבלת הליגה ---------- */
function League({ rows }: { rows: ListRow[] }) {
  const max = Math.max(30, ...rows.map((r) => r.hi));
  const w = (x: number) => `${(Math.min(x, max) / max) * 100}%`;
  const safe = rows.filter((r) => !isEdge(r) && !isOut(r));
  const rest = rows.filter((r) => isEdge(r) || isOut(r));
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex flex-col gap-1.5" aria-label="רשימות שעוברות את הסף כמעט בכל התרחישים">
        {safe.map((r, i) => (
          <li key={r.id} className="grid grid-cols-[1.4rem_1fr_minmax(5rem,9rem)_2.8rem] md:grid-cols-[2rem_14rem_1fr_3.5rem] items-center gap-2 bg-paper-card rounded-theme px-3 py-2.5">
            <span className="sr-only">{srRow(r)}</span>
            <span className="text-sm text-ink-faint tabular" aria-hidden="true">{i + 1}</span>
            <span className="font-bold text-base" aria-hidden="true">{r.name}</span>
            <span className="relative h-2 bg-paper rounded" aria-hidden="true">
              <span className="absolute inset-y-0 rounded bg-accent/25" style={{ right: w(r.lo), width: `calc(${w(r.hi)} - ${w(r.lo)})` }} />
              <span className="absolute -top-[3px] w-[3px] h-3.5 rounded bg-accent" style={{ right: w(r.central) }} />
            </span>
            <span className="font-display text-2xl text-left tabular" aria-hidden="true">{r.central}</span>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2 my-2" role="separator" aria-label="קו אחוז החסימה, 3.25%">
        <span className="flex-1 border-t-[3px] border-dashed border-signal" />
        <span className="font-extrabold text-sm text-warn">קו אחוז החסימה: 3.25%</span>
        <span className="flex-1 border-t-[3px] border-dashed border-signal" />
      </div>
      <ol className="flex flex-col gap-1.5" start={safe.length + 1} aria-label="רשימות על הסף ומתחת לו">
        {rest.map((r, i) => {
          const out = isOut(r);
          return (
            <li
              key={r.id}
              className={`grid grid-cols-[1.4rem_1fr_auto_2.8rem] md:grid-cols-[2rem_14rem_1fr_3.5rem] items-center gap-2 rounded-theme px-3 py-2.5 ${out ? "bg-paper-card/60" : "bg-warn-soft"}`}
              style={out ? undefined : { backgroundImage: "repeating-linear-gradient(135deg, rgb(var(--signal) / .08) 0 6px, transparent 6px 12px)" }}
            >
              <span className="sr-only">{srRow(r)}</span>
              <span className="text-sm text-ink-faint tabular" aria-hidden="true">{safe.length + i + 1}</span>
              <span className={`font-bold text-base ${out ? "text-ink-faint" : ""}`} aria-hidden="true">{r.name}</span>
              <span className={`text-sm font-bold ${out ? "text-ink-faint" : "text-warn"}`} aria-hidden="true">
                {out ? "כמעט באף תרחיש" : `עוברת ב-${passPct(r.pass)}%`}
              </span>
              <span className={`font-display text-2xl text-left tabular ${out ? "text-ink-faint" : ""}`} aria-hidden="true">{r.central}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- קיר הקופסאות ---------- */
function Boxes({ rows }: { rows: ListRow[] }) {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 [&>*]:min-w-0" aria-label="הרשימות: מנדטים לפי הממוצע וטווח התרחישים">
      {rows.map((r, i) => {
        const out = isOut(r);
        const edge = isEdge(r);
        const run: { v: number; on: boolean }[] = [];
        if (r.hi === 0) run.push({ v: 0, on: true });
        else {
          if (r.lo === 0) run.push({ v: 0, on: r.central === 0 });
          for (let s = r.lo === 0 ? 4 : r.lo; s <= r.hi; s++) run.push({ v: s, on: s === r.central });
        }
        return (
          <li key={r.id} className={`flex flex-col gap-2 rounded-theme px-3 pt-2.5 pb-3 shadow-[inset_0_-4px_0_rgba(0,0,0,.12)] ${out ? "bg-accent-soft" : "bg-paper-card"}`}>
            <span className="sr-only">{srRow(r)}</span>
            <span className="flex flex-wrap justify-between items-baseline gap-x-2 gap-y-1" aria-hidden="true">
              <span className="font-display text-[32px] leading-[0.95] flex items-center gap-2 min-w-0 break-words">
                <span className="w-3 h-3 rounded-full" style={{ background: colorOf(r.id, i) }} />
                {r.name}
              </span>
              {(edge || out) && <span className={`text-xs font-extrabold ${edge ? "text-warn" : "text-ink-faint"}`}>{out ? "מתחת לסף" : `עוברת ב-${passPct(r.pass)}%`}</span>}
            </span>
            <span className="flex flex-wrap gap-1 justify-end" dir="ltr" aria-hidden="true">
              {run.map((x) => (
                <span key={x.v} className={`font-num text-xs min-w-[1.6rem] text-center px-1 py-0.5 rounded-[3px] ${x.on ? "bg-ink text-paper-card font-extrabold" : "bg-accent-soft text-ink-faint"}`}>
                  {x.v}
                </span>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

import { useState } from "react";
import GroupSeriesChart, { bucketLabel, type SeriesBucket } from "./GroupSeriesChart";

/** נתון שאפשר להציג בחלון גרף: סך הכול, היום (אם ידוע) ונקודה מצטברת לכל שעה */
export interface ChartOption { key: string; label: string; total: number | null; today?: number | null; points: (number | null)[] | null }

const n = (v: number) => v.toLocaleString("he-IL");
const read = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]") as string[]; } catch { return []; } };

/**
 * שני חלונות גרף (הכרעת בעלים 28.10.2026): בטלפון אחד מעל השני, במחשב אחד ליד השני; בכל חלון בוחרים כל נתון.
 * הבחירה נזכרת בדפדפן הזה בלבד (storageKey). משותף למסך הניהול ולמסך ניהול הקבוצה.
 */
export default function StatsCharts({ buckets, options, defaults, storageKey }: { buckets: SeriesBucket[]; options: ChartOption[]; defaults: [string, string]; storageKey: string }) {
  const valid = (k: string | undefined, d: string) => (k && options.some((o) => o.key === k) ? k : d);
  const saved = read(storageKey);
  const [picked, setPicked] = useState<[string, string]>([valid(saved[0], defaults[0]), valid(saved[1], defaults[1])]);
  const pick = (i: 0 | 1, k: string) => {
    const next: [string, string] = i === 0 ? [k, picked[1]] : [picked[0], k];
    setPicked(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* בלי אחסון — הבחירה לביקור הזה */ }
  };
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {([0, 1] as const).map((i) => {
        const o = options.find((x) => x.key === picked[i]) ?? options[0];
        if (!o) return null;
        return (
          <section key={i} className="bg-paper-card border border-paper-line rounded-theme p-3 space-y-2 min-w-0" aria-label={`גרף ${i + 1}`}>
            <div className="flex items-start justify-between gap-3">
              <label className="min-w-0">
                <span className="sr-only">הנתון בגרף {i + 1}</span>
                <select value={o.key} onChange={(e) => pick(i, e.target.value)} className="max-w-full min-h-[44px] rounded-theme border border-paper-line bg-paper text-ink px-2 font-bold">
                  {options.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </label>
              <p className="text-end shrink-0">
                <span className="font-num tabular text-3xl leading-none">{o.total != null ? n(o.total) : "—"}</span>
                {o.today != null && <span className="block text-xs text-ink-soft font-num tabular">היום {n(o.today)}</span>}
              </p>
            </div>
            {o.points ? <GroupSeriesChart buckets={buckets} points={o.points} label={o.label} height={160} /> : <p className="text-sm text-ink-soft">אין עדיין גרף לנתון הזה.</p>}
          </section>
        );
      })}
      {buckets[0] && <p className="md:col-span-2 text-xs text-ink-soft">נקודה לכל שעה מ-{bucketLabel(buckets[0])} (שעון ישראל). "היום" = מחצות בשעון ישראל.</p>}
    </div>
  );
}

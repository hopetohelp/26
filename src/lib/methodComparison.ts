import type { Cycle, ElectionResult } from "./history";
import type { Poll } from "./data";
import { createDataProvider } from "./dataResolverCore";
interface HistoricalModel { cycle: string; asof: string; horizon: number; lists: Record<string, { central: number } | undefined> }
/** אותן פונקציות של המוצרים, רק עם הסקרים שהסתיימו עד מועד הבדיקה. */
export function compareMethods(cycles: Cycle[], results: ElectionResult[], modelRows: HistoricalModel[]) {
  return modelRows.flatMap(row => {
    const cycle = cycles.find(c => c.id === row.cycle);
    const official = results.find(r => r.id === row.cycle);
    if (!cycle || !official) return [];
    const polls: Poll[] = cycle.polls.filter(p => p.consistent && p.end <= row.asof && p.end < cycle.date).map(p => ({ ...p, firm: p.firmKey, publisher: p.publisherHe, gov: null, sample: null, eligibleToShow: true, verified: false, source: { page: cycle.source.page, tableLine: cycle.source.tableLine } }));
    const ids = [...new Set([...polls.flatMap(p => Object.keys(p.values)), ...official.lists.filter(l => l.seats > 0).map(l => l.letters)])].sort();
    const provider = createDataProvider({ polls, meta: { dataAsOf: row.asof, agreements2026: [] }, lists2026: ids.map(id => ({ id, name: official.lists.find(l => l.letters === id)?.short ?? id })), model: { asof: row.asof, lastPoll: polls.map(p => p.end).sort().slice(-1)[0] ?? row.asof, polls: polls.length, pollsters: new Set(polls.map(p => p.firm)).size, central: { seats: Object.fromEntries(ids.map(id => [id, row.lists[id]?.central ?? 0])), shares: {} } } });
    const actual = Object.fromEntries(ids.map(id => [id, official.lists.find(l => l.letters === id)?.seats ?? 0]));
    const products = Object.fromEntries((["polls.mean", "polls.adjusted", "model.mean"] as const).map(product => {
      const dataset = provider.resolveDataset({ product });
      const available = dataset.rows.every(r => r.status === "available");
      return [product, { status: available ? "available" : "missing", seats: dataset.seats, meanAbsoluteSeatError: available && ids.length ? ids.reduce((a, id) => a + Math.abs(dataset.seats[id] - actual[id]), 0) / ids.length : null }];
    }));
    return [{ cycle: cycle.id, label: cycle.label, asOf: row.asof, horizonDays: row.horizon, snapshotId: provider.SNAPSHOT_ID, inputRefs: provider.CURRENT_POLLS.map(p => p.id), latestFieldworkEnd: provider.CURRENT_POLLS.map(p => p.end).sort().slice(-1)[0] ?? null, actual, products, assumptions: ["המדד: ממוצע הפער המוחלט במנדטים, באותה קבוצת רשימות לכל שלוש השיטות", "ממוצע הסקרים והממוצע המותאם משתמשים בדיוק בספק של האתר", "ממוצע המודל הוא הרצת בדיקת העבר הקיימת, ללא שינוי פרמטרים", "לממוצע המותאם אין הסכמים פעילים בבדיקה: תאריכי פרסום ההסכמים ההיסטוריים אינם מתועדים בקלט; אין שימוש במידע עתידי"] }];
  });
}

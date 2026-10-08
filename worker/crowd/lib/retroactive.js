import { fixedTotals, migrateBlocs, personalTotals } from './blocDefinitions.js';
import { computeBlocs, latestByUnit } from './aggregate.js';

export function upgradeVersion(row, definition = null) {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  if (row.unit === 'seats') {
    if (!payload.seats || Object.values(payload.seats).reduce((sum, c) => sum + c.v, 0) !== 120) throw new Error(`אין חלוקת 120 תקינה בגרסה ${row.id}`);
    return { ...payload, fixedBlocSeats: fixedTotals(payload), personalBlocSeats: payload.personalBlocSeats ?? personalTotals(payload, definition) };
  }
  return row.unit === 'blocs' ? migrateBlocs(payload) : payload;
}

/** משחזרים לפי הגרסאות שעמדו בבסיס הפרסום עצמו, בלי להכניס השערות מאוחרות. */
export function upgradeAggregate(row, versions, participants) {
  if (!['blocs', 'dashboard'].includes(row.section) || !row.json) return row.json;
  const original = JSON.parse(row.json);
  const ids = row.section === 'blocs' ? new Set(JSON.parse(row.snapshot || '[]')) : null;
  const reviewed = new Set(participants.filter(p => p.review).map(p => p.id));
  const source = versions.filter(v => !reviewed.has(v.participant) && (ids ? ids.has(v.id) : v.created_at <= (original.sectionsAsOf?.blocs ?? row.published_at)));
  const latest = latestByUnit(source);
  const blocs = computeBlocs([...latest.seats.values()], [...latest.blocs.values()]);
  return JSON.stringify(row.section === 'blocs' ? blocs : { ...original, blocs });
}

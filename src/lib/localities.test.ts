import { expect, it } from 'vitest';
import data from '../data/localities.json';
import results from '../data/results.json';
import results2026 from '../../raw/results-2026.json';
import { queryLocalities, localityCsv, type LocalityElection } from './localities';
import history from '../data/history.json';
import { lastPollErrors, type Cycle } from './history';
it('2015 נשענת על התוצאה הרשמית העצמאית', () => {
  const e = results.find(e => e.id === 'k20')!;
  expect([e.eligible, e.voted, e.valid, e.invalid]).toEqual([5881696, 4254738, 4210884, 43854]);
  expect(e.lists.find(l => l.letters === 'מחל')).toMatchObject({ votes: 985408, seats: 30 });
});
it('כל קולות היישובים תואמים לתוצאה הארצית בכל מערכת', () => {
  for (const e of data.elections as LocalityElection[]) {
    // 2026: התוצאה הארצית ב-raw/results-2026.json (לפי מזהה רשימה) — נבדקת בבנייה (pipeline/ballots.py)
    const national = results.find(r => r.id === e.id) ?? { lists: [] };
    for (const l of national.lists) expect(e.rows.reduce((a, r) => a + (r.votes[l.letters] ?? 0), 0)).toBe(l.votes);
    expect(e.rows.some(r => r.external && r.name === 'מעטפות חיצוניות')).toBe(true);
    expect(e.source, e.id).toMatch(/^https:\/\//); // הקישור "המקור הרשמי" במסך
    expect(queryLocalities(e, 'ירושלים').rows.some(r => r.name === 'ירושלים')).toBe(true);
    expect(queryLocalities(e, '', 0, 1000).rows).toHaveLength(100);
    expect(localityCsv(e).split('\r\n')).toHaveLength(e.rows.length + 1);
  }
});
it('2026 מקובץ הקלפיות: הכשרים ובעלי הזכות כמו בתוצאה הרשמית, והמעטפות החיצוניות בנפרד', () => {
  const e = (data.elections as LocalityElection[]).find(e => e.id === 'k26')!;
  expect(e.rows.reduce((a, r) => a + r.valid, 0)).toBe(results2026.valid);
  expect(e.rows.reduce((a, r) => a + (r.votes['מחל'] ?? 0), 0)).toBe(results2026.votes.likud);
  expect(e.eligibleInLocalityFile).toBe(7331981);
  expect(e.rows.filter(r => r.external)).toHaveLength(1);
});
it('הטעות הגדולה בפרסום חדשות 2 האחרון ב-2015: הליכוד 22 מול 30, כלומר 6⅔ נקודות אחוז', () => {
  const c = history.cycles.find(c => c.id === 'k20') as Cycle;
  const rows = lastPollErrors(c, results.find(r => r.id === 'k20')!);
  const row = rows.find(r => r.pollId === 'k20-2015-03-13-0')!;
  expect(row.maxAbsPp).toBeCloseTo(8 / 120 * 100);
  expect(row.worstParties[0]).toMatchObject({ letters: 'מחל', estimate: 22, actual: 30 });
  expect(row.blocs.map(b => b.actual)).toEqual([67, 13, 40]);
  expect(row.blocs[0].diffPp).toBeCloseTo((59 - 67) / 120 * 100);
});

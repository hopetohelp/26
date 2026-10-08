// הרצה בפריסה לאחר אישור המיזוג בלבד. המקור נשמר במאגר הפרטי, לא בריפו.
import { upgradeVersion, upgradeAggregate } from './lib/retroactive.js';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('חסרים פרטי הגישה למאגר');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/a0564cb0-3bea-40e9-b5a9-e0dae54b6a86/query`;
async function query(sql, params = []) {
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }) });
  const body = await response.json();
  if (!response.ok || !body.success || body.result.some(r => !r.success)) throw new Error('שאילתת השחזור נכשלה');
  return body.result[0].results;
}
const versions = await query('SELECT id, participant, unit, created_at, payload FROM versions ORDER BY id');
const participants = await query('SELECT id, review FROM participants');
const aggregates = await query("SELECT * FROM aggregates WHERE section IN ('blocs','dashboard') ORDER BY id");
// קודם בודקים את כל הגרסאות; שגיאה עוצרת לפני כתיבה כלשהי.
const definitions = new Map();
const upgraded = versions.map(v => {
  const payload = upgradeVersion(v, definitions.get(v.participant) ?? null);
  if (v.unit === 'blocs') definitions.set(v.participant, payload);
  return { ...v, payload };
});
const summaries = aggregates.map(a => ({ ...a, upgraded: upgradeAggregate(a, upgraded, participants) }));
await query('CREATE TABLE IF NOT EXISTS bloc_migration_backup (kind TEXT NOT NULL, id INTEGER NOT NULL, original TEXT NOT NULL, migrated_at TEXT NOT NULL, PRIMARY KEY(kind,id))');
let changedVersions = 0;
for (let i = 0; i < versions.length; i++) {
  const before = versions[i];
  const after = JSON.stringify(upgraded[i].payload);
  if (before.payload === after) continue;
  await query("INSERT OR IGNORE INTO bloc_migration_backup(kind,id,original,migrated_at) SELECT 'version',id,payload,datetime('now') FROM versions WHERE id=? AND payload=?", [before.id, before.payload]);
  await query('UPDATE versions SET payload=? WHERE id=? AND payload=?', [after, before.id, before.payload]);
  changedVersions++;
}
for (const a of summaries) {
  if (a.json === a.upgraded) continue;
  await query("INSERT OR IGNORE INTO bloc_migration_backup(kind,id,original,migrated_at) SELECT 'aggregate',id,json,datetime('now') FROM aggregates WHERE id=? AND json=?", [a.id, a.json]);
  await query('UPDATE aggregates SET json=? WHERE id=? AND json=?', [a.upgraded, a.id, a.json]);
}
console.log(JSON.stringify({ checkedSeatVersions: versions.filter(v => v.unit === 'seats').length, changedVersions, checkedAggregates: summaries.length }));

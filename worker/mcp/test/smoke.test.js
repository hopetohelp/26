import { expect, it } from 'vitest';
import { checkMcpDeployment } from '../lib/smoke.js';
const base = 'https://mcp.example';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const run = (publicResponse, protectedResponse) => checkMcpDeployment(base, async url => url.endsWith('oauth-authorization-server') ? json({ issuer: base }) : url.endsWith('/public') ? publicResponse : protectedResponse);
it('בודק את כל תגובת הכלים בלי צינור שעלול להיסגר מוקדם', async () => {
  expect(await run(json({ result: { tools: [{ name: 'get_poll_average' }, { name: 'get_locality_results' }] } }))).toContain('זמינים');
});
it('סגירה מכוונת מחייבת את קוד הסגירה ובדיקת אימות תקינה', async () => {
  const disabled = () => json({ error: { data: { code: 'public_disabled' } } }, 403);
  expect(await run(disabled(), json({}, 401, { 'www-authenticate': 'Bearer' }))).toContain('סגורה בהגדרת');
  await expect(run(disabled(), json({}, 500))).rejects.toThrow('לא תקינה');
  await expect(run(json({ error: {} }, 403))).rejects.toThrow('אינם זמינים');
});
it('שרת שגוי, שגיאת שרת או גרסה חסרת כלי נכשלים', async () => {
  await expect(run(json({}, 500))).rejects.toThrow();
  await expect(run(json({ result: { tools: [{ name: 'get_poll_average' }] } }))).rejects.toThrow();
  await expect(checkMcpDeployment(base, async () => json({ issuer: 'https://wrong.example' }))).rejects.toThrow('אינו שייך');
});

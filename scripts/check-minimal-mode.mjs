/** בדיקת דפדפן ללא כתיבה לשירותים החיים. מופעלת מול בנייה מקומית או Preview. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.CHECK_URL || 'http://127.0.0.1:4173';
await mkdir('minimal-check', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [320, 390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    for (const path of ['/', '/guess', '/community']) {
      await page.goto(`${base}/#${path}`);
      await page.locator('[data-interface="simple"]').waitFor();
      await page.locator('table').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width} ${path}`);
      if (path === '/guess') {
        const input = page.getByRole('textbox', { name: /^מנדטים ל/ }).first();
        const save = page.getByRole('button', { name: 'שמירה', exact: true });
        await input.fill('119'); assert(await save.isDisabled());
        await input.fill('120'); assert(await save.isEnabled());
        await input.fill('121'); assert(await save.isDisabled());
        await input.fill('60'); await input.blur();
        await page.getByRole('switch', { name: /מתקדם/ }).click();
        await page.locator('[data-interface="advanced"]').waitFor();
        await page.getByRole('switch', { name: /מתקדם/ }).click();
        await page.locator('[data-interface="simple"]').waitFor();
        assert.equal(await input.inputValue(), '60');
        await page.reload(); assert.equal(await input.inputValue(), '60');
      }
      if (path === '/community') assert.equal(await page.locator('table').first().locator('thead th').count(), 3, 'אורח: שם מפלגה ושני טורי נתונים בלבד');
      await page.screenshot({ path: `minimal-check/${width}-${colorScheme}-${path.slice(1) || 'home'}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  // חברות ושמירה מול שרת מדומה בלבד: אין אסימון או כתיבה לחשבון אמיתי.
  // בלי קובץ השירות של האתר (public/sw.js): הוא היה מחזיר את העותק האמיתי של הנתונים ועוקף את השרת המדומה.
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
  await page.addInitScript(() => localStorage.setItem('elections26.crowd.token', 'test-session-only'));
  let member = true, below = false, saves = 0;
  const group = { id: 'gy7lelpbo', slug: 'hagzara', name: 'הגזרה', image: null };
  const dashboard = (value) => ({ participants: 12, open: true, publishedAt: '2026-10-23T09:00:00Z', blocs: { fixed: [] }, seats: { n: 12, full: [{ list: 'likud', mean: value }], polls: {}, everPassedLists: ['likud'] } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname.endsWith('/me')) return reply({ participant: 'test', latest: {}, verified: true, groups: member ? [group] : [] });
    if (url.pathname.endsWith('/save')) { saves++; return reply({ ok: true }); }
    if (url.pathname.endsWith('/dashboard') || url.pathname.endsWith('/dashboard.json')) {
      if (url.searchParams.has('group')) return member ? reply(below ? { group: group.id, belowMin: true, min: 5, participants: 2 } : { ...dashboard(17), group: group.id, min: 5 }) : reply({ error: 'forbidden' }, 403);
      return reply(dashboard(23));
    }
    if (url.hostname.endsWith('.workers.dev') || !['GET', 'HEAD'].includes(route.request().method())) return reply({});
    return route.continue();
  });
  await page.goto(`${base}/#/guess`);
  const input = page.getByRole('textbox', { name: /^מנדטים ל/ }).first();
  await input.fill('119'); await input.blur();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  assert.equal(saves, 0);
  await input.fill('120'); await input.blur();
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await page.getByRole('button', { name: 'נשמר', exact: true }).waitFor();
  assert.equal(saves, 1);
  await page.goto(`${base}/#/community`);
  await page.waitForFunction(() => document.querySelector('table thead tr')?.children.length === 4);
  const row = page.locator('table').first().locator('tbody tr').filter({ hasText: 'הליכוד' }).first();
  const lastTwo = async () => (await row.locator('td').allTextContents()).slice(-2).join(',');
  // נתוני הגזרה נטענים אחרי הטבלה: ממתינים לערך ולא קוראים מיד.
  for (let i = 0; i < 50 && await lastTwo() !== '23,17'; i++) await page.waitForTimeout(100);
  assert.equal(await lastTwo(), '23,17');
  await page.screenshot({ path: 'minimal-check/member.png', fullPage: true });
  below = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('נתוני הגזרה יוצגו אחרי', { exact: false }).waitFor();
  assert.equal(await row.locator('td').last().textContent(), '0');
  member = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('table thead tr')?.children.length === 3);
  await page.close();
  console.log('בדיקות מסך פשוט: ארבעה רוחבים, יום ולילה, 119/120/121 ושחזור טיוטה עברו.');
} finally { await browser.close(); }

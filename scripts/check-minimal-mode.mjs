/** בדיקת דפדפן לתצוגה הממוקדת, ללא כתיבה לשירותים החיים. מופעלת מול בנייה מקומית או Preview. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.CHECK_URL || 'http://127.0.0.1:4173';
await mkdir('minimal-check', { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const likudRow = page => page.locator('.f-row').filter({ hasText: 'הליכוד' }).first();
try {
  for (const width of [320, 390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    for (const path of ['/', '/guess', '/community']) {
      await page.goto(`${base}/#${path}`);
      await page.locator('[data-interface="simple"]').waitFor();
      await page.locator('.f-card').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width} ${path}`);
      assert.equal(await page.locator('main h1:not(.sr-only)').count(), 0, 'אין כותרת מסך גלויה');
      if (path === '/') assert(await page.locator('.f-row').count() > 5, 'גרף המפלגות');
      if (path === '/guess') {
        const input = page.getByRole('textbox', { name: /^מנדטים ל/ }).first();
        const save = page.getByRole('button', { name: 'שמירה', exact: true });
        await input.fill('119'); assert(await save.isDisabled());
        await input.fill('120'); assert(await save.isEnabled());
        await input.fill('121'); assert(await save.isDisabled());
        await input.fill('60'); await input.blur();
        await page.getByRole('button', { name: 'למחקר מתקדם' }).click();
        await page.locator('[data-interface="advanced"]').waitFor();
        await page.getByRole('button', { name: 'לתצוגה הממוקדת' }).click();
        await page.locator('[data-interface="simple"]').waitFor();
        assert.equal(await input.inputValue(), '60');
        await page.reload(); assert.equal(await input.inputValue(), '60');
      }
      if (path === '/community') await page.getByText('נפתחת אחרי שמירת הכנסת שלך').waitFor();
      await page.screenshot({ path: `minimal-check/${width}-${colorScheme}-${path.slice(1) || 'home'}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  // חברות ושמירה מול שרת מדומה בלבד: אין אסימון או כתיבה לחשבון אמיתי.
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
  await page.waitForFunction(() => document.documentElement.dataset.group === 'hagzara');
  const input = page.getByRole('textbox', { name: /^מנדטים ל/ }).first();
  await input.fill('119'); await input.blur();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  assert.equal(saves, 0);
  await input.fill('120'); await input.blur();
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await page.getByRole('dialog', { name: /נשמר/ }).waitFor();
  assert.equal(saves, 1);
  await page.screenshot({ path: 'minimal-check/share-mine.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'סגירה', exact: true }).click();
  await page.goto(`${base}/#/community`);
  const row = likudRow(page);
  // נתוני הגזרה נטענים אחרי המסך: ממתינים לערכים ולא קוראים מיד.
  for (let i = 0; i < 50 && !/23[\s\S]*17|17[\s\S]*23/.test(await row.innerText().catch(() => '')); i++) await page.waitForTimeout(100);
  const tags = await row.locator('.f-tag').allTextContents();
  assert(tags.includes('23') && tags.includes('17'), `תגיות: ${tags}`);
  assert.equal(await page.locator('.f-legend').first().getByText('ממוצע הסקרים').count(), 0, 'לגזרה אין קו ממוצע הסקרים');
  await page.screenshot({ path: 'minimal-check/member.png', fullPage: true });
  // בטלפון: פס הגושים בתחתית וסרגל הניווט מעליו; פתיחת המגירה לא מרחיבה את המסך
  const [dock, nav] = await Promise.all([page.locator('.f-dock.floating').boundingBox(), page.locator('.f-nav-bottom').boundingBox()]);
  assert(dock && nav && nav.y + nav.height <= dock.y + 1, 'הניווט מעל פס הגושים');
  for (let i = 0; i < 2; i++) {
    await page.locator('.f-side').getByRole('button').filter({ hasText: 'התפלגות המצביעים' }).first().click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'המגירה לא מרחיבה את המסך');
  }
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'המגירה לא מרחיבה את המסך');
  await page.getByRole('button', { name: 'שיתוף הכנסת הממוצעת' }).click();
  await page.getByRole('dialog').getByText('זו תחזית משתתפי הגזרה').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'סגירה', exact: true }).click();
  below = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('נתוני הגזרה יוצגו אחרי', { exact: false }).waitFor();
  member = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => !document.documentElement.dataset.group);
  await page.close();
  console.log('בדיקות התצוגה הממוקדת: ארבעה רוחבים, יום ולילה, 119/120/121, נעילה, שיתוף וגזרה עברו.');
} finally { await browser.close(); }

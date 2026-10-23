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
  console.log('בדיקות מסך פשוט: ארבעה רוחבים, יום ולילה, 119/120/121 ושחזור טיוטה עברו.');
} finally { await browser.close(); }

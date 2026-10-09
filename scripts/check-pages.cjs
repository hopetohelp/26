const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 5174, strictPort: true } });
  const browser = await chromium.launch({ executablePath: process.env.UI_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox'] });
  const base = 'http://127.0.0.1:5174/';
  try {
    const routes = ['/', '/today', '/today?tab=scenarios', '/polls', '/polls?tab=trends', '/changes', '/calculator', '/guess', '/guess?view=statistics', '/past', '/past?tab=accuracy', '/past?tab=voters', '/method', '/method?tab=about', '/support'];
    for (const theme of ['league']) for (const width of [360, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(theme => localStorage.setItem('elections26.theme', theme), theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of routes) {
        await page.goto(`${base}#${route}`);
        await (route === '/support' ? page.getByText('התמיכה תיפתח יחד עם השמירה באתר.', { exact: true }) : page.locator('main h1').first()).waitFor({ state: 'visible', timeout: 10000 }).catch(async error => { console.error({ route, errors, body: (await page.locator('body').innerText()).slice(0, 1500) }); throw error; });
        assert.equal(await page.getByRole('alert').filter({ hasText: 'המסך לא נטען' }).count(), 0, route);
        assert.equal(errors.length, 0, `${theme}/${width}/${route}: ${errors.join('; ')}`);
      }
      await page.goto(`${base}#/guess`);
      await page.getByRole('button', { name: 'סטטיסטיקות', exact: true }).click();
      await page.locator('#statistics').waitFor();
      await page.goto(`${base}#/polls`);
      await page.getByText('מקור משני', { exact: true }).first().waitFor();
      await page.locator('main button[aria-expanded]').first().click();
      await page.getByRole('link', { name: width < 768 ? 'מצב ותחזית' : 'המצב והתחזית', exact: true }).click();
      await page.locator('main h1').first().waitFor();
      assert.equal(errors.length, 0);
      await context.close();
      console.log(`כל המסכים והלשוניות עברו: ${theme}, רוחב ${width}`);
    }
    // תקלה ממשית בטעינת קובץ מסך: שומרת על הניווט ומאפשרת התאוששות.
    for (const theme of ['league']) for (const width of [360, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(theme => localStorage.setItem('elections26.theme', theme), theme);
      const page = await context.newPage();
      await page.route('**/assets/Scenarios-*.js', route => route.abort());
      await page.goto(`${base}#/today?tab=scenarios`);
      await page.getByRole('alert').waitFor();
      assert.equal(await page.getByRole('heading', { name: 'המסך לא נטען', exact: true }).count(), 1);
      await page.getByRole('link', { name: 'חזרה לבית', exact: true }).click();
      await page.locator('main h1').first().waitFor();
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.goto(`${base}#/today?tab=scenarios`);
      await page.getByRole('alert').waitFor();
      await page.unroute('**/assets/Scenarios-*.js');
      await page.getByRole('button', { name: 'רענון המסך', exact: true }).click();
      await page.getByRole('heading', { name: 'תחזית ותרחישים', exact: true }).waitFor();
      assert.equal(await page.getByRole('alert').count(), 0);
      await context.close();
      console.log(`התאוששות מכשל טעינה עברה: ${theme}, רוחב ${width}`);
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
})().catch(error => { console.error(error); process.exit(1); });

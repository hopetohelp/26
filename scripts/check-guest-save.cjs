// בדיקה בדפדפן אמיתי (Playwright): שמירה בלי משתמש, הוספת שם משתמש אחר כך, וכשל רשת עם בדיקת חיבור.
// בנייה: VITE_FEEDBACK_URL=https://feedback.example VITE_CROWD_URL=https://crowd.example npm run build && node scripts/check-guest-save.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const shots = process.env.UI_SCREENSHOT_DIR || '/tmp/elections26-guest-save';
fs.mkdirSync(shots, { recursive: true });
const cors = { 'access-control-allow-origin': '*' };
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 5176, strictPort: true } });
  const browser = await chromium.launch({ executablePath: process.env.UI_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  try {
    for (const theme of ['league']) for (const [width, dark] of [[360, false], [1280, true]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(({ theme, dark }) => {
        localStorage.setItem('elections26.theme', theme);
        localStorage.setItem('elections26.mode', dark ? 'dark' : 'light');
        localStorage.setItem('elections26.crowd.intro', '1');
      }, { theme, dark });
      const page = await context.newPage();
      const errors = [], calls = [], diag = [];
      page.on('pageerror', e => errors.push(e.message));
      let claimed = false;
      await context.route('https://feedback.example/**', async route => {
        const url = new URL(route.request().url()), path = url.pathname;
        if (path === '/diag') diag.push(route.request().postDataJSON().kind);
        if (path.startsWith('/crowd/')) {
          const p = path.slice(6);
          calls.push(`${route.request().method()} ${p}`);
          if (process.env.FAIL_NET === '1' || page.__failNet) return route.abort('failed');
          if (p === '/auth/guest') return route.fulfill({ headers: cors, json: { token: 'guest-token' } });
          if (p === '/save') return route.fulfill({ headers: cors, json: { version: { id: 1, unit: 'seats', created_at: '2026-10-08T10:00:00Z', payload: {} } } });
          if (p === '/me') return route.fulfill({ headers: cors, json: { participant: 'p', created_at: '2026-10-08', latest: {}, username: claimed ? 'דוגמה' : null, guest: !claimed, google: false } });
          if (p === '/auth/claim') { claimed = true; return route.fulfill({ headers: cors, json: { username: 'דוגמה', link: 'L'.repeat(30) } }); }
          return route.fulfill({ headers: cors, json: p === '/dashboard' ? { open: false, participants: 3 } : {} });
        }
        return route.fulfill({ headers: cors, json: { ok: true } });
      });
      await context.route('https://crowd.example/**', route => route.abort('failed'));

      await page.goto('http://127.0.0.1:5176/#/guess');
      await page.getByText('מממוצע הסקרים').first().click();
      await page.getByRole('button', { name: 'שמור', exact: true }).click();
      const sheet = page.getByRole('dialog');
      await sheet.getByRole('heading', { name: 'לשמור את ההשערה' }).waitFor();
      assert.ok(await sheet.getByText('מומלץ', { exact: true }).isVisible(), 'ההרשמה מסומנת כמומלצת');
      const guestBtn = sheet.getByRole('button', { name: 'שמירה בלי משתמש', exact: true });
      assert.ok(await guestBtn.isDisabled(), 'בלי הסכמה אי אפשר לשמור');
      assert.match(await sheet.innerText(), /לא ניתן יהיה לשחזר/, 'אזהרת אי-שחזור גלויה');
      assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'אין גלישה לרוחב');
      await page.screenshot({ path: `${shots}/sheet-${theme}-${width}-${dark ? 'dark' : 'light'}.png` });
      await sheet.getByRole('checkbox').check();
      await guestBtn.click();
      await page.getByRole('heading', { name: 'נשמרתם בלי משתמש' }).first().waitFor();
      assert.ok(calls.includes('POST /auth/guest') && calls.includes('POST /save'), 'אורח ושמירה בשרת');
      await page.screenshot({ path: `${shots}/guest-banner-${theme}-${width}-${dark ? 'dark' : 'light'}.png` });
      await page.getByText('הוספת שם משתמש', { exact: true }).first().click();
      await page.getByLabel('שם משתמש').first().fill('דוגמה');
      await page.getByLabel('סיסמה').first().fill('abc12x');
      await page.getByRole('button', { name: 'הוספת שם משתמש', exact: true }).click();
      await page.getByRole('heading', { name: /שמרו את הקישור האישי/ }).waitFor();
      assert.ok(calls.includes('POST /auth/claim'), 'נשלחה הוספת שם משתמש');

      // כשל רשת: הודעה + בדיקת חיבור שמסווגת "רק שרת ההערות עובד" ומדווחת מונה אנונימי
      const ctx2 = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx2.addInitScript(({ theme, dark }) => {
        localStorage.setItem('elections26.theme', theme); localStorage.setItem('elections26.mode', dark ? 'dark' : 'light'); localStorage.setItem('elections26.crowd.intro', '1');
      }, { theme, dark });
      const p2 = await ctx2.newPage();
      const diag2 = [], auto2 = [];
      await ctx2.route('https://feedback.example/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/diag') diag2.push(route.request().postDataJSON().kind);
        if (path === '/autoreport') auto2.push(route.request().postDataJSON().log);
        if (path.startsWith('/crowd/')) return route.abort('failed');
        return route.fulfill({ headers: cors, json: { ok: true } });
      });
      await ctx2.route('https://crowd.example/**', route => route.abort('failed'));
      await p2.goto('http://127.0.0.1:5176/#/guess');
      await p2.getByText('מממוצע הסקרים').first().click();
      await p2.getByRole('button', { name: 'שמור', exact: true }).click();
      const s2 = p2.getByRole('dialog');
      await s2.getByRole('checkbox').check();
      await s2.getByRole('button', { name: 'שמירה בלי משתמש', exact: true }).click();
      await s2.getByText(/החיבור לשרת השמירה חסום אצלכם/).waitFor();
      assert.ok(await s2.getByRole('button', { name: 'שליחת הערה עם לוג התקלה' }).isVisible(), 'אפשר לשלוח לוג');
      assert.deepEqual(diag2, ['feedback-only'], 'סיווג הכשל דווח כמונה');
      assert.equal(auto2.length, 1, 'כשל חיבור דווח אוטומטית פעם אחת');
      assert.ok(!auto2[0].includes('guest-token') && !/password/i.test(auto2[0]), 'הדיווח האוטומטי בלי פרטים אישיים');
      assert.match(await s2.innerText(), /דווחה אוטומטית לתמיכה/);
      await p2.screenshot({ path: `${shots}/network-fail-${theme}-${width}-${dark ? 'dark' : 'light'}.png` });
      await ctx2.close();
      assert.deepEqual(errors, [], 'אין שגיאות בדפדפן');
      await context.close();
    }
    console.log('guest-save: OK');
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });

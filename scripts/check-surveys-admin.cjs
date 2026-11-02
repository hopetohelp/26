// בדיקה בדפדפן (Playwright, שרת מדומה): מצב ניהול בסקר, סקר חדש עם שאלת טווח, מתג "הכול · סקרים · ניחושים", "פתוח עד", מסך AI.
// בנייה: VITE_FEEDBACK_URL=https://feedback.example VITE_CROWD_URL=https://crowd.example npm run build && node scripts/check-surveys-admin.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const shots = process.env.UI_SCREENSHOT_DIR || '/tmp/elections26-surveys-admin';
fs.mkdirSync(shots, { recursive: true });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
const closes = new Date(Date.now() + 3 * 864e5).toISOString();
const base = { group: 'g1', position: 0, updatedAt: '2026-11-01T10:00:00Z', visibility: 'now', minResults: 50, closesAt: null, manage: true, canAnswer: true, outside: 'none' };
const surveys = [
  { ...base, id: 'reelect', status: 'open', kind: 'survey', title: 'בחירות חוזרות?', closesAt: closes, questions: [{ id: 'q1', kind: 'single', title: 'יהיו בחירות חוזרות?', options: [{ id: 'yes', label: 'כן' }, { id: 'no', label: 'לא' }] }] },
  { ...base, id: 'turnout', status: 'open', kind: 'guess', title: 'ניחוש: אחוז הצבעה', questions: [{ id: 't', kind: 'range', title: 'אחוז ההצבעה', min: 60, max: 80, step: 1, minLabel: 'נמוך', maxLabel: 'גבוה' }] },
];
const stats = { views: 120, viewers: 80, embedViews: 30, saves: 40, savers: 35, changed: 5, members: 30, outsiders: 5, days: [{ day: '2026-11-01', views: 70, saves: 20 }, { day: '2026-11-02', views: 50, saves: 20 }] };
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 5177, strictPort: true } });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const report = [];
  try {
    for (const [width, dark] of [[390, false], [390, true], [1280, false], [1280, true]]) {
      const tag = `${width}-${dark ? 'dark' : 'light'}`;
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(({ dark }) => { localStorage.setItem('elections26.mode', dark ? 'dark' : 'light'); localStorage.setItem('elections26.crowd.token', 'tok'); localStorage.setItem('elections26.crowd.intro', '1'); }, { dark });
      const page = await context.newPage();
      const errors = [], posts = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const handler = async (route) => {
        const req = route.request(); const url = new URL(req.url()); const p = url.pathname.replace(/^\/crowd/, '');
        if (req.method() === 'OPTIONS') return route.fulfill({ headers: cors, body: '' });
        if (req.method() === 'POST') posts.push(p);
        const j = (json) => route.fulfill({ headers: cors, json });
        if (p === '/me') return j({ participant: 'p', created_at: '2026-10-01', latest: {}, username: 'מנהל', guest: false, google: true, managedGroups: [{ id: 'g1', name: 'הגזרה' }] });
        if (p === '/surveys') return j({ surveys });
        if (p === '/survey') { const s = surveys.find((x) => x.id === url.searchParams.get('id')); return s ? j({ survey: s, results: { all: { n: 3, min: 50, hidden: true }, group: { n: 3, min: 50, hidden: true } }, mine: null, access: { member: true, canAnswer: true, manage: true, outside: 'none' } }) : route.fulfill({ status: 404, headers: cors, json: { error: 'not_found' } }); }
        if (p === '/survey/stats') return j(stats);
        if (p === '/survey/manage') return j({ survey: surveys[0] });
        return j({ ok: true });
      };
      await context.route('https://feedback.example/**', handler);
      await context.route('https://crowd.example/**', handler);
      const noScroll = async (name) => {
        await page.waitForTimeout(400);
        assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `גלילה אופקית: ${name} ${tag}`);
        await page.screenshot({ path: `${shots}/${name}-${tag}.png`, fullPage: true });
      };
      // רשימה: מתג סוג ו"פתוח עד"
      await page.goto('http://127.0.0.1:5177/#/surveys');
      await page.getByText('בחירות חוזרות?').first().waitFor();
      const body = await page.innerText('main');
      assert.match(body, /פתוח עד/, '"פתוח עד" מופיע');
      for (const l of ['הכול', 'סקרים', 'ניחושים']) assert.ok(await page.getByRole('button', { name: l, exact: true }).count(), `מתג: ${l}`);
      await page.getByRole('button', { name: 'ניחושים', exact: true }).click();
      await page.waitForTimeout(200);
      assert.ok(!(await page.getByText('בחירות חוזרות?').count()), 'סינון ניחושים מסתיר סקר');
      assert.ok(await page.getByText('ניחוש: אחוז הצבעה').count(), 'סינון ניחושים משאיר ניחוש');
      await noScroll('list-guesses');
      // מצב ניהול
      await page.goto('http://127.0.0.1:5177/#/s/reelect?manage=1');
      await page.getByRole('button', { name: 'ניהול', exact: true }).waitFor();
      if ((await page.getByRole('button', { name: 'ניהול', exact: true }).getAttribute('aria-pressed')) !== 'true') await page.getByRole('button', { name: 'ניהול', exact: true }).click();
      await page.getByText('120').first().waitFor();
      await noScroll('manage');
      // טווח בסקר
      await page.goto('http://127.0.0.1:5177/#/s/turnout');
      await page.getByText('אחוז ההצבעה').first().waitFor();
      assert.ok(await page.locator('input[type=range]').count(), 'שאלת טווח מוצגת כמחוון');
      await noScroll('range');
      // סקר חדש עם שאלת טווח
      await page.goto('http://127.0.0.1:5177/#/surveys/manage');
      await page.getByRole('button', { name: /סקר חדש/ }).first().click();
      await page.getByRole('button', { name: '+ בחירה מטווח' }).click();
      assert.ok(await page.getByText(/בחירה מטווח/).count() >= 2, 'נוספה שאלת טווח');
      await noScroll('new-range');
      // AI
      await page.goto('http://127.0.0.1:5177/#/ai');
      await page.waitForTimeout(800);
      assert.ok((await page.innerText('main')).length > 400, 'הסבר נרחב במפתח אישי');
      await noScroll('ai-key');
      await page.getByText('צוות האתר', { exact: true }).first().click();
      await page.getByText('שיפור או שאלה').first().waitFor();
      await noScroll('ai-team');
      assert.deepEqual(errors, [], `שגיאות ${tag}`);
      report.push(`${tag}: תקין (POST: ${[...new Set(posts)].join(', ')})`);
      await context.close();
    }
    console.log(report.join('\n'));
  } finally { await browser.close(); server.httpServer.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

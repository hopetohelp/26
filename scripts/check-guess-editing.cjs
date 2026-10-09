const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const meta = require('../src/data/meta.json');
const ids = meta.lists2026.map(l => l.id);
const name = id => meta.lists2026.find(l => l.id === id).name;
const screenshots = process.env.UI_SCREENSHOT_DIR || '/tmp/elections26-guess-editing';
fs.mkdirSync(screenshots, { recursive: true });
const payload = (a, b, open = false) => ({ start: 'zero', pollsAsOf: null,
  seats: Object.fromEntries(ids.map(id => [id, { v: id === 'likud' ? a : id === 'shas' ? b : 0, src: 'manual', locked: !(id === 'shas' && open) }])) });
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 5175, strictPort: true } });
  const browser = await chromium.launch({ executablePath: process.env.UI_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  try {
    for (const theme of ['league']) for (const width of [360, 1280]) for (const dark of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(({theme,dark}) => {
        localStorage.setItem('elections26.theme',theme);
        localStorage.setItem('elections26.mode',dark ? 'dark' : 'light');
        localStorage.setItem('elections26.crowd.intro','1');
        localStorage.setItem('elections26.crowd.token','test-session');
      }, {theme,dark});
      const page = await context.newPage();
      const errors = [], saves = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://crowd.example/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/save' && route.request().postDataJSON().unit === 'seats') saves.push(route.request().postDataJSON());
        await route.fulfill({ json: path === '/me' ? { username: 'דוגמה', latest: {}, created_at: '2026-10-08' } : {} });
      });
      await page.goto('http://127.0.0.1:5175/#/guess');
      const seed = async p => {
        await page.evaluate(p => { localStorage.removeItem('elections26.crowd.saved.seats'); localStorage.setItem('elections26.crowd.draft.seats',JSON.stringify(p)); }, p);
        await page.reload();
        await page.getByRole('spinbutton', {name:`מנדטים ל${name('likud')}`, exact:true}).waitFor();
      };
      const input = id => page.getByRole('spinbutton', {name:`מנדטים ל${name(id)}`, exact:true});
      const more = id => page.getByRole('button', {name:`עוד ל${name(id)}`, exact:true});
      const save = page.getByRole('button', {name:'שמור', exact:true});
      await seed(payload(60,60,true));
      assert.equal(await more('likud').isEnabled(),true);
      await more('likud').click();
      assert.equal(await input('likud').inputValue(),'61');
      await page.getByRole('alert').filter({hasText:'יש כרגע 121 מנדטים'}).waitFor();
      assert.equal(await save.isDisabled(),true);
      await input('likud').fill('62');
      assert.equal(await input('likud').inputValue(),'62');
      await page.getByRole('button',{name:new RegExp(`^${name('shas')}: פתוח`)}).click();
      assert.equal(await more('likud').isDisabled(),true);
      await input('likud').fill('63');
      assert.equal(await input('likud').inputValue(),'62');
      await page.getByRole('alert').filter({hasText:'אי אפשר להוסיף מעל 120'}).waitFor();
      await input('likud').fill('60');
      assert.equal(await save.isEnabled(),true);
      assert.equal(await page.getByRole('alert').count(),0);
      // גם אם המפלגה היחידה שפתוחה היא זו שעורכים, היא תנעל ואינה מאפשרת חריגה.
      await seed(payload(60,60,true));
      assert.equal(await more('shas').isDisabled(),true);
      await input('shas').fill('61');
      assert.equal(await input('shas').inputValue(),'60');
      for (const value of [1,2,3]) {
        await seed(payload(value,120-value));
        assert.equal(await save.isDisabled(),true);
        await page.getByRole('status').filter({hasText:'אי אפשר לשמור השערה'}).waitFor();
      }
      assert.equal(saves.length,0,'אין בקשת שמירה עבור קלט חסום');
      await page.screenshot({path:`${screenshots}/${theme}-${width}-${dark?'dark':'light'}-threshold.png`,fullPage:true});
      for (const value of [0,4]) {
        await seed(payload(value,120-value));
        assert.equal(await save.isEnabled(),true);
      }
      await save.click();
      await page.waitForFunction(() => document.body.innerText.includes('נשמר'));
      assert.equal(saves.length,1,'שמירה תקינה נשלחה פעם אחת');
      assert.equal(saves[0].payload.seats.likud.v,4);
      await seed(payload(60,60,true));
      await more('likud').click();
      const notice=page.getByRole('alert').filter({hasText:'יש כרגע 121 מנדטים'});
      await notice.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'אין גלילה אופקית');
      await page.screenshot({path:`${screenshots}/${theme}-${width}-${dark?'dark':'light'}-overflow.png`,fullPage:true});
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(`עברו חריגה, נעילות, הקלדה, סף ושמירה: ${theme}, ${width}, ${dark?'לילה':'יום'}`);
    }
  } finally {
    await browser.close();
    await new Promise(resolve=>server.httpServer.close(resolve));
  }
})().catch(e=>{console.error(e);process.exit(1)});

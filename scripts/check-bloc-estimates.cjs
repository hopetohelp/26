const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:5181,strictPort:true}});
 const browser=await chromium.launch({executablePath:process.env.UI_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
 for(const theme of ['league'])for(const width of [360,1280])for(const dark of [false,true]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.addInitScript(({theme,dark})=>{
   localStorage.setItem('elections26.theme',theme);localStorage.setItem('elections26.mode',dark?'dark':'light');
   localStorage.setItem('elections26.crowd.draft.blocs',JSON.stringify({mode:'custom',blocs:[
    {id:'full',name:'הרכב עם נתון מלא',lists:['likud','shas'],target:null},
    {id:'approx',name:'הרכב עם השלמה',lists:['likud','bluewhite'],target:null},
    {id:'partial',name:'הרכב חדש שחסר בעבר',lists:['likud','joint'],target:null}]}));
  },{theme,dark});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5181/#/today');
  const last=page.locator('[data-personal-blocs-card]').filter({has:page.getByRole('heading',{name:'הגושים שלי בכל סקר אחרון',exact:true})});await last.waitFor();
  const fold=last.getByText(/נתוני הגושים בכל/);if(await fold.count())await fold.click();
  assert.ok((await last.innerText()).includes('כ-21'),'סקר עם רכיב חסר מוצג כאומדן');
  assert.ok((await last.innerText()).includes('נתון ל-1 מתוך 2 מפלגות'));
  await last.getByText('מקורות האומדן',{exact:true}).first().click();assert.ok((await last.innerText()).includes('29.9.2026'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await last.scrollIntoViewIfNeeded();fs.mkdirSync('/tmp/elections26-estimates',{recursive:true});await last.screenshot({path:`/tmp/elections26-estimates/poll-${theme}-${width}-${dark}.png`});
  await page.goto('http://127.0.0.1:5181/#/polls');await page.getByLabel('עד תאריך',{exact:true}).fill('2025-02-01');
  const archive=page.locator('[data-personal-blocs-card]');await archive.waitFor();
  await archive.getByText(/נתוני הגושים בכל/).click();
  assert.ok((await archive.innerText()).includes('לפחות'),'היסטוריה ללא אותו הרכב מוצגת חלקית');
  assert.ok((await archive.innerText()).includes('חסר נתון או אין התאמה'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await archive.scrollIntoViewIfNeeded();await archive.screenshot({path:`/tmp/elections26-estimates/partial-${theme}-${width}-${dark}.png`});
  await page.goto('http://127.0.0.1:5181/#/polls?tab=trends');
  const trend=page.locator('section').filter({has:page.getByRole('heading',{name:'הגושים שלי לאורך זמן: חציון הסקרים',exact:true})}).last();
  await page.getByRole('heading',{name:'הגושים שלי לאורך זמן: חציון הסקרים',exact:true}).waitFor();
  assert.ok(await page.locator('svg line[stroke-dasharray="5 4"]').count()>0,'קו משוער מקווקו');
  assert.ok((await trend.innerText()).includes('קו מקווקו'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('heading',{name:'הגושים שלי לאורך זמן: חציון הסקרים',exact:true}).scrollIntoViewIfNeeded();await trend.screenshot({path:`/tmp/elections26-estimates/trend-${theme}-${width}-${dark}.png`});
  await page.goto('http://127.0.0.1:5181/#/past');await page.getByRole('heading',{name:/הגושים שלי בתוצאות/}).waitFor();
  assert.ok((await page.locator('[data-personal-blocs-card]').innerText()).includes('לפחות'),'לא מחלקים איחוד רשימות היסטורי שרירותית');
  assert.deepEqual(errors,[]);await context.close();console.log(`סכום מלא, חלקי, אומדן עם מקור ומגמה מקווקוות עברו: ${theme} ${width} ${dark?'לילה':'יום'}`);
 }
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

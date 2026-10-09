const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const meta=require('../src/data/meta.json');
const ids=meta.lists2026.map(l=>l.id);
const calculatorQuery=`&cs=${ids.map((_,i)=>i<2?50:0).join('_')}&ct=72&ce=4000000&ca=${meta.agreements2026.map(()=>0).join('')}`;
const routes=[
 ['/today','הגושים שלי לפי ממוצע הסקרים',2],
 ['/today?tab=scenarios','הגושים שלי: שינוי לאורך זמן והבדלים בין מכונים',1],
 ['/polls','הגושים שלי בסקרים המסוננים בארכיון',1],
 ['/changes','הגושים שלי: תוצאות 2022 מול ממוצע הסקרים היום',1],
 ['/past',null,1],
 ['/past?tab=accuracy','הגושים שלי: סקרים ערב הבחירות מול תוצאות האמת',1],
 ['/guess','הגושים שלי: חלוקת ההשערה ויעדי ההשלמה',1],
 ['/guess?section=calculator','הגושים שלי לפי תוצאת המחשבון',1],
];
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:5177,strictPort:true}});
 const browser=await chromium.launch({executablePath:process.env.UI_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
 for(const theme of ['league']) for(const width of [360,1280]) for(const dark of [false,true]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.route('https://crowd.example/**',r=>r.fulfill({json:{}}));
  await context.addInitScript(({theme,width,dark,ids})=>{
   localStorage.setItem('elections26.theme',theme);localStorage.setItem('elections26.mode',dark?'dark':'light');localStorage.setItem('elections26.crowd.intro','1');
   localStorage.setItem('elections26.crowd.draft.blocs',JSON.stringify({mode:'custom',blocs:[{id:'a',name:'תרחיש לבדיקה',lists:['likud','shas'],target:null}]}));
   localStorage.setItem('elections26.crowd.draft.seats',JSON.stringify({start:'zero',pollsAsOf:null,seats:Object.fromEntries(ids.map(id=>[id,{v:id==='likud'?60:id==='shas'?60:0,src:'manual',locked:true}]))}));
  },{theme,width,dark,ids});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5177/#/');await page.locator('main h1').waitFor();
  assert.equal(await page.locator('[data-personal-blocs-card]').count(),0,'הסיכום הכפול הוסר מהבית');
  for(const [route,title,max] of routes){
   await page.goto(`http://127.0.0.1:5177/#${route}${route.includes("section=calculator")?calculatorQuery:""}`);
   await page.locator('[data-personal-blocs-card]').first().waitFor().catch(async e=>{console.error({route,errors,body:(await page.locator('main').innerText()).slice(0,1800)});throw e;});
   const cards=page.locator('[data-personal-blocs-card]');
   assert.ok(await cards.count()<=max,`${route}: מספר כרטיסים`);
   const headings=await cards.locator('h3').allTextContents();
   assert.ok(headings.every(h=>h!=='הגושים שלי'&&h.length>15));
   assert.equal(new Set(headings).size,headings.length,'כותרות שונות לכל כרטיס');
   if(title) assert.ok(headings.includes(title),`${route}: ${headings}`);
   if(['/today','/today?tab=scenarios','/guess','/guess?section=calculator'].includes(route)){
    assert.ok(await page.locator('[data-personal-blocs-card]').first().evaluate(el=>!el.previousElementSibling || !el.previousElementSibling.matches('section[aria-label="הרשימות היום"]')),'הסיכום קודם לפירוט המפלגות');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route}: גלילה לרוחב`);
  }
  await page.goto('http://127.0.0.1:5177/#/today');await page.getByRole('heading',{name:'הגושים שלי לפי ממוצע הסקרים',exact:true}).waitFor();
  fs.mkdirSync('/tmp/elections26-card-headings',{recursive:true});await page.screenshot({path:`/tmp/elections26-card-headings/${theme}-${width}-${dark}.png`,fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
  console.log(`כותרות, הבחנות, הסרת כפילויות ומיקום סיכומים עברו: ${theme} ${width} ${dark?'לילה':'יום'}`);
 }
 const empty=await browser.newContext();const p=await empty.newPage();
 await p.addInitScript(()=>{localStorage.setItem('elections26.crowd.draft.blocs',JSON.stringify({mode:'custom',blocs:[{id:'a',name:'ריק',lists:[],target:null}]}));});
 for(const route of ['/today','/today?tab=scenarios','/today?tab=forecast','/polls','/changes','/past']){
  await p.goto(`http://127.0.0.1:5177/#${route}${route.includes("section=calculator")?calculatorQuery:""}`);await p.locator('main h1').waitFor();
  assert.equal(await p.locator('[data-personal-blocs-card]').count(),0,'אין כרטיס ללא נתון להצגה');
 }
 await empty.close();
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const meta=require('../src/data/meta.json');
const model=require('../src/data/model.json');
const ids=meta.lists2026.map(l=>l.id);
const cells=Object.fromEntries(ids.map(id=>[id,{v:model.central.seats[id]||0,src:'manual',locked:false}]));
const original={seats:cells,start:'polls',pollsAsOf:model.asof};
const blocs={mode:'custom',blocs:Array.from({length:5},(_,i)=>({id:`b${i}`,name:`תרחיש ${i+1}`,lists:i===0?['likud','shas']:['likud'],target:null}))};
const stat=(list,mean)=>({list,n:2,mean,min:mean,max:mean,median:mean,p25:mean,p75:mean});
const dashboard={participants:2,open:true,publishedAt:model.asof,aggregationId:'qa',seats:{n:2,full:ids.map(id=>stat(id,cells[id].v)),polls:model.central.seats},blocs:null};
const base=process.env.UI_BASE_URL||'http://127.0.0.1:5173/';
(async()=>{
 let lastSeat, lastBlocs;
 const browser=await chromium.launch({headless:true,executablePath:process.env.UI_BROWSER_EXECUTABLE,args:['--no-sandbox']});
 for(const theme of ['league']) for(const dark of [false,true]) for(const width of [360,1280]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  const page=await context.newPage(); const errors=[]; const saved=[]; let authLinkCalls=0;
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await context.route("https://fonts.googleapis.com/**",r=>r.abort());
  await context.route("https://fonts.gstatic.com/**",r=>r.abort());
  await page.addInitScript(({theme,dark,original,blocs})=>{
   localStorage.setItem('elections26.theme',theme);localStorage.setItem('elections26.mode',dark?'dark':'light');
   localStorage.setItem('elections26.crowd.token','qa-session');localStorage.setItem('elections26.crowd.intro','1');
   localStorage.setItem('elections26.crowd.saved.seats',JSON.stringify(original));localStorage.setItem('elections26.crowd.saved.blocs',JSON.stringify(blocs));
  },{theme,dark,original,blocs});
  await page.route(/^https:\/\/(crowd|feedback)\.example\//,async route=>{
   const url=new URL(route.request().url());url.pathname=url.pathname.replace(/^\/crowd/,"");let data={};
   if(url.pathname==='/auth/link') authLinkCalls++;
   if(url.pathname==='/save'){saved.push(route.request().postDataJSON());data={ok:true};}
   if(url.pathname==='/me')data={participant:'qa',username:'בדיקה',created_at:model.asof,latest:{}};
   if(url.pathname==='/dashboard')data=dashboard;
   if(url.pathname==='/history')data={versions:saved.filter(v=>v.unit===url.searchParams.get('unit')).map((v,i)=>({id:i+1,unit:v.unit,payload:v.payload,created_at:'2026-10-08T06:00:00Z'}))};
   await route.fulfill({json:data});
  });
  for(const path of ['/','/today','/today?tab=scenarios','/polls','/polls?tab=trends','/changes','/past','/past?tab=accuracy','/guess?view=statistics']){
   await page.goto(`${base}#${path}`,{waitUntil:"domcontentloaded"});
   if(path==='/') { assert.equal(await page.locator('[data-personal-blocs-card]').count(),0,'הכרטיס הכפול הוסר מהבית'); continue; }
   try { await page.getByRole('heading',{name:/הגושים שלי/}).first().waitFor({timeout:10000}); } catch(e) { console.error(await page.locator("main").innerText());throw e; }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${path}: overflow ${theme} ${dark} ${width}`);
   assert.ok(await page.locator('[data-personal-blocs-card]').count() <= 2,`${path}: at most two personal bloc cards`);
  }
  await page.goto(`${base}#/changes`,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'מה השתנה מבחירות קודמות',exact:true}).waitFor();
  const comparison=page.locator('[data-personal-blocs-card]');
  const firstRow=comparison.getByRole('row').filter({hasText:'תרחיש 1'});
  assert.equal((await firstRow.getByRole('cell').allTextContents())[0],'43');
  await page.getByRole('radio',{name:'לפי משפחות מפלגות',exact:true}).click();
  assert.equal(await page.locator('[data-personal-blocs-card]').count(),1);
  await page.goto(`${base}#/guess?section=seats`,{waitUntil:'domcontentloaded'});
  await page.getByLabel('מנדטים צפויים לגוש תרחיש 1',{exact:true}).fill('61');
  assert.equal(await page.locator('[data-bloc-id]').count(),0,'עריכת ההרכב רק בלשונית הגושים');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('elections26.crowd.saved.seats'))),original);
  await page.screenshot({path:`/tmp/targets-${theme}-${dark}-${width}.png`,fullPage:true});
  await page.goto(`${base}#/guess?view=statistics`,{waitUntil:'domcontentloaded'});
  await page.locator('#statistics').waitFor();
  // חזרה לסטטיסטיקות נשמרת גם לאחר עריכה ומעבר במכשיר.
  await page.getByRole('link',{name:'עריכת הרכב הגושים',exact:true}).first().click();
  await page.locator('[data-bloc-id="b0"]').waitFor();
  await page.getByRole('button',{name:'עריכת שם הגוש: תרחיש 1',exact:true}).click();
  await page.getByRole('textbox',{name:'שם הגוש 1',exact:true}).fill('תרחיש בדיקה');
  await page.getByRole('textbox',{name:'שם הגוש 1',exact:true}).press('Enter');
  await page.getByRole('link',{name:'חזרה למסך הקודם',exact:true}).click();
  assert.ok(page.url().includes('/community'));
  await page.locator('#statistics').waitFor();
  await page.locator('#statistics').getByRole('rowheader').filter({hasText:'תרחיש בדיקה'}).first().waitFor();
  // כתובת מחשבון ישנה וקלטה נשמרים. עצם פתיחתו אינה מחליפה מנדטים.
  const shares=ids.map((id,i)=>i<2?50:0).join('_');
  const agreementFlags=meta.agreements2026.map(()=>0).join('');
  await page.goto(`${base}#/calculator?s=${shares}&t=72&e=4000000&a=${agreementFlags}`);
  await page.getByRole('heading',{name:'מחשבון ההשערה',exact:true}).waitFor();
  assert.ok(page.url().includes('section=calculator'));
  assert.ok(page.url().includes('ct=72'));
  assert.equal(authLinkCalls,0,'קלט מחשבון אינו קישור אישי לכניסה');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('elections26.crowd.saved.seats'))),original);
  await page.getByRole('button',{name:'שמור',exact:true}).click();
  await page.getByRole('button',{name:'נשמר',exact:true}).waitFor();
  const snapshot=saved.find(v=>v.unit==='seats').payload;
  assert.equal(snapshot.mode,'pct');assert.equal(Object.values(snapshot.seats).reduce((n,c)=>n+c.v,0),120);
  assert.deepEqual(snapshot.calculation,{turnout:72,eligible:4000000,agreements:[]});
  const bsave=saved.find(v=>v.unit==='blocs').payload;
  assert.equal(bsave.blocs[0].target,61);assert.deepEqual(bsave.blocs[0].lists,['likud','shas']);assert.equal(bsave.blocs.length,5);assert.equal(bsave.blocs[0].name,'תרחיש בדיקה');
  lastSeat=snapshot; lastBlocs=bsave;
  fs.mkdirSync('/tmp/elections26-ui',{recursive:true});
  await page.screenshot({path:`/tmp/elections26-ui/calculator-${theme}-${dark}-${width}.png`,fullPage:true});
  // קלט שגוי לא שומר תוצאה ישנה.
  await page.locator(`#share-${ids[0]}`).fill('100');
  assert.equal(await page.getByRole('button',{name:'שמור',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'ההיסטוריה שלי',exact:true}).click();
  await page.getByText('תוכן גרסה 1',{exact:true}).click();
  assert.ok((await page.locator('#my-guess').innerText()).includes('50%'));
  assert.equal(errors.length,0,errors.join('\n'));
  fs.mkdirSync('/tmp/elections26-ui',{recursive:true});
  await page.screenshot({path:`/tmp/elections26-ui/history-${theme}-${dark}-${width}.png`,fullPage:true});
  console.log(`${theme} ${dark?'לילה':'יום'} ${width}: כל המסכים, חזרה מעריכה, מחשבון, שמירה והיסטוריה עברו`);
  await context.close();
 }
 const fresh=await browser.newContext({viewport:{width:360,height:1000}});
 const freshPage=await fresh.newPage();
 await freshPage.addInitScript(()=>{localStorage.setItem('elections26.crowd.token','qa-session');localStorage.setItem('elections26.crowd.intro','1');});
 await freshPage.route(/^https:\/\/(crowd|feedback)\.example\//,route=>route.fulfill({json:{participant:'qa',username:'בדיקה',created_at:model.asof,latest:{seats:{id:1,unit:'seats',payload:lastSeat,created_at:model.asof},blocs:{id:2,unit:'blocs',payload:lastBlocs,created_at:model.asof}}}}));
 await freshPage.goto(`${base}#/guess?section=calculator`,{waitUntil:'domcontentloaded'});
 await freshPage.waitForFunction(id=>document.querySelector(`#share-${id}`)?.value==='50',ids[0]);
 assert.equal(await freshPage.getByLabel('בעלי זכות בחירה',{exact:true}).inputValue(),'4000000');
 assert.equal(await freshPage.getByLabel('שיעור הצבעה (%)',{exact:true}).inputValue(),'72');
 await freshPage.getByText('תרחיש בדיקה',{exact:true}).first().waitFor();
 console.log('מכשיר חדש: שחזור הרכב וקלט מחשבון מהחשבון עבר');
 await fresh.close();
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

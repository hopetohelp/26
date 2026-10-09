const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:5178,strictPort:true}});
 const browser=await chromium.launch({executablePath:process.env.UI_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
  for(const theme of ['league'])for(const width of [360,1280])for(const dark of [false,true]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
   await context.route('https://crowd.example/**',r=>r.fulfill({json:{participants:0,seats:null,blocs:null}}));
   await context.addInitScript(({theme,dark})=>{localStorage.setItem('elections26.theme',theme);localStorage.setItem('elections26.mode',dark?'dark':'light')},{theme,dark});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:5178/#/');await page.locator('main h1').waitFor();
   const homeLinks=await page.locator('main a').evaluateAll(els=>els.map(el=>el.getAttribute('href')));
   assert.equal(new Set(homeLinks).size,homeLinks.length,'אין כפילות הפניות בבית');
   for(const target of ['#/guess','#/community','#/polls'])assert.equal(homeLinks.filter(h=>h===target).length,1);
   const mobile=page.locator('nav[aria-label="ניווט בטלפון"]');
   assert.equal(await mobile.locator('a').count(),5);assert.equal(await mobile.locator('a[href="#/polls"]').count(),0);
   assert.equal(await mobile.locator('a[href="#/support"]').count(),1);
   const nav=page.getByRole('navigation',{name:width===360?'ניווט בטלפון':'ניווט ראשי',exact:true});
   await nav.getByRole('link',{name:'הגולשים',exact:true}).click();
   await page.getByRole('heading',{name:'השערות הגולשים',exact:true}).waitFor();
   await page.getByText('0 משתתפים בסך הכול',{exact:true}).waitFor();
   assert.equal(await nav.locator('[aria-current="page"]').count(),1);assert.equal(await nav.locator('[aria-current="page"]').getAttribute('href'),'#/community');
   assert.equal(await page.getByRole('button',{name:'הבנתי, בואו נתחיל'}).count(),0,'צפייה ללא הרשמה/פתיח');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   fs.mkdirSync('/tmp/elections26-community',{recursive:true});await page.screenshot({path:`/tmp/elections26-community/${theme}-${width}-${dark}.png`,fullPage:true});
   await page.getByRole('button',{name:'ההשערה שלי',exact:true}).click();await page.getByRole('heading',{name:'ההשערה שלי',exact:true}).waitFor();
   await page.getByRole('button',{name:'סטטיסטיקות',exact:true}).click();await page.getByRole('heading',{name:'השערות הגולשים',exact:true}).waitFor();
   await page.goto('http://127.0.0.1:5178/#/guess?view=statistics&qa=preserved');
   await page.getByRole('heading',{name:'השערות הגולשים',exact:true}).waitFor();assert.ok(page.url().includes('/community?qa=preserved'));
   await page.goto('http://127.0.0.1:5178/#/polls');await page.getByRole('heading',{name:'ארכיון הסקרים',exact:true}).waitFor();
   assert.deepEqual(errors,[]);await context.close();console.log(`ניווט גולשים ובית ללא כפילות עברו: ${theme} ${width} ${dark?'לילה':'יום'}`);
  }
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

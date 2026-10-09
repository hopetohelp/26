const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {createServer}=await import('vite');const server=await createServer({base:'/',server:{host:'127.0.0.1',port:5182,strictPort:true}});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.UI_BROWSER_EXECUTABLE,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
  for(const theme of ['league'])for(const dark of [false,true]){
   const context=await browser.newContext({viewport:{width:360,height:900}});await context.route('https://fonts.googleapis.com/**',r=>r.abort());await context.route('https://fonts.gstatic.com/**',r=>r.abort());
   await context.addInitScript(({theme,dark})=>{localStorage.setItem('elections26.theme',theme);localStorage.setItem('elections26.mode',dark?'dark':'light')},{theme,dark});
   const page=await context.newPage();await page.goto('http://127.0.0.1:5182/');await page.locator('main h1').waitFor();
   const result=await page.evaluate(async()=>{
    const drawn=[],original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){drawn.push(String(text));return original.call(this,text,...args)};
    const {renderShareImage}=await import('/src/pages/guess/shareImage.ts');
    const blob=await renderShareImage({kind:'blocs',values:{likud:120},blocs:[{name:'בדיקת מקור חלקי',lists:['likud','unknown'],total:120}]});
    return {drawn,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
   });
   assert.ok(result.drawn.includes('לפחות 120'));assert.ok(result.drawn.some(t=>t.includes('נתון ל-1/2')));assert.ok(result.drawn.some(t=>t.includes('חסר: unknown')));
   fs.mkdirSync('/tmp/elections26-estimates',{recursive:true});fs.writeFileSync(`/tmp/elections26-estimates/share-partial-${theme}-${dark}.png`,Buffer.from(result.bytes));await context.close();console.log(`סימון סכום חלקי וכיסוי בתמונה עבר: ${theme} ${dark?'לילה':'יום'}`);
  }
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exit(1)});

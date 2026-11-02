const puppeteer=require('puppeteer-core');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.evaluateOnNewDocument(()=>localStorage.setItem('scenesense-tour-v1','seen'));await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
  await fs.mkdir('.artifacts/ui-review',{recursive:true});
  const checks=[];
  for(const width of [1440,375]){
   await page.setViewport({width,height:900});
   for(let i=0;i<4;i++){
    await page.click('.main-nav button:nth-child('+(i+1)+')');
    await new Promise(resolve=>setTimeout(resolve,500));
    const label=['studio','voice','connections','scene'][i];
    await page.screenshot({path:'.artifacts/ui-review/'+label+'-'+width+'.png',fullPage:true});
    const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,active:document.querySelector('.main-nav [aria-current="page"]')?.textContent,heading:document.querySelector('.page-heading h1').textContent,visibleViews:[...document.querySelectorAll('main>section')].filter(x=>getComputedStyle(x).display!=='none').length}));
    if(result.overflow||result.visibleViews!==1)throw new Error(JSON.stringify(result));checks.push({width,view:label,...result});
   }
  }
  if(errors.length)throw Error(errors.join('\n'));
  await fs.writeFile('.artifacts/ui-review/navigation.json',JSON.stringify(checks,null,2));console.log('All four views rendered at desktop and phone widths; no horizontal overflow and exactly one active view.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

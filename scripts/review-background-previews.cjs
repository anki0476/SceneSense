const puppeteer=require('puppeteer-core');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1280,height:1000});
  await fs.mkdir('.artifacts/ui-review',{recursive:true});
  for(const theme of ['dark','light']){
   await page.evaluateOnNewDocument(value=>localStorage.setItem('scenesense-theme',value),theme);
   await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle0'});
   // Fresh test profiles see the optional welcome dialog first.
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Maybe later')?.click());
   await page.click('.app-settings button');
   await page.waitForSelector('.settings-sidebar nav button:nth-child(2)',{timeout:5000}).catch(async error=>{await page.screenshot({path:'.artifacts/ui-review/background-settings-debug.png'});console.log(await page.$eval('body',node=>node.innerText.slice(0,1200)));throw error;});
   await page.click('.settings-sidebar nav button:nth-child(2)');
   await page.waitForFunction(()=>[...document.querySelectorAll('.background-swatch')].length===6&&[...document.querySelectorAll('.background-swatch')].every(img=>img.complete&&img.naturalWidth===768));
   const images=await page.$$eval('.background-swatch',nodes=>nodes.map(img=>img.getAttribute('src')));
   if(images.some(src=>!src.endsWith(`-${theme}.webp`)))throw Error('Incorrect preview theme');
   if(await page.$('.background-catalog canvas'))throw Error('Picker must use static images');
   await page.click('.background-option-ascii');
   const selected=await page.evaluate(()=>JSON.parse(localStorage.getItem('scenesense-background-v1')));
   if(selected.animation!=='ascii'||selected.mode!=='flow')throw Error('Selection did not persist');
   await (await page.$('.background-catalog')).screenshot({path:`.artifacts/ui-review/background-previews-${theme}.png`});
   console.log(`${theme}: six real still images loaded; background selection saved.`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

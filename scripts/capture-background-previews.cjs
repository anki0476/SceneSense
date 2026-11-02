// Run with the Vite dev server running. Capture the production background
// component itself so thumbnails stay aligned with its colors and settings.
const puppeteer=require('puppeteer-core');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();
  await page.setViewport({width:768,height:432,deviceScaleFactor:1});
  await fs.mkdir('public/background-previews',{recursive:true});
  for(const theme of ['dark','light'])for(const animation of (process.argv.slice(2).length?process.argv.slice(2):['topographic','aero','waves','rings','ascii','topography'])){
   // Skip Aero's long entrance reveal so its still shows the complete geometry.
   await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:animation==='aero'?'reduce':'no-preference'}]);
   await page.evaluateOnNewDocument((name)=>localStorage.setItem('scenesense-background-v1',JSON.stringify({mode:'flow',animation:name,defaultVersion:2})),animation);
   const errors=[];const onError=error=>errors.push(error.message);page.on('pageerror',onError);
   await page.goto(`http://127.0.0.1:5173/scripts/background-preview.html?theme=${theme}`,{waitUntil:'networkidle0'});
   await page.waitForSelector('.app-background canvas, .app-background svg');
   await new Promise(resolve=>setTimeout(resolve,2500));
   if(errors.length)throw Error(`${animation}: ${errors.join('; ')}`);
   await page.screenshot({path:`public/background-previews/${animation}-${theme}.webp`,type:'webp',quality:85});
   page.off('pageerror',onError);
   console.log(`Captured ${animation} (${theme})`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

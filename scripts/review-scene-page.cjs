const puppeteer=require('puppeteer-core');
const fs=require('node:fs/promises');
(async()=>{const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluateOnNewDocument(()=>localStorage.setItem('scenesense-tour-v1','seen'));
 await page.setViewport({width:1280,height:900});await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle0'});
 await page.click('[data-tour-page="scene"]');await page.waitForSelector('#scene-view:not([hidden]) .sense-conversation');
 await page.click('#scene-view .sense-conversation [role="switch"]');
 await page.click('[data-tour-page="voice"]');await page.waitForSelector('#voice-view:not([hidden])');
 await page.click('[data-tour-page="scene"]');await page.waitForSelector('#scene-view:not([hidden])');
 if(await page.$eval('#scene-view .sense-conversation [role="switch"]',el=>el.getAttribute('aria-checked')==='true'))throw Error('Conversation state lost across navigation');
 await fs.mkdir('.artifacts/ui-review',{recursive:true});
 for(const width of [1280,1191,390]){await page.setViewport({width,height:900});await new Promise(resolve=>setTimeout(resolve,500));await page.screenshot({path:`.artifacts/ui-review/scene-${width}.png`,fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`Overflow at ${width}`);}
 if(errors.length)throw Error(errors.join('\n'));console.log('Scene page renders at desktop and phone widths, retains conversation state and has no page errors or horizontal overflow.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

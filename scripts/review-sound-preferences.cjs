const puppeteer=require('puppeteer-core');
(async()=>{const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.evaluateOnNewDocument(()=>localStorage.setItem('scenesense-tour-v1','seen'));await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle0'});
 await page.click('[data-tour-page="scene"]');await page.waitForSelector('#scene-view:not([hidden])');
 if(await page.$eval('.page-heading h1',el=>el.textContent)!=='Sense')throw Error('Incorrect mascot name');
 const notch='button[aria-label="Notch sound effects"]',buttons='button[aria-label="Button sound effects"]';
 await page.click(notch);await page.waitForFunction(()=>localStorage.getItem('scenesense-sounds-notch')==='false');
 await page.click('.app-settings button');await page.waitForSelector(buttons);if(await page.$eval(buttons,el=>el.getAttribute('aria-checked'))!=='true')throw Error('Preferences are not independent');
 await page.click(buttons);await page.waitForFunction(()=>localStorage.getItem('scenesense-sounds-buttons')==='false');
 await page.reload({waitUntil:'networkidle0'});await page.click('[data-tour-page="scene"]');await page.waitForSelector('#scene-view:not([hidden])');if(await page.$eval(notch,el=>el.getAttribute('aria-checked'))!=='false')throw Error('Notch choice was not restored');
 await page.click('.app-settings button');await page.waitForSelector(buttons);if(await page.$eval(buttons,el=>el.getAttribute('aria-checked'))!=='false')throw Error('Button choice was not restored');
 // Confirm muted groups skip the synthesis engine entirely.
 await page.evaluate(async()=>{const {voiceSound}=await import('/src/voiceSounds.ts');window.AudioContext=class{constructor(){throw Error('Muted audio was initialized');}};voiceSound('tap');voiceSound('start');voiceSound('end');voiceSound('done');});
 console.log('Sense naming, independent sound switches, saved choices and muted sound paths verified.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

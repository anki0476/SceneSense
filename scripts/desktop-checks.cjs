const fs = require('node:fs/promises');
const path = require('node:path');
async function run(window, app,voiceOverlay) {
  const failures=[];
  const deadline=setTimeout(() => { console.error('Desktop test timed out'); app.exit(1); },45000);
  window.webContents.on('console-message', event => { if (event.level === 'error') failures.push(event.message); });
  window.webContents.on('render-process-gone', () => { console.error('Renderer exited unexpectedly'); app.exit(1); });
  window.webContents.once('did-finish-load', async () => {
    try {
      const exec = code => window.webContents.executeJavaScript(code);
      // A hidden test window must exercise the visible-window preview path.
      await exec("Object.defineProperty(document,'hidden',{configurable:true,value:false}); true");
      const wait = async code => { for (let i=0;i<100;i++) { if (await exec(code)) return; await new Promise(resolve => setTimeout(resolve,50)); } throw new Error(`UI condition failed: ${code}`); };
      const click = text => exec(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(text)})); if(!b || b.disabled) throw new Error('Button unavailable'); b.click(); })()`);
      const go=async label=>{await click(label);await wait(`document.getElementById('${label.toLowerCase()}-view').hidden === false`);await new Promise(resolve=>setTimeout(resolve,120));};
      const field = (selector,value) => exec(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      const select = (index,value) => exec(`(() => { const el=document.querySelectorAll('.source-grid select')[${index}]; el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
      const state=await exec("window.scenesense.invoke('state')");
      await exec("localStorage.setItem('scenesense-tour-v1','seen');localStorage.setItem('scenesense-auto-microphone','false');window.location.reload();true");
      await wait("document.querySelector('.app-settings button') !== null");
      await click('Settings');await wait("document.querySelector('.settings-sidebar') !== null");await click('Appearance');
      const initialTheme=await exec("document.documentElement.dataset.theme");
      await exec("document.querySelector('button[aria-label=\"Toggle between dark and light mode\"]').click();true");
      await wait(`document.documentElement.dataset.theme !== ${JSON.stringify(initialTheme)}`);
      const savedTheme=await exec("({theme:document.documentElement.dataset.theme,saved:localStorage.getItem('scenesense-theme'),scheme:getComputedStyle(document.documentElement).colorScheme})");
      if(savedTheme.theme!==savedTheme.saved||savedTheme.scheme!==savedTheme.theme)throw new Error('Theme preference or native control appearance did not update.');
      await exec("document.querySelector('button[aria-label=\"Toggle between dark and light mode\"]').click();true");
      await go('Studio');
      await wait("document.querySelector('.offline-preview .chromatic-button')!==null");
      if (!state.ok || state.data.obs.status !== 'disconnected') throw new Error('Desktop bridge failed.');
      const invalid=await exec("window.scenesense.invoke('obs:act','delete-scene')");
      if (invalid.ok) throw new Error('Invalid action accepted.');
      await go('Voice');
      const chord=type=>exec(`window.dispatchEvent(new KeyboardEvent('${type}',{code:'KeyZ',key:'Z',ctrlKey:true,shiftKey:true,bubbles:true}));true`);
      const speak=async text=>{require('../tests/fixtures/voice-simulator.cjs').Socket.utterance=text;await chord('keydown');await wait(`document.querySelector('.voice-transcript')?.textContent.includes(${JSON.stringify(text)})`);await chord('keyup');await wait("document.querySelector('.hold-to-speak')?.textContent.includes('Hold to speak')");const status=await exec("window.scenesense.invoke('state')");if(status.data.voice.status==='error')throw new Error('Spoken app command failed: '+text);};
      await chord('keydown');await chord('keyup');
      await wait("document.body.innerText.includes('Voice needs an OpenAI API key')");
      await field('input[placeholder^="sk-"]','sk-fixture-only-key-1234567890');
      await click('Use key for this session');
      await wait("document.body.innerText.includes('Forget API key')");
      const configured=await exec("window.scenesense.invoke('state')");
      if(!configured.data.voice.configured || JSON.stringify(configured).includes('sk-fixture'))throw new Error('Voice key setup leaked a credential.');
      await chord('keydown');await chord('keyup');
      await wait("document.body.innerText.includes('Click Prepare microphone once')");
      await click('Forget API key');
      await wait("document.querySelector('input[placeholder^=\"sk-\"]') !== null");
      const port=process.argv.find(x=>x.startsWith('--fixture-port='))?.split('=')[1];
      if (port) {
        await go('Connections');
        await field('input[type=number]',port); await field('input[type=password]','wrong-password');
        await click('Connect OBS');
        await wait("document.body.innerText.includes('Could not connect to OBS')");
        await field('input[type=password]','fixture-password'); await click('Connect OBS');
        await wait("document.body.innerText.includes('OBS connected. Choose')");
        await go('Studio');
      await wait("document.querySelector('.offline-preview')===null");
        await click('Load sources'); await wait("document.querySelectorAll('.source-grid select option').length > 3");
        await select(1,'1'); await select(2,'2'); await click('Confirm sources');
        await wait("document.body.innerText.includes('Sources confirmed.')");
        await go('Studio');
        await wait("document.querySelector('img[alt=\"Live OBS scene preview\"]')?.naturalWidth > 0");
        const firstFrame=await exec("document.querySelector('img[alt=\"Live OBS scene preview\"]').dataset.capturedAt");
        await wait(`document.querySelector('img[alt="Live OBS scene preview"]')?.dataset.capturedAt !== ${JSON.stringify(firstFrame)}`);
        for (const action of ['top-right','smaller','restore']) {
          const before=await exec("document.querySelector('img[alt=\"Live OBS scene preview\"]').src");
          await exec(`document.querySelector('button[aria-label="${action}"]').click()`);
          await wait(`document.body.innerText.includes('Verified in OBS: ${action}.')`);
          await wait(`document.querySelector('img[alt="Live OBS scene preview"]')?.src !== ${JSON.stringify(before)}`);
        }
        await wait("document.body.innerText.includes('Restore verified against OBS')");
        // Prepare an explicitly synthetic microphone. No physical input and no
        // paid API calls are used. Exercise the real worklet and hold/release UI.
        await exec(`(() => {
          navigator.mediaDevices.getUserMedia=async constraints=>{
            if(!constraints.audio || constraints.video!==false)throw new Error('Unexpected microphone request');
            const context=new AudioContext(),oscillator=context.createOscillator(),destination=context.createMediaStreamDestination();
            oscillator.frequency.value=440;oscillator.connect(destination);oscillator.start();context.resume();
            window.fixtureAudioContext=context;window.fixtureMicStream=destination.stream;return destination.stream;
          };
          navigator.mediaDevices.enumerateDevices=async()=>[];return true;
        })()`);
        await go('Voice');
        await field('input[placeholder^="sk-"]','sk-fixture-only-key-1234567890');await click('Use key for this session');
        const hotkey=await exec("window.scenesense.invoke('state')");
        if(hotkey.data.voice.shortcut!=='Hold Ctrl+Shift+Z')throw new Error('Native hold shortcut failed to initialize in Electron.');
        await chord('keydown');await chord('keyup');
        await wait("document.body.innerText.includes('Click Prepare microphone once')");
        await click('Prepare microphone');
        await wait("document.body.innerText.includes('Mic ready')");
        await wait("document.querySelector('meter[aria-label=\"Voice microphone level\"]').value > 0");
        await go('Studio');await go('Voice');
        await wait("document.body.innerText.includes('Mic ready')");
        await fs.mkdir(path.join(__dirname,'..','.artifacts'),{recursive:true});
        await fs.writeFile(path.join(__dirname,'..','.artifacts','scenesense-voice-redesign.png'),(await window.webContents.capturePage()).toPNG());
        for(let i=0;i<6;i++){
          // Start in Studio for the first command: the mounted Voice handler
          // must keep working when its page is not the selected workspace.
          if(i===0)await go('Studio');
          await chord('keydown');
          await wait("document.querySelector('.voice-result')?.textContent.includes('top-right') && document.querySelector('.hold-to-speak')?.textContent.includes('Release')");
          const during=await exec("window.scenesense.invoke('state')");
          if(during.data.voice.status!=='listening'||!during.data.voice.decisionStatus.includes('OBS verified'))throw new Error('Decisions action did not execute before key release.');
          const indicator=await voiceOverlay.window.webContents.executeJavaScript("({label:document.body.innerText,visible:!!document.querySelector('.voice-notch.visible'),isolated:!window.scenesense,canvas:!!document.querySelector('canvas'),sense:!!document.querySelector('.sense-avatar'),height:document.querySelector('.voice-notch')?.getBoundingClientRect().height})");
          if(!indicator.visible||!indicator.label.includes('Listening')||!indicator.isolated||!indicator.canvas||!indicator.sense||indicator.height<56)throw new Error('Desktop notch failed to render the larger Sense listening indicator.');
          if(!voiceOverlay.window.isAlwaysOnTop()||voiceOverlay.window.isFocusable())throw new Error('Voice overlay must stay above apps without taking focus.');
          await chord('keyup');
          await wait("document.querySelector('.hold-to-speak')?.textContent.includes('Hold to speak')");
          if(i===0)await go('Voice');
        }
        await speak('Sense, open connections.');
        await wait("document.getElementById('connections-view').hidden === false");
        await speak('Open studio.');
        await wait("document.getElementById('studio-view').hidden === false");
        await speak('Check current frame.');
        await wait("document.querySelector('.layout-recommendation')?.textContent.includes('bottom right')");
        await wait("document.querySelector('.sense-bubble')?.textContent.includes('Preview move')");
        await speak('Sense, preview the suggestion.');
        await wait("document.querySelector('.sense-proposed') !== null");
        const proposed=await exec("window.scenesense.invoke('state')");
        if(proposed.data.layout.status!=='suggestion')throw new Error('Placement preview must not apply an OBS move.');
        await speak('Sense, apply the suggestion.');
        await wait("document.querySelector('.layout-assist')?.textContent.includes('Layout change verified in OBS')");
        const visionState=await exec("window.scenesense.invoke('state')");
        if(visionState.data.layout.checks!==1||visionState.data.layout.watching)throw new Error('Manual image check unexpectedly enabled automatic watching.');
        await wait("document.querySelector('.sense-bubble')?.textContent.includes('Undo move')");
        await speak('Sense, undo your last move.');
        await wait("document.querySelector('.layout-assist')?.textContent.includes('Previous placement restored')");
        await go('Voice');
        await click('Disable mic');
        await wait("window.fixtureMicStream.getAudioTracks().every(x=>x.readyState==='ended')");
        await exec("window.fixtureAudioContext.close();true");
        await click('Forget API key');
        await go('Studio');
        await exec("document.querySelector('button[aria-label=\"restore\"]').click()");
        await wait("document.body.innerText.includes('Restore verified against OBS')");
        // Test video switching with an explicitly synthetic camera; never open
        // the developer's physical webcam or pretend this is hardware validation.
        await exec(`(() => {
          navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',label:'OBS Virtual Camera (fixture)',deviceId:'fixture-virtualcam'}];
          navigator.mediaDevices.getUserMedia=async constraints=>{
            if(constraints.audio!==false || constraints.video.deviceId.exact!=='fixture-virtualcam')throw new Error('Unexpected camera request');
            const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
            const ctx=canvas.getContext('2d');let i=0;ctx.fillRect(0,0,64,64);
            const timer=setInterval(()=>{ctx.fillStyle=(i++%2)?'#bba3ff':'#182338';ctx.fillRect(0,0,64,64);},33);
            const stream=canvas.captureStream(30);stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
          };return true;
        })()`);
        await click('Enable smooth video');
        await wait("document.body.innerText.includes('Use lightweight preview')");
        await wait("document.querySelector('video').videoWidth > 0 && document.querySelector('video').currentTime > 0");
        await click('Use lightweight preview');
        await wait("document.querySelector('video').srcObject === null");
        await wait("document.querySelector('img[alt=\"Live OBS scene preview\"]')?.naturalWidth > 0");
        await exec("window.scrollTo(0,0);true");await new Promise(resolve=>setTimeout(resolve,120));
        await fs.writeFile(path.join(__dirname,'..','.artifacts','scenesense-studio-redesign.png'),(await window.webContents.capturePage()).toPNG());
        await go('Connections');
        await select(1,'2');
        await go('Studio');
        await wait("document.querySelector('button[aria-label=\"top-right\"]').disabled");
        await go('Connections');await select(1,'1');
        await click('Disconnect');
        await wait("document.querySelector('button[aria-label=\"restore\"]').disabled");
      }
      if (failures.length) throw new Error(failures.join('; '));
      const artifacts=path.join(__dirname,'..','.artifacts'); await fs.mkdir(artifacts,{recursive:true});
      await fs.writeFile(path.join(artifacts,port?'phase1-desktop-integration.png':'phase1-desktop.png'),(await window.webContents.capturePage()).toPNG());
      console.log(port ? 'Desktop integration passed: Ctrl+Shift+Z feedback for missing setup, focused key hold/release, real PCM worklet, incremental Decisions HTTP protocol with fake transport, six OBS actions before key release (including Studio view), mic release, preview and exact restore. No paid providers or physical devices were used. Native global hook initialized; physical global key delivery still needs user verification.' : 'Desktop smoke test passed.');
      clearTimeout(deadline); app.exit(0);
    } catch(error) { console.error(error.stack||error.message); clearTimeout(deadline); app.exit(1); }
  });
}
module.exports={run};


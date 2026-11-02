const { app, BrowserWindow, ipcMain, session, shell, safeStorage, screen,nativeImage,clipboard,Tray,Menu } = require('electron');
const path = require('node:path');
// Integration runs must not read or overwrite the user's presets or UI preferences.
if(process.argv.includes('--smoke-test'))app.setPath('userData',require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(),'scenesense-smoke-')));
const { pathToFileURL } = require('node:url');
const OBSWebSocket = require('obs-websocket-js/json').default;
const { ObsService } = require('./obs.cjs');
const { TwitchService } = require('./twitch.cjs');
const { VoiceService } = require('./voice.cjs');
const { HoldShortcut } = require('./hold-shortcut.cjs');
const { loadVoiceEnv } = require('./env-config.cjs');
const voiceStartup=require('./voice-startup.cjs').createVoiceStartup(app);
let quitting=false,backgroundVoice=false,voiceTray;
if(!process.argv.includes('--smoke-test')){
 if(!app.requestSingleInstanceLock())app.exit(0);
 app.on('second-instance',(_event,args)=>{if(!args.includes('--voice-background')&&window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.on('before-quit',()=>{quitting=true;});
}
let window;
let voiceOverlay;
let startupController;
let startupInterrupted=false;
let finishStartup=()=>{startupInterrupted=true;};
let conversation;
let layoutAssist;
let supervisor;
let supervisorSignature='',pendingSupervisorNotice;
let setupAgent;
let setupPointer;
let setupExperiment=false;
const computerUsePreference=()=>new (require('./computer-use-preference.cjs').ComputerUsePreference)(path.join(app.getPath('userData'),'computer-use-preference.json'));
let setupAccessibilityPrior;
let videoAllowed = false;
let restarting=false;
const {buildFingerprint,saveUpdateReceipt,consumeUpdateReceipt,releaseNotes,newReleaseItems}=require('./update-status.cjs');
const runningFingerprint=buildFingerprint(path.join(__dirname,'..'));
const runningNotes=releaseNotes(path.join(__dirname,'..'));
let updateInfo=null,updateReceipt;
const {buildUpdate}=require('./restart-build.cjs');
let obsPreset;
let webcamBackground;
const {ObsPreset}=require('./obs-preset.cjs');
const entry = path.join(__dirname, '..', 'dist', 'index.html');
const entryUrl = pathToFileURL(entry).href;
const publish = data => {
  if(data.kind==='supervisor'){
   const signature=data.status==='attention'?JSON.stringify(data.issues.map(x=>[x.id,x.detail])):'';
   if(signature&&signature!==supervisorSignature)pendingSupervisorNotice='Sense noticed: '+data.issues.map(x=>x.title).join('; ')+'. Open Sense to review or ask me to fix a reported issue.';
   if(!signature)pendingSupervisorNotice=null;
   supervisorSignature=signature;
  }
  if(pendingSupervisorNotice&&conversation&&(data.kind==='supervisor'||data.kind==='voice')&&!voice.active()){const notice=pendingSupervisorNotice;pendingSupervisorNotice=null;conversation.announce(notice);}
  if(data.kind==='obs'){webcamBackground?.sync(data);supervisor?.sync(data);}
  if(data.kind==='obs'&&!data.selection&&layoutAssist&&(layoutAssist.state.watching||layoutAssist.recommendation||layoutAssist.undoRecord||layoutAssist.busy))layoutAssist.stop('OBS sources changed. Confirm sources and restart image checks.');
  if(data.kind==='voice'&&data.status==='connecting'){finishStartup();conversation?.interrupt();}
  if(data.kind==='voice')voiceOverlay?.update(data);
  if(data.kind==='stream-setup'){voiceOverlay?.showSetup(data);if(data.status!=='running')setupPointer?.stop();}
  if(data.kind==='sense-reply'){if(data.status==='thinking')voiceOverlay?.setWorking(!!data.news);else if(data.status==='idle')voiceOverlay?.clearWorking();else if(data.status==='error')voiceOverlay?.showReply(data.text);}
  if(window && !window.isDestroyed()){
    if(data.kind==='voice'&&!process.argv.includes('--smoke-test'))window.webContents.setBackgroundThrottling(!voiceStartup.status().enabled&&!['connecting','listening','finishing'].includes(data.status));
    window.webContents.send('state:update',data);
  }
};
const obs = new ObsService(new OBSWebSocket(), publish,{cropImage:(image,rects)=>require('./layout-images.cjs').cropEvidence(nativeImage,image,rects)});
webcamBackground=new (require('./webcam-background.cjs').WebcamBackground)(obs,publish);
obs.client.on('ConnectionClosed', () => { videoAllowed = false; });
const twitch = new TwitchService(publish);
const voice = new VoiceService(obs, publish,{decision:(key,text,signal)=>require('./voice-decisions.cjs').decideWithAPI(key,text,signal,fetch,{experimental:setupExperiment}),beforeStart:()=>layoutAssist?.yieldToVoice(),onLayoutAction:()=>layoutAssist.pauseForManual(),executeAppAction:executeAppAction,hasSenseUndo:()=>!!layoutAssist.undoRecord,onInteraction:input=>{void conversation?.respond(input);},...(process.argv.includes('--smoke-test')?require('../tests/fixtures/voice-simulator.cjs'):{})});
layoutAssist=new (require('./layout-assist.cjs').LayoutAssist)(obs,publish,{preferencePath:path.join(app.getPath('userData'),'sense-watching.json'),getKey:()=>voice.key,isVoiceActive:()=>voice.active()&&(!voice.state.latched||(voice.processing&&!voice.dispatchingApp)),...(process.argv.includes('--smoke-test')?{inspect:async()=>({position:'bottom-right',obstruction:'hud',confidence:.99,blockedProbability:.99,actionable:true})}:{})});
conversation=new (require('./sense-conversation.cjs').SenseConversation)({getKey:()=>voice.key,publish,showReply:text=>voiceOverlay?.showReply(text),clearReply:()=>voiceOverlay?.clearReply(),...(process.argv.includes('--smoke-test')?{fetcher:async()=>({ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'All set. What’s next?'}]}]})})}:{})});
supervisor=new (require('./stream-supervisor.cjs').StreamSupervisor)(obs,publish,{preferencePath:path.join(app.getPath('userData'),'supervisor.json'),sampleFrame:async sourceName=>{const shot=await obs.call('GetSourceScreenshot',{sourceName,imageFormat:'png',imageWidth:64,imageHeight:36},false);if(typeof shot.imageData!=='string'||shot.imageData.length>100000)throw Error('Invalid video sample.');const image=nativeImage.createFromDataURL(shot.imageData);if(image.isEmpty())throw Error('Empty video sample.');return require('./frame-health.cjs').describeBitmap(image.resize({width:64,height:36}).toBitmap());},beforeRepair:()=>layoutAssist.yieldToManual(),reconnect:async signal=>{
 if(!setupExperiment)throw Error('Enable Experimental computer setup in Studio to let Sense open OBS.');
 const saved=obsPreset?.read();if(!saved)throw Error('Save an OBS connection preset in Connections first.');
 await require('./obs-reconnect.cjs').reconnectObs(obs,saved,{signal,launch:signal=>require('./setup-desktop.cjs').desktopStep({action:'launch_obs'},{signal}),onProgress:message=>{supervisor.state.message=message;supervisor.emit();}});
}});
supervisor.sync(obs.state);
app.on('before-quit',()=>supervisor?.destroy());
const holdShortcut=new HoldShortcut(publish);
const uiCommands=new Map();let commandSequence=0;
async function executeAppAction(action,text){
  const direct={supervisor_repair_many:()=>supervisor.repairMany(require('./voice-decisions.cjs').explicitRepairPlan(text)),supervisor_cancel:()=>supervisor.cancelRepair(),supervisor_review_game:()=>supervisor.repair('game-black'),supervisor_review_webcam:()=>supervisor.repair('webcam-frozen'),supervisor_check:()=>supervisor.check(),supervisor_fix:()=>supervisor.repair('current'),supervisor_unmute:()=>supervisor.repair('mic-muted'),supervisor_show_webcam:()=>supervisor.repair('webcam-hidden'),supervisor_show_game:()=>supervisor.repair('game-hidden'),supervisor_reconnect:()=>supervisor.repair('obs-disconnected'),setup_game:()=>{if(!setupExperiment)throw Error('Enable Experimental computer setup first.');const game=require('./game-profile.cjs').gameFromSpeech(text);const profile=readGameProfiles().find(x=>x.gameName.toLowerCase()===game?.toLowerCase());if(!profile)throw Error('Create a game profile for '+game+' in Studio first.');return setupAgent.run(profile);},setup_asphalt:()=>{if(!setupExperiment){conversation?.announce('Enable Experimental computer setup in Studio first, then repeat your command.');throw Error('Enable Experimental computer setup first.');}return setupAgent.run(readGameProfiles().find(x=>x.gameName.toLowerCase()==='asphalt legends'));},background_remove:()=>setWebcamBackground(true),background_restore:()=>setWebcamBackground(false),check_frame:()=>layoutAssist.checkNow(),watch_start:()=>layoutAssist.start('assist'),assist_start:()=>layoutAssist.start('assist'),auto_start:()=>layoutAssist.start('auto'),watch_stop:()=>layoutAssist.stopWatching(),apply_suggestion:()=>layoutAssist.apply(true),undo_sense:()=>layoutAssist.undo(),keep_here:()=>layoutAssist.pauseForManual()};
  if(direct[action]){const result=await direct[action]();if(action==='supervisor_repair_many')return result;if(action.startsWith('supervisor_'))return action==='supervisor_check'?result.message:result.lastRepair||result.message;if(action==='setup_asphalt'||action==='setup_game')return result;if(action==='background_remove')return 'Webcam background filter enabled.';if(action==='background_restore')return 'Original webcam background restored.';return require('./app-actions.cjs').appActions[action];}
  if(!Object.hasOwn(require('./app-actions.cjs').appActions,action))throw new Error('Unsupported app command.');
  return new Promise((resolve,reject)=>{const id=++commandSequence;const timer=setTimeout(()=>{uiCommands.delete(id);reject(new Error('App command timed out. Open SceneSense and retry.'));},action==='restart_update'?120000:15000);uiCommands.set(id,{resolve,reject,timer});publish({kind:'app-command',id,action,text});});
}
function enableVoiceShortcut(){
  try{holdShortcut.start();voice.state.shortcut='Hold Ctrl+Shift+Z';voice.state.globalShortcutReady=true;}
  catch{voice.state.shortcut='Ctrl+Shift+Z while SceneSense is focused';voice.state.globalShortcutReady=false;}
}
obs.client.on('ConnectionClosed', () => {if(voice.active())voice.cancel();});
obs.client.on('CurrentProgramSceneChanged', () => {if(voice.active())voice.cancel();});
function handle(name, operation) {
  ipcMain.handle(name, async (event, input) => {
    try {
      if (!window || window.isDestroyed() || event.sender.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entryUrl) return { ok: false, error: 'Untrusted request.' };
      return { ok: true, data: await operation(input) };
    }
    catch (error) { return { ok: false, error: error.name === 'ZodError' ? 'Invalid input. Check the selected fields.' : error.message || 'Operation failed.' }; }
  });
}
handle('state', () => ({ obs: obs.state, webcamBackground:webcamBackground.state, twitch: twitch.state, voice: voice.state, layout:layoutAssist.state, supervisor:supervisor.state, preset: obsPreset?.summary(), updateInfo }));
async function setWebcamBackground(enabled){require('zod').z.boolean().parse(enabled);await layoutAssist.yieldToManual();return webcamBackground.setEnabled(enabled);}
handle('obs:background:status',()=>webcamBackground.inspect());
handle('obs:background:set',setWebcamBackground);
handle('obs:background:setup',()=>shell.openExternal('https://royshil.github.io/obs-backgroundremoval/windows/INSTALL.html'));
handle('supervisor:video',input=>supervisor.setVideo(input));
handle('supervisor:cancel',()=>supervisor.cancelRepair());
handle('supervisor:check',()=>supervisor.check());
const sourceVisibility=new (require('./source-visibility.cjs').SourceVisibility)(obs,()=>supervisor.target);
handle('obs:visibility:read',()=>sourceVisibility.read());
handle('obs:visibility:set',async input=>{await layoutAssist.yieldToManual();if(voice.active())voice.cancel();return sourceVisibility.set(input);});
handle('supervisor:repair',input=>supervisor.repair(input));
handle('supervisor:microphone',input=>supervisor.selectMicrophone(input));
handle('layout:preferences',input=>layoutAssist.setPreferences(input));
handle('layout:check',()=>layoutAssist.checkNow());
handle('layout:start',mode=>layoutAssist.start(mode));
handle('layout:stop',()=>layoutAssist.stopWatching());
handle('layout:apply',()=>layoutAssist.apply(true));
handle('layout:undo',()=>layoutAssist.undo());
handle('layout:keep',()=>{layoutAssist.pauseForManual();layoutAssist.emit();return layoutAssist.state;});
handle('voice:ui-result',input=>{const data=require('zod').z.object({id:require('zod').z.number().int(),ok:require('zod').z.boolean(),error:require('zod').z.string().max(500).optional()}).parse(input);const pending=uiCommands.get(data.id);if(!pending)return;clearTimeout(pending.timer);uiCommands.delete(data.id);data.ok?pending.resolve('App command completed.'):pending.reject(new Error(data.error||'App command failed.'));});
handle('app:restart-update',async()=>{
  if(process.argv.includes('--smoke-test'))throw new Error('Restart is disabled in integration tests.');
  if(restarting)throw new Error('An update build is already running.');
  if(voice.active())throw new Error('Finish your voice command before restarting.');
  if(app.isPackaged)throw new Error('Rebuilding is available in the development app only.');
  restarting=true;
  try{
    await buildUpdate(path.join(__dirname,'..'));
    saveUpdateReceipt(updateReceipt,runningFingerprint,buildFingerprint(path.join(__dirname,'..')),newReleaseItems(runningNotes,releaseNotes(path.join(__dirname,'..'))));
    app.relaunch({execPath:process.execPath,args:[app.getAppPath()]});
    setTimeout(()=>{holdShortcut.stop();voice.forget();twitch.disconnect();void obs.client.disconnect();app.quit();},200);
    return {restarting:true};
  }catch(error){restarting=false;throw error;}
});
handle('obs:preset:save',x=>obsPreset.save(x));
handle('obs:preset:remove',x=>obsPreset.remove(require('zod').z.string().min(1).parse(x)));
handle('obs:preset:connect',x=>{const saved=obsPreset.read(require('zod').z.string().min(1).parse(x));if(!saved)throw new Error('Save an OBS preset first.');return obs.connect({host:'127.0.0.1',port:saved.port,password:saved.password});});
handle('obs:connect', x => obs.connect(x)); handle('obs:disconnect', () => obs.disconnect());
handle('obs:refresh', () => obs.exclusive(() => obs.refresh())); handle('obs:items', x => obs.exclusive(() => obs.items(x)));
handle('obs:select', async x => {layoutAssist.stop();if(voice.active())voice.cancel();return obs.select(x); }); handle('obs:act', async x => {await layoutAssist.yieldToManual();voice.cancel();return obs.act(x); }); handle('obs:preview', x => obs.preview(x));
handle('obs:program-preview', () => obs.programPreview());
handle('obs:smooth:prepare', async () => { const result = await obs.prepareSmoothPreview(); videoAllowed = true; return result; });
handle('twitch:begin', x => twitch.begin(x)); handle('twitch:disconnect', () => twitch.disconnect());
handle('twitch:open', async () => { if (!twitch.verification) throw new Error('Start Twitch authorization first.'); await shell.openExternal(twitch.verification); });
handle('voice:configure', x => {voice.configure(x);enableVoiceShortcut();voice.emit();});
handle('voice:meter',level=>{if(typeof level!=='number'||!Number.isFinite(level)||level<0||level>1)throw new Error('Invalid microphone level.');if(['connecting','listening'].includes(voice.state.status))voiceOverlay?.updateLevel(level);});
handle('voice:latch',value=>{voice.state.latched=value===true;voice.emit();});
handle('app:voice-startup:status',()=>({...voiceStartup.status(),background:backgroundVoice}));
handle('app:voice-startup:set',enabled=>{if(process.argv.includes('--smoke-test'))throw Error('Startup changes are disabled in integration tests.');const result=voiceStartup.set(enabled);window?.webContents.setBackgroundThrottling(!result.enabled);return result;});
handle('app:appearance',theme=>{if(!['dark','light'].includes(theme))throw new Error('Invalid theme.');voiceOverlay?.setTheme(theme);});
handle('annotations:copy',text=>{if(typeof text!=='string'||text.length>1000000)throw new Error('Feedback is too large to copy. Download the JSON instead.');const data=JSON.parse(text);if(data.product!=='SceneSense'||!Array.isArray(data.annotations))throw new Error('Invalid annotation feedback.');clipboard.writeText(text);});
handle('news:open',async value=>{const url=require('./news.cjs').safeSourceUrl(value);if(!url||url.length>2048)throw new Error('Invalid news source link.');await shell.openExternal(url);});
handle('sense:news',text=>{if(typeof text!=='string'||text.length>1200)throw new Error('Invalid news request.');if(!conversation.enabled)throw new Error('Enable Conversational Sense to request news.');return conversation.respond({text});});
handle('sense:conversation',enabled=>{conversation.setEnabled(enabled);voice.state.conversational=enabled;voice.emit();});
handle('voice:catalog',()=>require('./app-actions.cjs').appActions);
handle('voice:forget', () => {layoutAssist.stop();voice.forget();});
handle('voice:start', () => {if(restarting)throw new Error('Wait for the app update to finish.');return voice.start();}); handle('voice:audio', x => voice.audio(x));
handle('voice:finish', () => voice.finish()); handle('voice:cancel', () => {if(voice.active())voice.cancel();});
app.whenReady().then(async () => {
  if(!process.argv.includes('--smoke-test')){voiceStartup.repair();setupExperiment=computerUsePreference().read();if(setupExperiment){setupAccessibilityPrior=app.isAccessibilitySupportEnabled();app.setAccessibilitySupportEnabled(true);}}
  backgroundVoice=!process.argv.includes('--smoke-test')&&process.argv.includes('--voice-background')&&voiceStartup.status().enabled;
  updateReceipt=path.join(app.getPath('userData'),process.argv.includes('--smoke-test')?'update-receipt-test.json':'update-receipt.json');
  if(!process.argv.includes('--smoke-test'))updateInfo=consumeUpdateReceipt(updateReceipt,runningFingerprint);
  obsPreset=new ObsPreset(path.join(app.getPath('userData'),process.argv.includes('--smoke-test')?'obs-preset-test.json':'obs-preset.json'),safeStorage);
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => contents === window?.webContents && contents.getURL() === entryUrl && permission === 'media' && (details.mediaType !== 'video' || videoAllowed));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === window?.webContents && contents.getURL() === entryUrl && permission === 'media' && (details.mediaTypes || []).length > 0 && (details.mediaTypes || []).every(x => x === 'audio' || (x === 'video' && videoAllowed))));
  window = new BrowserWindow({ show: false, width: 1380, height: 920, minWidth: 1000, minHeight: 720, backgroundColor: '#F7F7F8', autoHideMenuBar:true, title: 'SceneSense', icon:path.join(__dirname,'..','public','scenesense-icon.png'), webPreferences: { autoplayPolicy:'no-user-gesture-required',backgroundThrottling: !process.argv.includes('--smoke-test')&&!voiceStartup.status().enabled, preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => {if(voice.active())voice.cancel();});
  voiceOverlay=require('./voice-overlay.cjs').createVoiceOverlay({BrowserWindow,screen,ipcMain,deferGreeting:!process.argv.includes('--smoke-test'),onFinish:()=>publish({kind:'voice-force-finish'}),onOpenVoice:()=>{if(window&&!window.isDestroyed()){window.show();window.focus();void executeAppAction('nav_voice','').catch(()=>{});}},hidden:process.argv.includes('--smoke-test')});
  if(!process.argv.includes('--smoke-test')){
    voiceTray=new Tray(nativeImage.createFromPath(path.join(__dirname,'..','public','scenesense-icon.png')).resize({width:16,height:16}));
    voiceTray.setToolTip('SceneSense · Ctrl+Shift+Z to dictate');
    const open=()=>{if(window.isMinimized())window.restore();window.show();window.focus();};
    voiceTray.setContextMenu(Menu.buildFromTemplate([{label:'Open SceneSense',click:open},{type:'separator'},{label:'Quit SceneSense',click:()=>app.quit()}]));
    voiceTray.on('double-click',open);
    window.on('close',event=>{if(!quitting&&voiceStartup.status().enabled){event.preventDefault();window.hide();}});
  }
  window.on('closed',()=>{startupController?.destroy();layoutAssist.stop();voiceOverlay?.destroy();});
  // Keep the chord active even without credentials, so setup failures can be
  // explained instead of silently swallowing the user's shortcut.
  enableVoiceShortcut();
  if(!process.argv.includes('--smoke-test')){
    try{
      const config=loadVoiceEnv(path.join(__dirname,'..','.env'));
      if(config)voice.configure(config);
    }catch{voice.state.error='Could not load voice credentials. Check your .env keys, provider and language, then restart SceneSense.';}
  }
  if (process.argv.includes('--smoke-test')) {
    require(process.argv.includes('--supervisor-smoke')?'../scripts/supervisor-desktop-checks.cjs':'../scripts/desktop-checks.cjs').run(window, app,voiceOverlay);
  }
  let appReady=false,introDone=process.argv.includes('--smoke-test');
  const reveal=()=>{if(!backgroundVoice&&appReady&&introDone&&!window.isDestroyed()&&!process.argv.includes('--smoke-test')){window.show();voiceOverlay?.startGreeting();}};
  window.once('ready-to-show',()=>{appReady=true;reveal();});
  const mainLoaded=window.loadFile(entry);
  if(!backgroundVoice&&!process.argv.includes('--smoke-test')){try{const startup=require('./startup.cjs');const canAnimate=await startup.startupGraphicsAvailable(app);await mainLoaded;if(!window||window.isDestroyed())return;if(startupInterrupted){introDone=true;reveal();}else{const theme=await window.webContents.executeJavaScript("document.documentElement.dataset.theme==='light'?'light':'dark'");startupController=startup.createStartup({BrowserWindow,ipcMain,canAnimate,theme,onComplete:()=>{introDone=true;reveal();}});finishStartup=startupController.finish;}}catch{introDone=true;reveal();}}
  if(!process.argv.includes('--smoke-test')){try{const saved=obsPreset.read();if(saved?.autoConnect)void obs.connect({host:'127.0.0.1',port:saved.port,password:saved.password}).catch(()=>{obs.state.presetError='Automatic connection failed. Open OBS and use Connect saved preset.';obs.emit();});}catch{}} 
});
app.on('will-quit',()=>{voiceTray?.destroy();holdShortcut.stop();});
app.on('window-all-closed', () => { holdShortcut.stop();voice.forget(); twitch.disconnect(); obs.client.disconnect(); app.quit(); });




const streamSetups=new (require('./stream-setups.cjs').StreamSetups)(obs,webcamBackground);
handle('obs:setup:capture',()=>streamSetups.capture());
handle('obs:setup:load',async input=>{await layoutAssist.yieldToManual();if(voice.active())voice.cancel();return streamSetups.load(input);});

const audioMixer=new (require('./audio-mixer.cjs').AudioMixer)(obs);
handle('obs:audio:list',()=>audioMixer.list());
handle('obs:audio:set',input=>audioMixer.set(input));

for(const event of ['InputVolumeChanged','InputMuteStateChanged'])obs.client.on(event,data=>publish({kind:'obs-audio-changed',...data}));

setupPointer=require('./setup-pointer-overlay.cjs').createSetupPointer();
setupAgent=new (require('./stream-setup-agent.cjs').StreamSetupAgent)({obs,getKey:()=>voice.key,publish,resolveTarget:request=>require('./setup-ui-target.cjs').resolveSetupTarget(window,screen,request),onPointerStatus:status=>{publish({kind:'setup-pointer-status',...status});try{require('node:fs').appendFileSync(path.join(app.getPath('userData'),'setup-pointer-diagnostics.jsonl'),JSON.stringify({at:new Date().toISOString(),...status})+'\n');}catch{}},uiAction:(action,text)=>executeAppAction(action,text),launchPreview:async(icon,options)=>{const result=await setupPointer.play(icon,options);if(!result?.acknowledged)throw Error(result?.reason||'Pointer renderer did not acknowledge the animation.');return result;},
 connect:async()=>{if(obs.state.status==='connected')return;let saved=obsPreset?.read();if(!saved){let config;try{config=JSON.parse(require('node:fs').readFileSync(path.join(app.getPath('appData'),'obs-studio','plugin_config','obs-websocket','config.json'),'utf8'));}catch{throw Error('Save an OBS connection preset or enable OBS WebSocket Server first.');}if(!config.server_enabled)throw Error('Enable OBS WebSocket Server in OBS Tools, then retry.');saved={port:config.server_port,password:config.auth_required?config.server_password:''};}await obs.connect({host:'127.0.0.1',port:saved.port,password:saved.password});},
 screenshot:async (target,profile)=>{const match={obs:/^OBS\b/i,game:/Asphalt.*Legends/i,scenesense:/^SceneSense$/};const sources=await require('electron').desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1280,height:800}});const found=sources.filter(x=>target==='game'?x.name.toLowerCase().includes((profile?.gameName||'Asphalt Legends').toLowerCase()):match[target]?.test(x.name));return found.length===1&&!found[0].thumbnail.isEmpty()?found[0].thumbnail.toDataURL():null;},
 verifyFrame:async source=>{const frame=await obs.call('GetSourceScreenshot',{sourceName:source,imageFormat:'png',imageWidth:160,imageHeight:90});const bitmap=nativeImage.createFromDataURL(frame.imageData).toBitmap();let visible=0;for(let i=0;i<bitmap.length;i+=4)if(bitmap[i]+bitmap[i+1]+bitmap[i+2]>45)visible++;return visible>160*90*.03;}
});
handle('setup:status',()=>({...setupAgent.state,enabled:setupExperiment}));
handle('setup:enable',enabled=>{const choice=require('zod').z.boolean().parse(enabled);computerUsePreference().set(choice);setupExperiment=choice;if(setupExperiment){if(setupAccessibilityPrior===undefined)setupAccessibilityPrior=app.isAccessibilitySupportEnabled();app.setAccessibilitySupportEnabled(true);}else{setupAgent.cancel();setupPointer?.stop();if(setupAccessibilityPrior!==undefined){app.setAccessibilitySupportEnabled(setupAccessibilityPrior);setupAccessibilityPrior=undefined;}}return {...setupAgent.state,enabled:setupExperiment};});
handle('setup:start',profile=>{if(!setupExperiment)throw Error('Enable Experimental computer setup first.');return setupAgent.run(profile);});
handle('setup:stop',()=>{setupAgent.cancel();return {stopped:true};});
app.on('before-quit',()=>{setupAgent?.cancel();setupPointer?.destroy();});

function readGameProfiles(){try{return require('zod').z.array(require('./game-profile.cjs').profileSchema).parse(JSON.parse(require('node:fs').readFileSync(path.join(app.getPath('userData'),'game-profiles.json'),'utf8')));}catch{return [require('./game-profile.cjs').asphalt];}}
handle('setup:profiles',()=>readGameProfiles());
handle('setup:profile:save',input=>{const profile=require('./game-profile.cjs').profileSchema.parse(input);const profiles=readGameProfiles().filter(x=>x.gameName.toLowerCase()!==profile.gameName.toLowerCase());profiles.push(profile);require('node:fs').writeFileSync(path.join(app.getPath('userData'),'game-profiles.json'),JSON.stringify(profiles));return profiles;});

const obsOutputs=new (require('./obs-outputs.cjs').ObsOutputs)(obs);
handle('obs:outputs:status',()=>obsOutputs.status());
handle('obs:outputs:set',input=>obsOutputs.set(input));

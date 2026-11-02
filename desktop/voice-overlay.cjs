const path=require('node:path');
const {pathToFileURL}=require('node:url');
function startupGreeting(hour=new Date().getHours(),random=Math.random()){
  const salutation=hour<5?'Still up?':hour<12?'Good morning!':hour<17?'Good afternoon!':'Good evening!';
  const lines=['Up for a game?','Your biggest fan is here.','When’s the next live stream?','You play. I’ll keep an eye on the layout.','Ready for another good run?','Achievement unlocked: you showed up.','POV: your stream has a tiny producer.','One does not simply stream alone.','It’s dangerous to stream alone. Take Sense.','This is the way. To a clearer stream.','Main character energy. Tiny producer on duty.'];
  return salutation+' '+lines[Math.min(lines.length-1,Math.max(0,Math.floor(random*lines.length)))];
}
function indicatorState(state){
  if(state.status==='connecting')return {visible:true,orb:'listening',label:'Listening'};
  if(state.status==='listening')return {visible:true,orb:'listening',label:'Listening…'};
  if(state.status==='finishing')return {visible:true,orb:'working',label:'Finishing…'};
  if(state.status==='error')return {visible:true,orb:'breathing',label:'Voice needs attention',dismissAfter:5000};
  if(state.action)return {visible:true,orb:'breathing',label:'Applied in OBS',dismissAfter:1600};
  return {visible:false,orb:'breathing',label:''};
}
function createVoiceOverlay({BrowserWindow,screen,ipcMain,onFinish,onOpenVoice,hidden=false,deferGreeting=false}){
  const entry=path.join(__dirname,'..','dist','overlay.html');
  const width=340;
  const overlay=new BrowserWindow({width,height:88,show:false,frame:false,transparent:true,resizable:false,movable:false,focusable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:true,webPreferences:{preload:path.join(__dirname,'overlay-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  overlay.setAlwaysOnTop(true,'screen-saver');overlay.setIgnoreMouseEvents(true);overlay.setContentProtection(true);
  overlay.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  overlay.webContents.setWindowOpenHandler(()=>({action:'deny'}));overlay.webContents.on('will-navigate',e=>e.preventDefault());
  let state=indicatorState({}),ready=false,timer,greeted=false,theme,replyTimer,lastVoice={};
  function send(){if(ready&&!overlay.isDestroyed())overlay.webContents.send('voice:indicator',{...state,theme:theme||'dark'});}
  const onReady=event=>{if(event.sender!==overlay.webContents||event.senderFrame!==overlay.webContents.mainFrame||event.senderFrame.url!==pathToFileURL(entry).href)return;ready=true;maybeGreet();send();};
  const finish=event=>{if(event.sender===overlay.webContents&&event.senderFrame===overlay.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(entry).href&&state.latched)onFinish?.();};const openVoice=event=>{if(event.sender===overlay.webContents&&event.senderFrame===overlay.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(entry).href&&state.reply){onOpenVoice?.();clearReply();}};ipcMain.on('voice:open-results',openVoice);ipcMain.on('voice:indicator-finish',finish);ipcMain.on('voice:indicator-ready',onReady);overlay.loadFile(entry);
  function maybeGreet(){if(ready&&theme&&!greeted&&!hidden&&!deferGreeting){greeted=true;if(!state.visible)greet();}}
  function setTheme(value){theme=value;maybeGreet();send();}
  function greet(){
    if(overlay.isDestroyed())return;
    state={visible:true,orb:'breathing',label:'Sense',greeting:startupGreeting()};overlay.setSize(width,190);overlay.setIgnoreMouseEvents(true);
    const {workArea}=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());overlay.setPosition(Math.round(workArea.x+(workArea.width-width)/2),workArea.y+10);send();overlay.showInactive();
    timer=setTimeout(()=>{if(overlay.isDestroyed()||!state.greeting)return;state={visible:false,orb:'breathing',label:''};send();overlay.hide();overlay.setSize(width,88);},8000);
  }
  function clearReply(){clearTimeout(replyTimer);if(!state.reply||overlay.isDestroyed())return;const owned=state.replyOwned;delete state.reply;delete state.replyOwned;delete state.setup;if(owned){state.visible=false;overlay.hide();}overlay.setSize(width,88);overlay.setIgnoreMouseEvents(!state.latched);send();}
  function showReply(text){if(overlay.isDestroyed())return;clearTimeout(timer);clearTimeout(replyTimer);const owned=!['connecting','listening','finishing'].includes(lastVoice.status);state={...state,...(!owned?indicatorState(lastVoice):{}),working:false,setup:undefined,visible:true,reply:text,replyOwned:owned,greeting:undefined,...(owned?{orb:'breathing',label:'Sense'}:{})};overlay.setSize(width,280);overlay.setIgnoreMouseEvents(false);if(owned){const {workArea}=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());overlay.setPosition(Math.round(workArea.x+(workArea.width-width)/2),workArea.y+10);}send();if(!hidden)overlay.showInactive();replyTimer=setTimeout(clearReply,9000);}
  function setWorking(news=false){if(overlay.isDestroyed())return;clearTimeout(timer);clearTimeout(replyTimer);const visible=state.visible;state={visible:true,orb:news?'searching':'working',label:news?'Searching news…':'Sense is thinking…',working:true,latched:lastVoice.latched===true&&['connecting','listening'].includes(lastVoice.status)};overlay.setSize(width,88);overlay.setIgnoreMouseEvents(!state.latched);if(!visible){const {workArea}=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());overlay.setPosition(Math.round(workArea.x+(workArea.width-width)/2),workArea.y+10);}send();if(!hidden)overlay.showInactive();}
  function showSetup(progress){
    if(overlay.isDestroyed())return;
    const steps=progress.step===0?[]:[...(state.setup?.steps||[])];
    if(progress.message&&steps.at(-1)!==progress.message)steps.push(progress.message);
    showReply(progress.message);clearTimeout(replyTimer);
    state.setup={working:progress.status==='running',steps:steps.slice(-6),label:progress.status==='running'?'Preparing stream…':progress.status==='ready'?'Setup ready':'Setup needs attention'};
    overlay.setSize(width,390);send();
    if(progress.status!=='running')replyTimer=setTimeout(clearReply,9000);
  }
  function clearWorking(){if(!state.working)return;state.working=false;update(lastVoice);}
  function updateLevel(level){if(ready&&!overlay.isDestroyed())overlay.webContents.send('voice:meter',level);}
  function update(voice){
    lastVoice=voice;if(overlay.isDestroyed())return;
    if(state.working&&['idle','listening','finishing'].includes(voice.status)){state.latched=voice.latched===true&&voice.status==='listening';overlay.setIgnoreMouseEvents(!state.latched);send();return;}
    if(state.greeting&&voice.status==='idle'&&!voice.action&&!voice.error)return;
    if(state.greeting||state.reply)overlay.setSize(width,88);clearTimeout(replyTimer);
    if(!['connecting','listening'].includes(voice.status))updateLevel(0);
    const previous=state;state={...indicatorState(voice),latched:voice.latched===true&&['connecting','listening'].includes(voice.status)};overlay.setIgnoreMouseEvents(!state.latched);clearTimeout(timer);send();
    if(!state.visible){overlay.hide();return;}
    if(!previous.visible){const {workArea}=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());overlay.setPosition(Math.round(workArea.x+(workArea.width-width)/2),workArea.y+10);}
    if(!hidden)overlay.showInactive();
    if(state.dismissAfter)timer=setTimeout(()=>{if(overlay.isDestroyed())return;state={...state,visible:false};send();overlay.hide();},state.dismissAfter);
  }
  function destroy(){ipcMain.removeListener('voice:open-results',openVoice);clearTimeout(replyTimer);ipcMain.removeListener('voice:indicator-finish',finish);clearTimeout(timer);ipcMain.removeListener('voice:indicator-ready',onReady);if(!overlay.isDestroyed())overlay.destroy();}
  return {update,updateLevel,showSetup,showReply,clearReply,setWorking,clearWorking,destroy,setTheme,startGreeting(){deferGreeting=false;maybeGreet();},window:overlay};
}
module.exports={startupGreeting,indicatorState,createVoiceOverlay};

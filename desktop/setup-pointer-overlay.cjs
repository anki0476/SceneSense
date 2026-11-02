const {BrowserWindow,ipcMain,screen}=require('electron');
const path=require('node:path');
function createSetupPointer(){let window,pending,last,readyResolve,readyTimer;let sequence=0;
 function settle(acknowledged=false){if(pending){clearTimeout(pending.timer);pending.resolve({shown:true,acknowledged});pending=null;}if(window&&!window.isDestroyed())window.hide();}
 function stop(){settle();last=null;if(window&&!window.isDestroyed())window.hide();}
 ipcMain.on('setup-pointer:ready',event=>{if(window&&!window.isDestroyed()&&event.sender===window.webContents){clearTimeout(readyTimer);readyResolve?.();readyResolve=null;}});
 ipcMain.on('setup-pointer:done',(event,id)=>{if(window&&!window.isDestroyed()&&event.sender===window.webContents&&pending?.id===id)settle(true);});
 async function play(target,{signal}={}){settle();if(signal?.aborted)return;if(!target.press||target.activity||!['x','y','width','height'].every(key=>Number.isFinite(target[key]))||target.width<=0||target.height<=0||target.width>4096||target.height>2160)return {shown:false,reason:'Target bounds are invalid.'};if(!window||window.isDestroyed()){
  window=new BrowserWindow({show:false,frame:false,transparent:true,hasShadow:false,skipTaskbar:true,focusable:false,alwaysOnTop:true,resizable:false,webPreferences:{preload:path.join(__dirname,'setup-pointer-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  const rendererReady=new Promise((resolve,reject)=>{readyResolve=resolve;readyTimer=setTimeout(()=>{readyResolve=null;reject(Error('Pointer renderer did not initialize.'));},5000);});
  window.setIgnoreMouseEvents(true,{forward:true});window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});window.setAlwaysOnTop(true,'screen-saver');window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());await Promise.all([window.loadFile(path.join(__dirname,'..','dist','setup-pointer.html')),rendererReady]);
 }
 if(signal?.aborted)return;
 target={...target,...screen.screenToDipRect(null,{x:Math.round(target.x),y:Math.round(target.y),width:Math.round(target.width),height:Math.round(target.height)})};
 const display=screen.getDisplayNearestPoint({x:Math.round(target.x),y:Math.round(target.y)});window.setBounds(display.bounds);window.setAlwaysOnTop(true,'screen-saver');window.showInactive();window.moveTop();
 const from=last?{x:last.x-display.bounds.x,y:last.y-display.bounds.y}:undefined;last={x:target.x+target.width/2,y:target.y+target.height/2};
 return await new Promise(resolve=>{pending={id:++sequence,resolve,timer:setTimeout(settle,4000)};signal?.addEventListener('abort',stop,{once:true});window.webContents.send('setup-pointer:play',{...target,id:pending.id,from,x:target.x-display.bounds.x,y:target.y-display.bounds.y});}).finally(()=>signal?.removeEventListener('abort',stop));}
 function destroy(){clearTimeout(readyTimer);readyResolve?.();readyResolve=null;stop();window?.destroy();}
 return {play,stop,destroy};
}
module.exports={createSetupPointer};

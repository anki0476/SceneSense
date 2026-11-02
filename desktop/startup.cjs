const path=require('node:path');const {pathToFileURL}=require('node:url');
function startupGraphicsAvailable(app){
 const enabled=()=>{const features=app.getGPUFeatureStatus();return features.webgl==='enabled'&&features.gpu_compositing==='enabled';};
 if(enabled())return Promise.resolve(true);
 return new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);app.removeListener('gpu-info-update',finish);resolve(enabled());};app.once('gpu-info-update',finish);timer=setTimeout(finish,750);});
}
function createStartup({BrowserWindow,ipcMain,onComplete,canAnimate=false,theme='dark',hidden=false,setTimer=setTimeout,clearTimer=clearTimeout}){
 const entry=path.join(__dirname,'..','dist','startup.html');let finished=false,watchdog;
 const window=new BrowserWindow({width:640,height:480,show:false,frame:false,resizable:false,backgroundColor:theme==='light'?'#ffffff':'#000000',title:'SceneSense',icon:path.join(__dirname,'..','public','scenesense-icon.png'),webPreferences:{preload:path.join(__dirname,'startup-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,additionalArguments:[`--startup-graphics=${canAnimate?1:0}`,...(theme==='light'?['--startup-theme=light']:[])]}});
 const valid=event=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(entry).href;
 function clean(){clearTimer(watchdog);ipcMain.removeListener('startup:done',done);}
 function finish(){if(finished)return;finished=true;clean();if(!window.isDestroyed())window.destroy();onComplete();}
 function done(event){if(valid(event))finish();}
 ipcMain.on('startup:done',done);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('render-process-gone',finish);window.webContents.on('did-fail-load',finish);window.on('unresponsive',finish);window.on('closed',finish);window.once('ready-to-show',()=>{if(!finished&&!hidden)window.show();});
 watchdog=setTimer(finish,8000);void window.loadFile(entry).catch(finish);
 return {window,finish,destroy(){if(finished)return;finished=true;clean();if(!window.isDestroyed())window.destroy();}};
}
module.exports={createStartup,startupGraphicsAvailable};

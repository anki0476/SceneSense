// Explicit cloud-only visual check using a generated test scene. Never captures
// the user's screen, OBS sources, microphone, webcam or chat.
const {app,BrowserWindow,nativeImage}=require('electron');
const {cropEvidence}=require('../desktop/layout-images.cjs');
const fs=require('node:fs');const path=require('node:path');
const {loadVoiceEnv}=require('../desktop/env-config.cjs');
const {inspectLayout}=require('../desktop/layout-vision.cjs');
app.whenReady().then(async()=>{
  let window;
  try{
    const config=loadVoiceEnv(path.join(__dirname,'..','.env'));if(!config)throw new Error();
    window=new BrowserWindow({show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await window.loadURL('data:text/html,<canvas width="960" height="540"></canvas>');
    const image=await window.webContents.executeJavaScript(`(()=>{const canvas=document.querySelector('canvas'),c=canvas.getContext('2d');c.fillStyle='#23324b';c.fillRect(0,0,960,540);c.fillStyle='#344159';c.beginPath();c.moveTo(150,540);c.lineTo(400,150);c.lineTo(540,150);c.lineTo(720,540);c.fill();c.fillStyle='#0d1525';c.fillRect(15,15,210,110);c.fillRect(720,15,225,110);c.fillRect(15,405,210,120);c.fillStyle='white';c.font='bold 27px Arial';c.fillText('POSITION',28,50);c.font='bold 42px Arial';c.fillText('1 / 8',28,103);c.font='bold 26px Arial';c.fillText('SPEED',740,50);c.font='bold 37px Arial';c.fillText('240 KM/H',737,102);c.font='bold 22px Arial';c.fillText('MINIMAP',30,435);c.strokeStyle='#75caff';c.lineWidth=8;c.beginPath();c.moveTo(35,495);c.lineTo(110,458);c.lineTo(190,490);c.stroke();c.fillStyle='#a885ff';c.fillRect(445,370,60,95);c.fillStyle='white';c.font='18px Arial';c.fillText('SYNTHETIC TEST SCENE',365,230);return canvas.toDataURL('image/png');})()`);
    const artifact=path.join(__dirname,'..','.artifacts');fs.mkdirSync(artifact,{recursive:true});fs.writeFileSync(path.join(artifact,'layout-provider-fixture.png'),Buffer.from(image.split(',')[1],'base64'));
    const candidates={'top-left':{x:.016,y:.028,width:.23,height:.22},'top-right':{x:.75,y:.028,width:.23,height:.22},'bottom-left':{x:.016,y:.75,width:.23,height:.22},'bottom-right':{x:.75,y:.75,width:.23,height:.22}};
    const blockedRects={current:candidates['top-right'],candidates};
    const blocked=await inspectLayout(config.openaiKey,{image,rects:blockedRects,crops:cropEvidence(nativeImage,image,blockedRects)},AbortSignal.timeout(12000));
    console.log('Synthetic obstruction result: '+JSON.stringify(blocked));
    if(!blocked.actionable||blocked.position!=='bottom-right')throw new Error();
    console.log('PASS: Synthetic HUD obstruction identified; clear bottom-right corner recommended.');
    const clearRects={current:candidates['bottom-right'],candidates};
    const clear=await inspectLayout(config.openaiKey,{image,rects:clearRects,crops:cropEvidence(nativeImage,image,clearRects)},AbortSignal.timeout(12000));
    if(clear.actionable||clear.position!=='keep')throw new Error();
    console.log('PASS: Clear placement kept. Two live image requests; no user capture and no OBS writes.');
  }catch(error){console.error('FAIL: Image access or expected synthetic-scene classification. No user content captured or OBS changed.');if(/^Image check failed \(HTTP \d+\)/.test(error.message))console.error(error.message);process.exitCode=1;}
  finally{window?.destroy();app.exit(process.exitCode||0);}
});

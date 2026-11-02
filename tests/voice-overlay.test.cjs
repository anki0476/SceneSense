const {test}=require('node:test');
const assert=require('node:assert/strict');
const {indicatorState}=require('../desktop/voice-overlay.cjs');
test('voice indicator follows capture lifecycle without exposing speech or credentials',()=>{
  assert.equal(indicatorState({status:'idle'}).visible,false);
  assert.equal(indicatorState({status:'connecting'}).orb,'listening');
  assert.equal(indicatorState({status:'listening'}).orb,'listening');
  assert.equal(indicatorState({status:'finishing'}).orb,'working');
  assert.equal(indicatorState({status:'idle',action:'top-right'}).dismissAfter,1600);
  const error=indicatorState({status:'error',error:'private error',transcript:'private speech',key:'secret'});
  assert.equal(error.label,'Voice needs attention');assert.equal(error.dismissAfter,5000);
  assert.ok(!JSON.stringify(error).includes('private'));assert.ok(!JSON.stringify(error).includes('secret'));
});

const {EventEmitter}=require('node:events');
const {pathToFileURL}=require('node:url');const path=require('node:path');
function overlayFixture(){
 const {createVoiceOverlay}=require('../desktop/voice-overlay.cjs');const ipcMain=new EventEmitter();let opened=0;
 class Window{constructor(){this.gone=false;this.sent=[];this.webContents=new EventEmitter();this.webContents.mainFrame={url:pathToFileURL(path.resolve('dist/overlay.html')).href};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(channel,state)=>this.sent.push({channel,state:{...state}});}setAlwaysOnTop(){}setIgnoreMouseEvents(value){this.ignored=value;}setContentProtection(value){this.captureProtected=value;}setVisibleOnAllWorkspaces(){}loadFile(){}setSize(){}setPosition(){}showInactive(){}hide(){}isDestroyed(){return this.gone;}destroy(){this.gone=true;}}
 const overlay=createVoiceOverlay({BrowserWindow:Window,screen:{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}})},ipcMain,hidden:true,onOpenVoice:()=>opened++});
 const event={sender:overlay.window.webContents,senderFrame:overlay.window.webContents.mainFrame};ipcMain.emit('voice:indicator-ready',event);
 return {overlay,ipcMain,event,getOpened:()=>opened,last:()=>overlay.window.sent.filter(x=>x.channel==='voice:indicator').at(-1)?.state};
}
test('news progress remains visible after voice capture ends and yields on cancellation',()=>{const f=overlayFixture();try{f.overlay.update({status:'listening',latched:true});f.overlay.setWorking(true);assert.equal(f.last().orb,'searching');assert.equal(f.last().latched,true);f.overlay.update({status:'idle'});assert.equal(f.last().visible,true);assert.equal(f.last().working,true);f.overlay.clearWorking();assert.equal(f.last().visible,false);}finally{f.overlay.destroy();}});
test('reply summary has a source-page action restricted to the overlay frame',()=>{const f=overlayFixture();try{f.overlay.update({status:'idle'});f.overlay.setWorking(true);f.overlay.showReply('Summary. Full briefing & sources: Voice.');assert.equal(f.last().working,false);assert.equal(f.last().replyOwned,true);assert.equal(f.overlay.window.ignored,false);f.ipcMain.emit('voice:open-results',{sender:{},senderFrame:{}});assert.equal(f.getOpened(),0);f.ipcMain.emit('voice:open-results',f.event);assert.equal(f.getOpened(),1);assert.equal(f.last().visible,false);}finally{f.overlay.destroy();}});
test('long response bubble uses quick-take summary and points to the full result',()=>{const {bubbleSummary}=require('../desktop/reply-summary.cjs');const summary=bubbleSummary('Quick take: Twitch announced a new creator feature.\n\n1. Long story. '+ 'More details. '.repeat(30),true);assert.match(summary,/Twitch announced a new creator feature/);assert.match(summary,/Full briefing.*Voice/);assert.ok(summary.length<180);assert.equal(summary.includes('Long story'),false);assert.equal(bubbleSummary('Hey!'), 'Hey!');});

test('notch permits screen recording for demos',()=>{const f=overlayFixture();try{assert.equal(f.overlay.window.captureProtected,false);}finally{f.overlay.destroy();}});

const assert=require('node:assert/strict');
async function run(window,app){
 const deadline=setTimeout(()=>app.exit(1),30000);
 window.webContents.once('did-finish-load',async()=>{
  try{
   const ipc=async(channel,input)=>{const result=await window.webContents.executeJavaScript(`window.scenesense.invoke(${JSON.stringify(channel)},${JSON.stringify(input)??'undefined'})`);if(!result.ok)throw Error(result.error);return result.data;};
   const port=Number(process.argv.find(x=>x.startsWith('--fixture-port=')).split('=')[1]);
   await ipc('obs:connect',{port,password:'fixture-password'});
   await ipc('obs:items','Fixture Game');await ipc('obs:select',{scene:'Fixture Game',webcamId:1,gameId:2});
   let state=await ipc('supervisor:check');assert.equal(state.microphone,'Fixture Mic');assert.equal(state.issues.length,0);
   await ipc('obs:audio:set',{inputName:'Fixture Mic',muted:true});await new Promise(r=>setTimeout(r,150));
   state=await ipc('supervisor:check');assert.ok(state.issues.some(x=>x.id==='mic-muted'));assert.ok(state.issues.some(x=>x.id==='webcam-hidden'));
   const ambiguous=await window.webContents.executeJavaScript("window.scenesense.invoke('supervisor:repair','current')");assert.equal(ambiguous.ok,false);
   state=await ipc('supervisor:repair','mic-muted');assert.ok(!state.issues.some(x=>x.id==='mic-muted'));
   state=await ipc('supervisor:repair','webcam-hidden');assert.equal(state.issues.length,0);assert.match(state.lastRepair,/Verified/);
   state=await ipc('supervisor:video',true);assert.equal(state.videoEnabled,true);assert.equal(state.videoStatus,'sampling');
   const ui=await window.webContents.executeJavaScript("({panel:!!document.querySelector('.stream-supervisor'),switch:document.querySelector('.stream-supervisor button[role=switch]')?.getAttribute('aria-checked')})");assert.equal(ui.panel,true);assert.equal(ui.switch,'true');
   await ipc('supervisor:video',false);await ipc('obs:disconnect');state=await ipc('supervisor:check');assert.equal(state.status,'offline');
   console.log('Supervisor desktop integration passed: real renderer/preload/IPC, simulated OBS connection, microphone and hidden-source faults, ambiguous repair rejection, verified repairs, native image sampling, UI switch, and disconnection. GPU disabled; no real OBS, game, camera or paid provider used.');
   clearTimeout(deadline);app.exit(0);
  }catch(error){console.error(error.stack);clearTimeout(deadline);app.exit(1);}
 });
}
module.exports={run};

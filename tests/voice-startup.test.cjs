const {test}=require('node:test');const assert=require('node:assert/strict');
const {createVoiceStartup}=require('../desktop/voice-startup.cjs');
test('startup reads never register a login item; changes use matching hidden-launch arguments',()=>{
 let saved=false,reads=[],writes=[];
 const app={isPackaged:false,getAppPath:()=> 'C:/Scene Sense',getLoginItemSettings:options=>{reads.push(options);return {openAtLogin:saved};},setLoginItemSettings:options=>{writes.push(options);saved=options.openAtLogin;}};
 const startup=createVoiceStartup(app,{executable:'C:/Electron/electron.exe'});
 assert.equal(startup.status().enabled,false);assert.equal(writes.length,0);
 if(['win32','darwin'].includes(process.platform)){
  assert.equal(startup.set(true).enabled,true);assert.equal(writes[0].args.at(-1),'--voice-background');assert.match(writes[0].args[0],/Scene Sense/);assert.deepEqual(writes[0].args,reads.at(-1).args);
  assert.equal(startup.set(false).enabled,false);assert.equal(writes[1].openAtLogin,false);
 }
 assert.throws(()=>startup.set('true'));assert.equal(writes.length,['win32','darwin'].includes(process.platform)?2:0);
});
test('packaged startup launches its executable directly without a development path',()=>{
 let read;const startup=createVoiceStartup({isPackaged:true,getLoginItemSettings:options=>{read=options;return {};}});
 assert.equal(startup.status().enabled,false);assert.deepEqual(read.args,['--voice-background']);
});
test('Windows named entry overrides broken argument readback and preserves Task Manager disabling',()=>{
 let enabled=true,writes=[];const app={isPackaged:false,getAppPath:()=> 'C:/Scene Sense',getLoginItemSettings:()=>({openAtLogin:false,launchItems:[{name:'SceneSense Voice',enabled,args:['"C:/Scene Sense"']}]}),setLoginItemSettings:options=>writes.push(options)};
 const startup=createVoiceStartup(app);assert.equal(startup.status().enabled,true);startup.repair();assert.deepEqual(writes[0].args,['C:/Scene Sense','--voice-background']);
 enabled=false;assert.equal(startup.status().enabled,false);startup.repair();assert.equal(writes.length,1);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { ObsService, destination, restorable } = require('../desktop/obs.cjs');
const { isBlocked } = require('../desktop/twitch.cjs');
const initial = { positionX: 50, positionY: 60, scaleX: .5, scaleY: .5, width: 320, height: 180, rotation: 0, alignment: 5, boundsType: 'OBS_BOUNDS_NONE' };
const video = { baseWidth: 1920, baseHeight: 1080 };
class Client extends EventEmitter {
  constructor() { super(); this.transform = { ...initial }; this.writes = 0; this.scene = 'Game'; }
  async disconnect() {}
  async connect() {}
  async call(type, data) {
    if (type === 'GetSceneList') return { scenes: [{sceneName:'Game'}], currentProgramSceneName: this.scene };
    if (type === 'GetVideoSettings') return video;
    if (type === 'GetCurrentProgramScene') return { currentProgramSceneName: this.scene };
    if (type === 'GetSceneItemList') return { sceneItems: [1,2].map(id => ({ sceneItemId:id, sourceName:`Source${id}`, sceneItemEnabled:true, sourceType:'OBS_SOURCE_TYPE_INPUT' })) };
    if (type === 'GetSceneItemTransform') return { sceneItemTransform: { ...this.transform } };
    if (type === 'SetSceneItemTransform') { this.writes++; Object.assign(this.transform, data.sceneItemTransform); this.transform.width = 640 * this.transform.scaleX; this.transform.height = 360 * this.transform.scaleY; return {}; }
    throw new Error(type);
  }
}
async function setup() { const client = new Client(); const service = new ObsService(client, () => {}); await service.connect({port:4455,password:''}); await service.items('Game'); await service.select({scene:'Game',webcamId:1,gameId:2}); return {client, service}; }
test('positions use rendered size and canvas margins', () => assert.deepEqual(destination(initial, video, 'bottom-right'), { positionX:1576, positionY:876, scaleX:.5, scaleY:.5 }));

test('layout evidence maps camera into an offset scaled game, and rejects external layout changes',async()=>{
  const {service,client}=await setup();const originalCall=client.call.bind(client);
  service.state.items.find(x=>x.id===2).kind='game_capture';
  let game={...initial,positionX:100,positionY:50,width:1600,height:900,scaleX:1,scaleY:1};
  client.call=async(type,data)=>type==='GetSceneItemTransform'&&data.sceneItemId===2?{sceneItemTransform:{...game}}:type==='GetSourceScreenshot'?{imageData:'data:image/png;base64,fixture'}:originalCall(type,data);
  const sample=await service.layoutSample();sample.checkpoint.canApply=()=>true;
  assert.equal(sample.rects.current.x,(50-100)/1600);assert.equal(sample.rects.current.width,.2);
  client.transform.positionX=80;await assert.rejects(service.applyVoicePlan(sample.checkpoint,{position:'bottom-right',size:'keep'}),/layout changed/);assert.equal(client.writes,0);
  client.transform.positionX=50;game.width=1500;await assert.rejects(service.applyVoicePlan(sample.checkpoint,{position:'bottom-right',size:'keep'}),/layout changed/);assert.equal(client.writes,0);
  game.width=1600;sample.checkpoint.canApply=()=>false;await assert.rejects(service.applyVoicePlan(sample.checkpoint,{position:'bottom-right',size:'keep'}),/cancelled/);assert.equal(client.writes,0);
  sample.checkpoint.canApply=()=>true;
  const moved=await service.applyVoicePlan(sample.checkpoint,{position:'bottom-right',size:'keep'});
  const undo={...sample.checkpoint,expectedTransform:moved,capturedAt:Date.now()};
  await service.applyVoicePlan(undo,{position:'keep',size:'keep'});assert.equal(client.transform.positionX,50);assert.equal(client.transform.positionY,60);
  client.transform.positionX=99;await assert.rejects(service.applyVoicePlan(undo,{position:'keep',size:'keep'}),/layout changed/);assert.equal(client.writes,16);
});
test('resize cannot place the webcam outside the canvas', () => { const target = destination({...initial, positionX:1600, positionY:900}, video, 'larger'); assert.ok(target.positionX + 352 <= 1896); assert.ok(target.positionY + 198 <= 1056); });
test('unsupported transforms fail rather than guessing', () => { for (const t of [{rotation:45},{alignment:0},{boundsType:'OBS_BOUNDS_STRETCH'},{scaleX:-1}]) assert.throws(() => destination({...initial,...t},video,'top-right')); });
test('move is verified and original layout can be restored', async () => { const {service,client} = await setup(); await service.act('bottom-right'); assert.equal(client.transform.positionX,1576); await service.act('restore'); assert.equal(client.transform.positionX,50); assert.equal(client.transform.scaleX,.5); });
test('scene changes reject stale webcam commands without writes', async () => { const {service,client} = await setup(); client.scene = 'BRB'; await assert.rejects(service.act('top-right'), /Scene changed/); assert.equal(client.writes,0); });
test('source removal clears selection and restore point', async () => { const {service,client} = await setup(); client.emit('SceneItemRemoved'); assert.equal(service.state.selection,null); assert.equal(service.state.hasRestore,false); await assert.rejects(service.act('restore')); });
test('concurrent operations fail instead of racing', async () => { const {service} = await setup(); const pending = service.exclusive(() => new Promise(resolve => setTimeout(resolve,20))); await assert.rejects(service.act('top-left'), /already running/); await pending; });
test('remote OBS hosts and arbitrary actions are rejected', async () => { const {service} = await setup(); await assert.rejects(service.connect({host:'example.com',port:4455,password:''})); await assert.rejects(service.act('delete-scene')); });
test('different webcam and game sources are required', async () => { const {service} = await setup(); await assert.rejects(service.select({scene:'Game',webcamId:1,gameId:1})); });
test('disconnect invalidates restore state', async () => { const {service,client} = await setup(); client.emit('ConnectionClosed'); await assert.rejects(service.act('restore')); assert.equal(service.state.hasRestore,false); });
test('blocked reports require a whole command, not a substring', () => { assert.equal(isBlocked(' !blocked inventory '),true); assert.equal(isBlocked('!BLOCKED'),true); assert.equal(isBlocked('!blockedness'),false); assert.equal(isBlocked('please !blocked'),false); });
test('cropped webcam is rejected before any mutation', async () => { const {service,client} = await setup(); client.transform.cropLeft=20; await assert.rejects(service.act('top-left'),/uncropped/); assert.equal(client.writes,0); });
test('unapplied OBS changes are reported as failure, not success', async () => {
  const {service,client} = await setup(); const original = client.call.bind(client);
  client.call = async (type,data) => type === 'SetSceneItemTransform' ? {} : original(type,data);
  await assert.rejects(service.act('bottom-right'),/differs/);
});
test('source selection cannot commit after a scene event arrives during its read', async () => {
  const {service,client}=await setup(); const original=client.call.bind(client);
  client.call=async(type,data)=>{const result=await original(type,data);if(type==='GetSceneItemTransform')client.emit('CurrentProgramSceneChanged',{sceneName:'BRB'});return result;};
  await assert.rejects(service.select({scene:'Game',webcamId:1,gameId:2}),/context changed/);
  assert.equal(service.state.selection,null);assert.equal(service.state.currentScene,'BRB');assert.equal(service.state.hasRestore,false);
});
test('late source-list response cannot repopulate controls after disconnect', async () => {
  const {service,client}=await setup(); const original=client.call.bind(client);
  client.call=async(type,data)=>{const result=await original(type,data);if(type==='GetSceneItemList')client.emit('ConnectionClosed');return result;};
  await assert.rejects(service.items('Game'),/context changed/);assert.deepEqual(service.state.items,[]);assert.equal(service.state.status,'disconnected');
});
test('restore point stays fixed across movements and reports verified dimensions', async () => {
  const {service}=await setup(); const saved={...service.state.restorePoint};
  await service.act('bottom-right'); await service.act('smaller');
  assert.deepEqual(service.state.restorePoint,saved);
  await service.act('restore');
  assert.deepEqual(service.state.lastVerified,{...saved,action:'restore'});
});
test('scale drift is rejected even if it is less than half a scale unit', async () => {
  const {service,client}=await setup(); const original=client.call.bind(client);
  client.call=async(type,data)=>{const result=await original(type,data);if(type==='SetSceneItemTransform')client.transform.scaleX+=0.01;return result;};
  await assert.rejects(service.act('smaller'),/differs/); assert.equal(service.state.lastVerified,null);
});
test('restore does not claim success when the source dimensions changed', async () => {
  const {service,client}=await setup(); const original=client.call.bind(client);
  client.call=async(type,data)=>{const result=await original(type,data);if(type==='SetSceneItemTransform')client.transform.width+=100;return result;};
  await assert.rejects(service.act('restore'),/dimensions differ/); assert.equal(service.state.lastVerified,null);
});
test('restore omits inactive zero bounds rejected by OBS, but keeps layout fields', () => {
  const target=restorable({...initial,boundsWidth:0,boundsHeight:0,boundsAlignment:0});
  assert.equal(target.boundsWidth,undefined);assert.equal(target.boundsHeight,undefined);
  assert.equal(target.positionX,50);assert.equal(target.scaleX,.5);assert.equal(target.boundsType,'OBS_BOUNDS_NONE');
});
test('program preview screenshots the composed scene, not an individual source', async () => {
  const {service,client}=await setup();const original=client.call.bind(client);let requested;
  client.call=async(type,data)=>{if(type==='GetSourceScreenshot'){requested=data.sourceName;return {imageData:'scene-image'};}return original(type,data);};
  const frame=await service.programPreview();assert.equal(requested,'Game');assert.equal(frame.image,'scene-image');assert.equal(frame.scene,'Game');
});
test('program preview rejects a frame returned after its scene changes', async () => {
  const {service,client}=await setup();const original=client.call.bind(client);
  client.call=async(type,data)=>{if(type==='GetSourceScreenshot'){client.emit('CurrentProgramSceneChanged',{sceneName:'BRB'});return {imageData:'old-scene'};}return original(type,data);};
  await assert.rejects(service.programPreview(),/context changed/);
});
test('smooth preview starts a stopped virtual camera and verifies it',async()=>{
  const {service,client}=await setup();const original=client.call.bind(client);let active=false,starts=0;
  client.call=async(type,data)=>{if(type==='GetVirtualCamStatus')return {outputActive:active};if(type==='StartVirtualCam'){active=true;starts++;return {};}return original(type,data);};
  assert.deepEqual(await service.prepareSmoothPreview(),{active:true});await service.prepareSmoothPreview();assert.equal(starts,1);
});
test('smooth preview reports a virtual camera that failed to start',async()=>{
  const {service,client}=await setup();const original=client.call.bind(client);
  client.call=async(type,data)=>{if(type==='GetVirtualCamStatus')return {outputActive:false};if(type==='StartVirtualCam')return {};return original(type,data);};
  await assert.rejects(service.prepareSmoothPreview(),/did not start/);
});
test('voice corrections replace relative size instead of compounding it',async()=>{
  const {service,client}=await setup();const checkpoint=await service.voiceCheckpoint();
  await service.applyVoicePlan(checkpoint,{position:'top-right',size:'smaller'});assert.equal(client.transform.scaleX,.45);
  await service.applyVoicePlan(checkpoint,{position:'bottom-left',size:'larger'});assert.equal(client.transform.scaleX,.55);
  await service.applyVoicePlan(checkpoint,{position:'keep',size:'keep'});assert.equal(client.transform.positionX,50);assert.equal(client.transform.scaleX,.5);
});

test('expanded placement search stays inside the canvas, preserves aspect ratio and enforces minimum reduced size',()=>{
 const {placements}=require('../desktop/layout-placements.cjs');const options=placements(initial,video);assert.equal(Object.keys(options).length,75);
 for(const p of Object.values(options)){assert.ok(p.positionX>=0&&p.positionY>=0);assert.ok(p.positionX+p.width<=1920&&p.positionY+p.height<=1080);assert.equal(p.width/p.height,initial.width/initial.height);}
 const small=placements({...initial,width:160,height:90},video);assert.equal(Object.keys(small).length,25);
});
test('custom resized placement animates with intermediate transforms and can restore exact dimensions',async()=>{
 const {service,client}=await setup();const cp=await service.voiceCheckpoint();const targets=[];const call=client.call.bind(client);client.call=async(type,data)=>{if(type==='SetSceneItemTransform')targets.push({...data.sceneItemTransform});return call(type,data);};
 const p=require('../desktop/layout-placements.cjs').placements(initial,video)['bottom-right-75'];await service.applyVoicePlan(cp,{position:'keep',size:'keep'},p);
 assert.equal(targets.length,8);assert.ok(targets[0].scaleX<initial.scaleX&&targets[0].scaleX>p.scaleX);assert.equal(client.transform.positionX,p.positionX);assert.equal(client.transform.width,p.width);assert.equal(client.transform.height,p.height);
 await service.applyVoicePlan(cp,{position:'keep',size:'keep'});assert.equal(client.transform.width,initial.width);assert.equal(client.transform.positionX,initial.positionX);
});

test('explicit image apply accepts a still-valid frame older than the legacy twelve-second limit',async()=>{const {service,client}=await setup();const checkpoint={selection:service.state.selection,generation:service.generation,transform:{...initial},gameTransform:{...initial},requireUnchanged:true,capturedAt:Date.now()-20000,maxAge:30000,canApply:()=>true};await service.applyVoicePlan(checkpoint,{position:'top-right',size:'keep'});assert.ok(client.writes>0);});
test('image apply refuses frames beyond their declared deadline and cancelled checkpoints',async()=>{for(const cancelled of [false,true]){const {service,client}=await setup();const checkpoint={selection:service.state.selection,generation:service.generation,transform:{...initial},gameTransform:{...initial},requireUnchanged:true,capturedAt:Date.now()-(cancelled?1000:31000),maxAge:30000,canApply:()=>!cancelled};await assert.rejects(service.applyVoicePlan(checkpoint,{position:'top-right',size:'keep'}),/expired|cancelled/);assert.equal(client.writes,0);}});

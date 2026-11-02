const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {ObsService}=require('../desktop/obs.cjs');
const {WebcamBackground,FILTER_NAME,FILTER_KIND,NATIVE_KIND,NATIVE_NAME}=require('../desktop/webcam-background.cjs');
function setup(){
 const client=new EventEmitter(),writes=[];let filters=[],kinds=[FILTER_KIND],scene='Game';
 client.call=async(type,data)=>{
  if(type==='GetCurrentProgramScene')return {currentProgramSceneName:scene};
  if(type==='GetSourceFilterKindList')return {sourceFilterKinds:kinds};
  if(type==='GetSourceFilterList')return {filters:structuredClone(filters)};
  if(type==='CreateSourceFilter'){writes.push({type,...data});filters.push({filterName:data.filterName,filterKind:data.filterKind,filterEnabled:true,filterSettings:data.filterSettings});return {};}
  if(type==='SetSourceFilterEnabled'){writes.push({type,...data});filters.find(x=>x.filterName===data.filterName).filterEnabled=data.filterEnabled;return {};}
  if(type==='SetSourceFilterSettings'){writes.push({type,...data});Object.assign(filters.find(x=>x.filterName===data.filterName).filterSettings,data.filterSettings);return {};}
  throw Error(type);
 };
 const obs=new ObsService(client,()=>{});Object.assign(obs.state,{status:'connected',currentScene:'Game',selection:{scene:'Game',webcamId:1,gameId:2},items:[{id:1,name:'Webcam',enabled:true},{id:2,name:'Game Capture',enabled:true}]});
 const events=[],service=new WebcamBackground(obs,e=>events.push(e));service.sync(obs.state);
 return {client,obs,service,writes,events,setFilters:v=>filters=v,setKinds:v=>kinds=v,setScene:v=>scene=v};
}
test('missing plugin is explained and never creates filters',async()=>{const f=setup();f.setKinds([]);assert.equal((await f.service.inspect()).status,'missing');await assert.rejects(f.service.setEnabled(true),/Install OBS/);assert.equal(f.writes.length,0);});
test('enable creates one bounded filter, verifies output state and original disables it without changing transforms',async()=>{const f=setup();assert.equal((await f.service.inspect()).enabled,false);assert.equal((await f.service.setEnabled(true)).enabled,true);assert.equal((await f.service.setEnabled(true)).enabled,true);assert.equal(f.writes.filter(x=>x.type==='CreateSourceFilter').length,1);assert.deepEqual(f.writes[0].filterSettings,{numThreads:2,blur_background:0});assert.equal((await f.service.setEnabled(false)).enabled,false);assert.ok(f.writes.every(x=>x.sourceName==='Webcam'&&x.filterName===FILTER_NAME));});
test('Original with no Sense filter is a no-op',async()=>{const f=setup();assert.equal((await f.service.setEnabled(false)).enabled,false);assert.equal(f.writes.length,0);});
test('active filters belonging to the user are not edited or stacked',async()=>{const f=setup();f.setFilters([{filterName:'My filter',filterKind:FILTER_KIND,filterEnabled:true}]);assert.equal((await f.service.inspect()).status,'conflict');await assert.rejects(f.service.setEnabled(true),/Another background/);assert.equal(f.writes.length,0);});
test('a filter name collision is never overwritten',async()=>{const f=setup();f.setFilters([{filterName:FILTER_NAME,filterKind:'color_filter',filterEnabled:true}]);await assert.rejects(f.service.setEnabled(true),/different filter/);assert.equal(f.writes.length,0);});
test('scene change or unconfirmed sources blocks mutations',async()=>{const f=setup();f.setScene('Other');await assert.rejects(f.service.setEnabled(true),/Scene changed/);f.obs.state.selection=null;await assert.rejects(f.service.setEnabled(true),/confirm/);assert.equal(f.writes.length,0);});
test('selection changes while inspecting reject stale actions',async()=>{const f=setup(),call=f.client.call;f.client.call=async(type,data)=>{const result=await call(type,data);if(type==='GetSourceFilterList')f.obs.state.selection={scene:'Game',webcamId:3,gameId:2};return result;};await assert.rejects(f.service.setEnabled(true),/selection changed/);assert.equal(f.writes.length,0);});
test('invalid input is rejected before OBS and competing mutations are serialized',async()=>{const f=setup();await assert.rejects(f.service.setEnabled('true'));await f.obs.exclusive(async()=>{await assert.rejects(f.service.setEnabled(true),/already running/);});assert.equal(f.writes.length,0);});
test('failed readback never claims that removal was applied',async()=>{const f=setup(),call=f.client.call;f.setFilters([{filterName:FILTER_NAME,filterKind:FILTER_KIND,filterEnabled:false}]);f.client.call=async(type,data)=>type==='SetSourceFilterEnabled'?{}:call(type,data);await assert.rejects(f.service.setEnabled(true),/did not confirm/);assert.equal(f.service.state.enabled,false);});
test('plugin state is cleared when webcam context changes',async()=>{const f=setup();await f.service.setEnabled(true);f.obs.state.selection=null;f.service.sync(f.obs.state);assert.equal(f.service.state.enabled,false);assert.equal(f.service.state.status,'unavailable');});
test('Remove background resets only owned blur mode while preserving user edge tuning',async()=>{const f=setup();f.setFilters([{filterName:FILTER_NAME,filterKind:FILTER_KIND,filterEnabled:true,filterSettings:{blur_background:5,threshold:.65}}]);const result=await f.service.setEnabled(true);assert.equal(result.blurred,false);const settings=f.writes.find(x=>x.type==='SetSourceFilterSettings');assert.deepEqual(settings.filterSettings,{blur_background:0});assert.equal(settings.overlay,true);});

test('a stalled native worker stays visibly stalled despite a large saved frame count',async()=>{const f=setup();f.setKinds([NATIVE_KIND]);f.setFilters([{filterName:NATIVE_NAME,filterKind:NATIVE_KIND,filterEnabled:true,filterSettings:{native_active:true,native_status:'stalled',processed_frames:999,frame_age_ms:406}}]);const result=await f.service.inspect();assert.equal(result.nativeStatus,'stalled');assert.match(result.message,/Holding the last frame/);assert.equal(f.writes.length,0);});

test('a fresh worker can restart below the frame count saved by a previous OBS process',async()=>{const f=setup();f.setKinds([NATIVE_KIND]);f.setFilters([{filterName:NATIVE_NAME,filterKind:NATIVE_KIND,filterEnabled:false,filterSettings:{native_active:false,native_status:'ready',processed_frames:999}}]);const call=f.client.call;f.client.call=async(type,data)=>{const result=await call(type,data);if(type==='SetSourceFilterEnabled'&&data.filterEnabled)f.setFilters([{filterName:NATIVE_NAME,filterKind:NATIVE_KIND,filterEnabled:true,filterSettings:{native_active:true,native_status:'ready',processed_frames:10}}]);return result;};assert.equal((await f.service.setEnabled(true)).enabled,true);});

// Adapter for the separately installed GPL OBS Background Removal plugin.
// No plugin code or model weights are bundled with SceneSense.
const {z}=require('zod');
const FILTER_KIND='background_removal';
const FILTER_NAME='SceneSense Background Removal';
const NATIVE_KIND='scenesense_native_matting',NATIVE_NAME='SceneSense Native Cutout';
class WebcamBackground {
  constructor(obs,publish){
    this.obs=obs;this.publish=publish;this.state={status:'unavailable',enabled:false};this.context='';
    for(const event of ['SourceFilterCreated','SourceFilterRemoved','SourceFilterEnableStateChanged','SourceFilterSettingsChanged'])obs.client.on(event,e=>{
      if(e.sourceName===this.state.source&&!obs.busy)void this.inspect().catch(()=>{this.state={...this.state,status:'error',message:'Could not read the webcam filter. Check again.'};this.emit();});
    });
  }
  emit(){this.publish({kind:'webcam-background',...this.state});return this.state;}
  sync(state){
    const key=state.status==='connected'&&state.selection?JSON.stringify([state.selection.scene,state.selection.webcamId]):'';
    if(key!==this.context){this.context=key;this.state={status:'unavailable',enabled:false};this.emit();}
  }
  async target(){
    const {obs}=this,s=obs.state.selection,generation=obs.generation;
    if(obs.state.status!=='connected'||!s)throw Error('Connect OBS and confirm your webcam and game first.');
    const webcam=obs.state.items.find(x=>x.id===s.webcamId);
    if(!webcam?.enabled)throw Error('The confirmed webcam is no longer available. Confirm sources again.');
    const current=await obs.call('GetCurrentProgramScene');
    obs.assertCurrent(generation);
    if(obs.state.selection!==s||current.currentProgramSceneName!==s.scene)throw Error('Scene changed. Confirm sources again.');
    return {sourceName:webcam.name,generation,selection:s};
  }
  guard(t){this.obs.assertCurrent(t.generation);if(this.obs.state.selection!==t.selection)throw Error('Webcam selection changed. No filter action was sent.');}
  async read(t){
    const {sourceFilterKinds=[]}=await this.obs.call('GetSourceFilterKindList');this.guard(t);
    if(!sourceFilterKinds.includes(FILTER_KIND)&&!sourceFilterKinds.includes(NATIVE_KIND))return {status:'missing',enabled:false,source:t.sourceName,message:'Install OBS Background Removal, restart OBS, then check again.'};
    const {filters}=await this.obs.call('GetSourceFilterList',{sourceName:t.sourceName});this.guard(t);
    if(sourceFilterKinds.includes(NATIVE_KIND)){
      const native=filters.find(f=>f.filterName===NATIVE_NAME),legacy=filters.find(f=>f.filterName===FILTER_NAME);
      if(native&&native.filterKind!==NATIVE_KIND||legacy&&legacy.filterKind!==FILTER_KIND)throw Error('A different filter uses a SceneSense name. Rename it in OBS first.');
      const foreign=filters.some(f=>[FILTER_KIND,NATIVE_KIND].includes(f.filterKind)&&![FILTER_NAME,NATIVE_NAME].includes(f.filterName)&&f.filterEnabled);
      const settings=native?.filterSettings||{},enabled=!!native?.filterEnabled;
      return {status:foreign?'conflict':'ready',enabled:enabled||!!legacy?.filterEnabled,source:t.sourceName,nativeAvailable:true,exists:!!native,engine:enabled?'native':legacy?.filterEnabled?'legacy':'native',nativeStatus:settings.native_status,processedFrames:settings.processed_frames||0,processingMs:settings.processing_ms,frameAgeMs:settings.frame_age_ms,message:foreign?'Another background-removal filter is active. Disable it in OBS first.':enabled?(settings.native_status==='stalled'?'Cutout delayed. Holding the last frame.':settings.native_status==='error'?'Native GPU cutout failed. Check OBS.':'Native GPU cutout enabled.'):undefined};
    }
    const own=filters.find(x=>x.filterName===FILTER_NAME);
    if(own&&own.filterKind!==FILTER_KIND)throw Error('A different filter already uses the SceneSense name. Rename it in OBS first.');
    const foreign=filters.some(x=>x.filterKind===FILTER_KIND&&x.filterName!==FILTER_NAME&&x.filterEnabled);
    return {status:foreign?'conflict':'ready',enabled:!!own?.filterEnabled,source:t.sourceName,exists:!!own,blurred:!!own?.filterSettings?.blur_background,message:foreign?'Another background-removal filter is active. Disable it in OBS before using Sense.':undefined};
  }
  async inspect(){return this.obs.exclusive(async()=>{const t=await this.target();const result=await this.read(t);this.state=result;return this.emit();});}
  async setNative(t,before,enabled){
    if(enabled&&before.status==='conflict')throw Error(before.message);
    const {filters}=await this.obs.call('GetSourceFilterList',{sourceName:t.sourceName});this.guard(t);
    const prior=filters.filter(f=>[NATIVE_NAME,FILTER_NAME].includes(f.filterName));
    const write=async(type,data)=>{this.guard(t);await this.obs.call(type,{sourceName:t.sourceName,...data});this.guard(t);};
    try{
      const legacy=prior.find(f=>f.filterName===FILTER_NAME),native=prior.find(f=>f.filterName===NATIVE_NAME);
      if(legacy?.filterEnabled)await write('SetSourceFilterEnabled',{filterName:FILTER_NAME,filterEnabled:false});
      if(!native&&enabled)await write('CreateSourceFilter',{filterName:NATIVE_NAME,filterKind:NATIVE_KIND,filterSettings:{ratio:.5,native_active:true}});
      if(native||enabled){await write('SetSourceFilterSettings',{filterName:NATIVE_NAME,filterSettings:{native_active:enabled},overlay:true});await write('SetSourceFilterEnabled',{filterName:NATIVE_NAME,filterEnabled:enabled});}
      if(enabled){
        let fresh=false;const start=Date.now();while(Date.now()-start<10000){const result=await this.read(t);if(result.nativeStatus==='error')throw Error('Native GPU cutout failed to start. Previous mode restored.');if(result.nativeStatus==='ready'&&result.processedFrames>5&&result.processedFrames!==(native?.filterSettings?.processed_frames||0)){fresh=true;break;}await new Promise(r=>setTimeout(r,150));}if(!fresh)throw Error('No fresh native cutout arrived. Check OBS and retry.');
      }
      const actual=await this.read(t);if(actual.enabled!==enabled||enabled&&actual.nativeStatus!=='ready')throw Error('Native output is not ready. Keep the OBS preview running and retry.');this.state=actual;return this.emit();
    }catch(error){
      try{this.guard(t);await write('SetSourceFilterSettings',{filterName:NATIVE_NAME,filterSettings:{native_active:false},overlay:true});await write('SetSourceFilterEnabled',{filterName:NATIVE_NAME,filterEnabled:false});for(const f of prior)await write('SetSourceFilterEnabled',{filterName:f.filterName,filterEnabled:f.filterEnabled});this.state=await this.read(t);this.emit();}catch{}throw error;
    }
  }
  async setEnabled(input){
    const enabled=z.boolean().parse(input);
    return this.obs.exclusive(async()=>{
      const t=await this.target(),before=await this.read(t);this.state=before;this.emit();
      if(before.nativeAvailable)return this.setNative(t,before,enabled);
      if(before.status==='missing')throw Error(before.message);
      if(enabled&&before.status==='conflict')throw Error(before.message);
      if(!before.exists&&!enabled)return before;
      this.guard(t);
      if(!before.exists){
        // MediaPipe model and CPU backend are the plugin defaults; use two threads.
        await this.obs.call('CreateSourceFilter',{sourceName:t.sourceName,filterName:FILTER_NAME,filterKind:FILTER_KIND,filterSettings:{numThreads:2,blur_background:0}});
        this.guard(t);
      }
      if(enabled&&before.blurred){await this.obs.call('SetSourceFilterSettings',{sourceName:t.sourceName,filterName:FILTER_NAME,filterSettings:{blur_background:0},overlay:true});this.guard(t);}
      await this.obs.call('SetSourceFilterEnabled',{sourceName:t.sourceName,filterName:FILTER_NAME,filterEnabled:enabled});this.guard(t);
      const actual=await this.read(t);this.state=actual;this.emit();
      if(actual.enabled!==enabled||(enabled&&actual.blurred))throw Error('OBS did not confirm the filter change. Check the program preview and try again.');
      return actual;
    });
  }
}
module.exports={WebcamBackground,FILTER_KIND,FILTER_NAME,NATIVE_KIND,NATIVE_NAME};

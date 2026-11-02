const {z}=require('zod');
const {restorable}=require('./obs.cjs');
const {AudioMixer}=require('./audio-mixer.cjs');
const audioSchema=z.array(z.object({inputName:z.string().min(1).max(256),volumeDb:z.number().finite().min(-100).max(26),muted:z.boolean()})).max(256).refine(items=>new Set(items.map(x=>x.inputName)).size===items.length,'Duplicate audio sources.');
const {FILTER_NAME,FILTER_KIND,NATIVE_NAME,NATIVE_KIND}=require('./webcam-background.cjs');
const owned=new Map([[FILTER_NAME,FILTER_KIND],[NATIVE_NAME,NATIVE_KIND]]);
const finite=z.number().finite();
const transformSchema=z.object({positionX:finite,positionY:finite,scaleX:finite.positive(),scaleY:finite.positive(),rotation:finite,alignment:z.literal(5),boundsType:z.literal('OBS_BOUNDS_NONE'),cropTop:finite.optional(),cropBottom:finite.optional(),cropLeft:finite.optional(),cropRight:finite.optional()});
const filterSchema=z.object({filterName:z.enum([FILTER_NAME,NATIVE_NAME]),filterKind:z.enum([FILTER_KIND,NATIVE_KIND]),filterEnabled:z.boolean(),filterSettings:z.record(z.string(),z.unknown())}).refine(f=>owned.get(f.filterName)===f.filterKind);
const setupSchema=z.object({scene:z.string().min(1).max(256),webcamId:z.number().int().nonnegative(),gameId:z.number().int().nonnegative(),layout:z.object({transform:transformSchema,background:z.array(filterSchema).max(2),audio:audioSchema.optional()}).optional()}).refine(s=>s.webcamId!==s.gameId);
function settings(value){return Object.fromEntries(Object.entries(value||{}).filter(([k])=>!['native_status','processed_frames','processing_ms','frame_age_ms'].includes(k)));}
function equal(actual,expected){return Object.entries(expected).every(([key,value])=>value&&typeof value==='object'?equal(actual?.[key]||{},value):typeof value==='number'?Math.abs((actual?.[key]??NaN)-value)<.001:actual?.[key]===value);}
class StreamSetups {
 constructor(obs,background){this.obs=obs;this.background=background;this.audio=new AudioMixer(obs);}
 async capture(){return this.obs.exclusive(async()=>{const t=await this.background.target();const source={sceneName:t.selection.scene,sceneItemId:t.selection.webcamId};const {sceneItemTransform}=await this.obs.call('GetSceneItemTransform',source);const {filters}=await this.obs.call('GetSourceFilterList',{sourceName:t.sourceName});this.background.guard(t);this.validateFilters(filters);const layout={transform:restorable(sceneItemTransform),background:filters.filter(f=>owned.has(f.filterName)).map(f=>({...f,filterSettings:settings(f.filterSettings)}))};layout.audio=await this.audio.snapshot();this.background.guard(t);return setupSchema.parse({...t.selection,layout});});}
 validateFilters(filters){for(const f of filters){if(owned.has(f.filterName)&&owned.get(f.filterName)!==f.filterKind)throw Error('A different filter uses a SceneSense name. Rename it in OBS first.');}}
 async load(input){const setup=setupSchema.parse(input),obs=this.obs;
 await obs.exclusive(async()=>{if(obs.state.status!=='connected')throw Error('Connect OBS before loading a setup.');const scenes=await obs.call('GetSceneList');if(!scenes.scenes.some(s=>s.sceneName===setup.scene))throw Error('This scene no longer exists in OBS. Save the setup again.');await obs.call('SetCurrentProgramScene',{sceneName:setup.scene});await obs.refresh();await obs.items(setup.scene);});
 await obs.select(setup);
 if(!setup.layout)return obs.state;
 await obs.exclusive(async()=>{const t=await this.background.target(),source={sceneName:setup.scene,sceneItemId:setup.webcamId};const {filters}=await obs.call('GetSourceFilterList',{sourceName:t.sourceName});this.background.guard(t);this.validateFilters(filters);
 const {sourceFilterKinds=[]}=await obs.call('GetSourceFilterKindList');this.background.guard(t);
 for(const f of setup.layout.background)if(!sourceFilterKinds.includes(f.filterKind))throw Error('The saved background plugin is unavailable. Install it in OBS before loading this setup.');
 if(setup.layout.background.some(f=>f.filterEnabled)&&filters.some(f=>[FILTER_KIND,NATIVE_KIND].includes(f.filterKind)&&!owned.has(f.filterName)&&f.filterEnabled))throw Error('Another background-removal filter is active. Disable it in OBS first.');
 // Read every saved channel before mutating the layout; missing sources must not be silently skipped.
 for(const channel of setup.layout.audio||[]){await this.audio.read(channel.inputName);this.background.guard(t);}
 const write=async(type,data)=>{this.background.guard(t);await obs.call(type,data);this.background.guard(t);};
 try{
 await write('SetSceneItemTransform',{...source,sceneItemTransform:setup.layout.transform});
 for(const f of filters.filter(f=>owned.has(f.filterName)))await write('SetSourceFilterEnabled',{sourceName:t.sourceName,filterName:f.filterName,filterEnabled:false});
 for(const f of setup.layout.background){const exists=filters.some(x=>x.filterName===f.filterName);await write(exists?'SetSourceFilterSettings':'CreateSourceFilter',{sourceName:t.sourceName,filterName:f.filterName,...(exists?{overlay:false}:{filterKind:f.filterKind}),filterSettings:f.filterSettings});await write('SetSourceFilterEnabled',{sourceName:t.sourceName,filterName:f.filterName,filterEnabled:f.filterEnabled});}
 const {sceneItemTransform:actual}=await obs.call('GetSceneItemTransform',source);const {filters:after}=await obs.call('GetSourceFilterList',{sourceName:t.sourceName});this.background.guard(t);
 if(!equal(actual,setup.layout.transform)||setup.layout.background.some(f=>{const a=after.find(x=>x.filterName===f.filterName);return !a||a.filterEnabled!==f.filterEnabled||!equal(a.filterSettings,f.filterSettings);})||after.some(f=>owned.has(f.filterName)&&f.filterEnabled&&!setup.layout.background.some(x=>x.filterName===f.filterName&&x.filterEnabled)))throw Error('OBS did not confirm the saved layout.');
 // Silence saved channels while restoring gain, then restore each saved mute state.
 for(const channel of setup.layout.audio||[])await write('SetInputMute',{inputName:channel.inputName,inputMuted:true});
 for(const channel of setup.layout.audio||[])await write('SetInputVolume',{inputName:channel.inputName,inputVolumeDb:channel.volumeDb});
 for(const channel of setup.layout.audio||[])await write('SetInputMute',{inputName:channel.inputName,inputMuted:channel.muted});
 for(const channel of setup.layout.audio||[]){const audio=await this.audio.read(channel.inputName);this.background.guard(t);if(Math.abs(audio.volumeDb-channel.volumeDb)>.05||audio.muted!==channel.muted)throw Error('OBS did not confirm saved audio settings for '+channel.inputName+'.');}
 obs.snapshot=restorable(actual);obs.state.restorePoint=Object.fromEntries(['positionX','positionY','width','height'].map(k=>[k,actual[k]]));obs.state.lastVerified={...obs.state.restorePoint,action:'setup'};obs.emit();
 }catch(error){throw Error('Setup was not fully restored; some OBS changes may have applied. '+error.message);}
 });await this.background.inspect();return obs.state;
 }
}
module.exports={StreamSetups,setupSchema};

// Local evidence harness. No paid providers, uploads, OBS recording or streaming.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const OBS=require('obs-websocket-js/json').default;
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'.artifacts','matting-evaluation-20261101');
const FILTER='SceneSense Background Removal',KIND='background_removal';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 fs.mkdirSync(OUT,{recursive:true});
 const mode=process.argv[2];if(!['capture','compare'].includes(mode))throw Error('Use capture or compare.');
 const config=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json'),'utf8'));
 const obs=new OBS();obs.on('ConnectionError',()=>{});let backup,sceneName,inputName,child;const results=fs.existsSync(path.join(OUT,'results.json'))?JSON.parse(fs.readFileSync(path.join(OUT,'results.json'),'utf8')):[];
 const call=(type,data)=>Promise.race([obs.call(type,data),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error(type+' timed out')),10000);timer.unref();})]);
 const save=(name,value)=>fs.writeFileSync(path.join(OUT,name),JSON.stringify(value,null,2));
 async function record(name,seconds){
  const output=path.join(OUT,name);if(fs.existsSync(output))throw Error('Evidence file already exists: '+name);
  const args=['-hide_banner','-loglevel','warning','-f','dshow','-rtbufsize','64M','-framerate','30','-video_size','1280x720','-i','video=OBS Virtual Camera','-t',String(seconds),'-an','-vf','scale=640:360','-c:v','ffv1','-threads','2','-pix_fmt','bgr0',output];
  child=spawn('C:\\ffmpeg\\ffmpeg.exe',args,{windowsHide:true,stdio:['pipe','ignore','pipe']});
  const processRef=child;let log='';processRef.stderr.on('data',data=>{log+=data;});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{processRef.stdin.write('q');reject(Error('Capture exceeded its time limit.'));},(seconds+15)*1000);processRef.once('error',reject);processRef.once('exit',code=>{clearTimeout(timeout);child=null;if(code===0)resolve();else{fs.writeFileSync(path.join(OUT,name+'.log'),log);reject(Error('Local capture failed; inspect its local log.'));}});});
  return output;
 }
 try{
  await obs.connect('ws://127.0.0.1:'+(config.server_port||4455),config.server_password,{rpcVersion:1});
  const [stream,recording,scenes,virtual,video,filters,defaults]=await Promise.all([call('GetStreamStatus'),call('GetRecordStatus'),call('GetSceneList'),call('GetVirtualCamStatus'),call('GetVideoSettings'),call('GetSourceFilterList',{sourceName:'Webcam'}),call('GetSourceFilterDefaultSettings',{filterKind:KIND})]);
  if(stream.outputActive||recording.outputActive)throw Error('Stop the stream/recording before the comparison.');
  const filter=filters.filters.find(x=>x.filterName===FILTER);if(!filter||filter.filterKind!==KIND)throw Error('Expected webcam filter unavailable.');
  backup={programScene:scenes.currentProgramSceneName,virtualActive:virtual.outputActive,filter:structuredClone(filter),effectiveSettings:{...defaults.defaultFilterSettings,...filter.filterSettings}};
  sceneName='SceneSense Matting QA '+Date.now();backup.testScene=sceneName;save(mode+'-recovery.json',backup);
  await call('CreateScene',{sceneName});
  if(mode==='capture'){
   const {sceneItemId}=await call('CreateSceneItem',{sceneName,sourceName:'Webcam',sceneItemEnabled:true});
   await call('SetSceneItemTransform',{sceneName,sceneItemId,sceneItemTransform:{positionX:0,positionY:0,alignment:5,boundsType:'OBS_BOUNDS_STRETCH',boundsWidth:video.baseWidth,boundsHeight:video.baseHeight}});
   await call('SetSourceFilterEnabled',{sourceName:'Webcam',filterName:FILTER,filterEnabled:false});
  }else{
   const raw=path.join(OUT,'raw.mkv');if(!fs.existsSync(raw))throw Error('Capture the raw clip first.');
   inputName=sceneName+' media';backup.testInput=inputName;save(mode+'-recovery.json',backup);
   const {sceneItemId}=await call('CreateInput',{sceneName,inputName,inputKind:'ffmpeg_source',inputSettings:{is_local_file:true,local_file:raw,looping:true,restart_on_activate:true,close_when_inactive:false,hw_decode:false},sceneItemEnabled:true});
   await call('SetInputMute',{inputName,inputMuted:true});
   await call('SetSceneItemTransform',{sceneName,sceneItemId,sceneItemTransform:{positionX:0,positionY:0,alignment:5,boundsType:'OBS_BOUNDS_STRETCH',boundsWidth:video.baseWidth,boundsHeight:video.baseHeight}});
  }
  await call('SetCurrentProgramScene',{sceneName});if(!virtual.outputActive)await call('StartVirtualCam');await wait(1500);
  if(mode==='capture'){
   if(process.argv.includes('--armed')){console.log('READY FOR CAPTURE CUE');const armedAt=Date.now(),cue=path.join(OUT,'capture-cue.txt');while(!fs.existsSync(cue)||Number(fs.readFileSync(cue,'utf8'))<armedAt){if(Date.now()-armedAt>120000)throw Error('Capture cue timed out.');await wait(100);}}
   console.log('CAPTURE START: 20 seconds, local webcam only.');await record('raw.mkv',20);console.log('CAPTURE COMPLETE');
  }else{
   const cases=[
    ['baseline',backup.effectiveSettings],
    ['mediapipe-soft',{...backup.effectiveSettings,model_select:'models/mediapipe.with_runtime_opt.ort',enable_threshold:false,temporal_smooth_factor:1,mask_every_x_frames:1,enable_image_similarity:false}],
    ['rvm-soft',{...backup.effectiveSettings,model_select:'models/rvm_mobilenetv3_fp32.with_runtime_opt.ort',enable_threshold:false,temporal_smooth_factor:1,mask_every_x_frames:1,enable_image_similarity:false}],
    ['selfie-soft',{...backup.effectiveSettings,model_select:'models/selfie_segmentation.with_runtime_opt.ort',enable_threshold:false,temporal_smooth_factor:1,mask_every_x_frames:1,enable_image_similarity:false}],
    ['selfie-multiclass',{...backup.effectiveSettings,model_select:'models/selfie_multiclass_256x256.with_runtime_opt.ort',enable_threshold:false,temporal_smooth_factor:1,mask_every_x_frames:1,enable_image_similarity:false}]
   ];
   const requested=(process.argv.find(x=>x.startsWith('--cases='))?.slice(8)||'baseline,mediapipe-soft,rvm-soft').split(',');
   if(requested.some(id=>!cases.some(x=>x[0]===id)))throw Error('Unknown comparison case.');
   await call('CreateSourceFilter',{sourceName:inputName,filterName:FILTER,filterKind:KIND,filterSettings:{...cases[0][1],blur_background:0}});
   for(const [id,settings]of cases){
    if(!requested.includes(id))continue;
    console.log('COMPARISON START: '+id);
    await call('SetSourceFilterSettings',{sourceName:inputName,filterName:FILTER,filterSettings:{...settings,blur_background:0},overlay:false});
    await call('TriggerMediaInputAction',{inputName,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'});await wait(1500);
    const before=await call('GetStats'),start=Date.now();await record(id+'.mkv',22);
    const after=await call('GetStats'),media=await call('GetMediaInputStatus',{inputName});
    const result={id,settings,elapsedMs:Date.now()-start,obsFps:after.activeFps,obsCpu:after.cpuUsage,renderFrames:after.renderTotalFrames-before.renderTotalFrames,renderSkipped:after.renderSkippedFrames-before.renderSkippedFrames,mediaState:media.mediaState,maskInferenceFps:'not measured',maskLatency:'not measured',alignment:'Same replayed clip; virtual-camera recordings not frame-accurately synchronized'};
    results.push(result);save('results.json',results);console.log(JSON.stringify({id,obsFps:result.obsFps,renderSkipped:result.renderSkipped,obsCpu:result.obsCpu}));
    // Preserve real alpha for inspecting exact source borders on light/dark backgrounds.
    await call('TriggerMediaInputAction',{inputName,mediaAction:'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE'});
    for(const ms of [4000,8000,12000]){
     await call('SetMediaInputCursor',{inputName,mediaCursor:ms});await wait(700);
     const {imageData}=await call('GetSourceScreenshot',{sourceName:inputName,imageFormat:'png',imageWidth:640});fs.writeFileSync(path.join(OUT,id+'-'+ms+'.png'),Buffer.from(imageData.split(',')[1],'base64'));
    }
   }
  }
 }finally{
  if(child){child.stdin.write('q');await wait(500);}
  if(backup){
   const recovery=[];
   for(const [label,type,data]of [
    ['webcam settings','SetSourceFilterSettings',{sourceName:'Webcam',filterName:FILTER,filterSettings:backup.filter.filterSettings,overlay:false}],
    ['webcam enabled','SetSourceFilterEnabled',{sourceName:'Webcam',filterName:FILTER,filterEnabled:backup.filter.filterEnabled}],
    ['program scene','SetCurrentProgramScene',{sceneName:backup.programScene}],
    ...(!backup.virtualActive?[['virtual camera','StopVirtualCam',undefined]]:[]),
    ...(inputName?[['test input','RemoveInput',{inputName}]]:[]),
    ...(sceneName?[['test scene','RemoveScene',{sceneName}]]:[])
   ]){try{await call(type,data);recovery.push({label,ok:true});}catch{recovery.push({label,ok:false});}}
   const current=await call('GetCurrentProgramScene'),currentVirtual=await call('GetVirtualCamStatus'),currentFilters=await call('GetSourceFilterList',{sourceName:'Webcam'}),actual=currentFilters.filters.find(x=>x.filterName===FILTER);
   const verified={scene:current.currentProgramSceneName===backup.programScene,virtualCamera:currentVirtual.outputActive===backup.virtualActive,enabled:actual?.filterEnabled===backup.filter.filterEnabled,settings:require('node:util').isDeepStrictEqual(actual?.filterSettings,backup.filter.filterSettings)};
   save(mode+'-restoration.json',{recovery,verified});console.log(JSON.stringify({restored:verified}));
   if(recovery.some(x=>!x.ok)||Object.values(verified).some(v=>!v))throw Error('Restoration needs attention; recovery details were saved locally.');
  }
  await obs.disconnect();
 }
}
main().catch(error=>{console.error(error.message?.includes('auth')?'Local OBS authentication failed.':error.message||'Local experiment failed.');process.exitCode=1;});

// Continuous virtual-camera regression. Local clip only; no OBS recording/stream.
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const OBS=require('obs-websocket-js/json').default;
const out=path.resolve(process.env.SENSE_TEST_OUTPUT||path.resolve(__dirname,'../.artifacts/native-blink-followup')),wait=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const o=new OBS(),cfg=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json')));
 let changedMode=false,events=[],qaScene,originalScene;
 const fixture=process.env.SENSE_TEST_FIXTURE==='1';
 const sourceName=fixture?'SceneSense matting fixture '+Date.now():'Webcam';
 try {
  await o.connect('ws://127.0.0.1:'+cfg.server_port,cfg.server_password);
  const [s,r]=await Promise.all([o.call('GetStreamStatus'),o.call('GetRecordStatus')]);
  if(s.outputActive||r.outputActive)throw Error('Active stream/recording; stopped');
  if(fixture){
   originalScene=(await o.call('GetCurrentProgramScene')).currentProgramSceneName;
   qaScene='SceneSense matting QA '+Date.now();
   await o.call('CreateScene',{sceneName:qaScene});
   const {sceneItemId}=await o.call('CreateInput',{sceneName:qaScene,inputName:sourceName,inputKind:'ffmpeg_source',inputSettings:{is_local_file:true,local_file:path.resolve(__dirname,'../.artifacts/native-blink-followup/fixture.mkv'),looping:true,restart_on_activate:true},sceneItemEnabled:true});
   const video=await o.call('GetVideoSettings');
   await o.call('SetSceneItemTransform',{sceneName:qaScene,sceneItemId,sceneItemTransform:{positionX:0,positionY:0,alignment:5,scaleX:video.baseWidth/640,scaleY:video.baseHeight/360}});
   await o.call('CreateSourceFilter',{sourceName,filterName:'SceneSense Native Cutout',filterKind:'scenesense_native_matting',filterSettings:{native_active:true,ratio:.5}});
   await o.call('SetCurrentProgramScene',{sceneName:qaScene});
  }
  const target={sourceName,filterName:'SceneSense Native Cutout'};
  o.on('SourceFilterEnableStateChanged',e=>{if(e.sourceName===sourceName){events.push(e);if(e.filterName===target.filterName&&!e.filterEnabled)changedMode=true;}});
  const baseline=(await o.call('GetSourceFilter',target)).filterSettings.processed_frames||0;
  await o.call('SetSourceFilterSettings',{...target,filterSettings:{native_active:true,ratio:.5},overlay:true});
  await o.call('SetSourceFilterEnabled',{...target,filterEnabled:true});
  if(!(await o.call('GetVirtualCamStatus')).outputActive)await o.call('StartVirtualCam');
  let settings;for(let i=0;i<100;i++){settings=(await o.call('GetSourceFilter',target)).filterSettings;if(settings.native_status==='error')throw Error('Native worker failed');if(settings.native_status==='ready'&&settings.processed_frames!==baseline&&settings.processed_frames>5)break;await wait(100);}
  if(settings.native_status!=='ready'||(settings.processed_frames===baseline||settings.processed_frames<=5))throw Error('No fresh native output');
  const {currentProgramSceneName:sceneName}=await o.call('GetCurrentProgramScene');
  const {sceneItemId}=await o.call('GetSceneItemId',{sceneName,sourceName});
  const {sceneItemTransform:t}=await o.call('GetSceneItemTransform',{sceneName,sceneItemId});
  const v=await o.call('GetVideoSettings'),first=await o.call('GetStats');
  const clip=path.join(out,'after-continuous.mp4');let stderr='';
  const child=spawn('C:/ffmpeg/ffmpeg.exe',['-hide_banner','-loglevel','error','-f','dshow','-video_size',`${v.outputWidth}x${v.outputHeight}`,'-framerate','30','-i','video=OBS Virtual Camera','-t','15','-an','-c:v','libx264','-preset','ultrafast','-crf','20','-y',clip],{windowsHide:true});
  child.stderr.on('data',d=>stderr+=d);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve(code));});
  let finished=false;done.finally(()=>{finished=true;});const metrics=[];
  while(!finished){const f=await o.call('GetSourceFilter',target);metrics.push({at:Date.now(),...f.filterSettings,enabled:f.filterEnabled});await wait(200);}
  if(await done!==0)throw Error('Capture failed: '+stderr);
  const scaleX=v.outputWidth/v.baseWidth,scaleY=v.outputHeight/v.baseHeight;
  const x=Math.max(0,Math.round(t.positionX*scaleX)),y=Math.max(0,Math.round(t.positionY*scaleY));
  const w=Math.min(v.outputWidth-x,Math.round(t.width*scaleX)),h=Math.min(v.outputHeight-y,Math.round(t.height*scaleY));
  if(t.rotation||t.alignment!==5)throw Error('Probe ROI requires unrotated top-left alignment');
  const decoded=spawnSync('C:/ffmpeg/ffmpeg.exe',['-v','error','-i',clip,'-vf',`crop=${w}:${h}:${x}:${y},scale=160:90,format=gray`,'-f','rawvideo','pipe:1'],{maxBuffer:30*1024*1024});
  if(decoded.status)throw Error('Decode failed: '+decoded.stderr);
  const pixels=decoded.stdout,frameSize=160*90,frames=[],changes=[];let repeatedRun=0,maxRepeatedRun=0;
  for(let offset=0;offset+frameSize<=pixels.length;offset+=frameSize){let lit=0,diff=0;for(let i=0;i<frameSize;i++){if(pixels[offset+i]>35)lit++;if(offset)diff+=Math.abs(pixels[offset+i]-pixels[offset-frameSize+i]);}frames.push(lit);if(offset){const change=diff/frameSize;changes.push(change);repeatedRun=change<.05?repeatedRun+1:0;maxRepeatedRun=Math.max(maxRepeatedRun,repeatedRun);}}
  const last=await o.call('GetStats');
  const ages=metrics.map(m=>m.frame_age_ms||0).sort((a,b)=>a-b);
  const result={fixture,frames:frames.length,emptyCutoutFrames:frames.filter(n=>n<100).length,minimumVisiblePixels:Math.min(...frames),maxNearlyRepeatedRun:maxRepeatedRun,nearlyRepeatedFrames:changes.filter(x=>x<.05).length,sampledAgeMedianMs:ages[Math.floor(ages.length*.5)],sampledAgeP95Ms:ages[Math.floor(ages.length*.95)],sampledAgeMaxMs:ages.at(-1),modeChangedDuringTest:changedMode,filterEvents:events,obsFps:last.activeFps,skipped:last.renderSkippedFrames-first.renderSkippedFrames,roi:{x,y,w,h},metrics,visiblePixelsPerFrame:frames,scope:'15-second continuous local virtual-camera output; every decoded frame checked for missing subject and near-identical images (mean gray difference < .05). Still subjects can produce similar images. Frame age excludes camera exposure and final display.'};
  fs.writeFileSync(path.join(out,'continuity-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,metrics:undefined,visiblePixelsPerFrame:undefined}));
  if(changedMode||result.emptyCutoutFrames)throw Error('Continuity failed or mode changed; inspect receipt');
 }finally{
  if(qaScene){if(originalScene)await o.call('SetCurrentProgramScene',{sceneName:originalScene});await o.call('RemoveScene',{sceneName:qaScene});}
  await o.disconnect();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});

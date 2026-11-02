// Local integration probe: OBS input -> native GPU -> RGBA -> OBS Browser Source.
// No streaming, recording, credential logging or production-source mutation.
const fs=require('node:fs'),path=require('node:path'),{once}=require('node:events');
const OBS=require('obs-websocket-js/json').default;
const {NativeMattingBridge}=require('../desktop/native-matting-bridge.cjs');
const ROOT=path.resolve(__dirname,'..');
const mode=process.argv.includes('--webcam')?'webcam':'replay';
const OUT=path.join(ROOT,'.artifacts/native-integration-20261101',mode+'-'+Date.now());
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const summary=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?{samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a[a.length-1]}:null;};
async function main(){
 fs.mkdirSync(OUT,{recursive:true});
 const save=(name,data)=>fs.writeFileSync(path.join(OUT,name+'.json'),JSON.stringify(data,null,2));
 const config=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json'),'utf8'));
 const obs=new OBS();obs.on('ConnectionError',()=>{});let backup,bridge,testScene,sceneCreated=false,stopped=false,captureTask,source,entered=false,externalChange=false;
 const created=[],captureTimes=[];let failure=null,lastFrame=null;
 const call=async(type,data)=>{let timer;try{return await Promise.race([obs.call(type,data),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(type+' timed out')),6000);})]);}finally{clearTimeout(timer);}};
 const timer=setTimeout(()=>{stopped=true;failure=Error('Integration probe exceeded 90 seconds');},90000);
 obs.on('CurrentProgramSceneChanged',event=>{if(entered&&event.sceneName!==testScene){externalChange=true;stopped=true;failure=Error('User changed scenes; stopping the probe');}});
 try{
  await obs.connect('ws://127.0.0.1:'+(config.server_port||4455),config.server_password,{rpcVersion:1});
  const [stream,record,program,virtual,video,webcamFilters]=await Promise.all([call('GetStreamStatus'),call('GetRecordStatus'),call('GetCurrentProgramScene'),call('GetVirtualCamStatus'),call('GetVideoSettings'),call('GetSourceFilterList',{sourceName:'Webcam'})]);
  if(stream.outputActive||record.outputActive)throw Error('Probe refused while streaming or recording');
  if(mode==='webcam'&&webcamFilters.filters.some(f=>f.filterEnabled&&f.filterKind==='background_removal'))throw Error('Raw webcam is required; background filter is currently enabled');
  const originalItems=await call('GetSceneItemList',{sceneName:program.currentProgramSceneName});
  const originalWebcamId=originalItems.sceneItems.find(x=>x.sourceName==='Webcam')?.sceneItemId;
  const originalTransform=originalWebcamId===undefined?null:(await call('GetSceneItemTransform',{sceneName:program.currentProgramSceneName,sceneItemId:originalWebcamId})).sceneItemTransform;
  backup={programScene:program.currentProgramSceneName,virtualActive:virtual.outputActive,webcamFilters:webcamFilters.filters,originalWebcamId,originalTransform};
  testScene='SceneSense Native QA '+Date.now();save('recovery',{...backup,testScene});
  bridge=new NativeMattingBridge({root:ROOT,profile:path.join(OUT,'directml-profile'),transport:process.argv.includes('--raw')?'raw':process.argv.includes('--png')?'png':'jpeg-alpha'});bridge.on('failure',error=>{failure=error;stopped=true;});bridge.on('frame',packet=>{lastFrame=packet;});
  await bridge.start();console.log(JSON.stringify({phase:'native-ready',mode,gpu:bridge.workerInfo.gpu.name}));
  await call('CreateScene',{sceneName:testScene});sceneCreated=true;
  const background=testScene+' checker';
  await call('CreateInput',{sceneName:testScene,inputName:background,inputKind:'image_source',inputSettings:{file:path.join(ROOT,'.artifacts/native-integration-20261101/checker.png')},sceneItemEnabled:true});created.push(background);
  const fit=async(id,width=video.baseWidth,height=video.baseHeight)=>call('SetSceneItemTransform',{sceneName:testScene,sceneItemId:id,sceneItemTransform:{positionX:0,positionY:0,alignment:5,boundsType:'OBS_BOUNDS_STRETCH',boundsWidth:width,boundsHeight:height}});
  const bgItems=await call('GetSceneItemList',{sceneName:testScene});await fit(bgItems.sceneItems.find(x=>x.sourceName===background).sceneItemId);
  let rawItem;
  if(mode==='replay'){
   source=testScene+' replay';
   rawItem=await call('CreateInput',{sceneName:testScene,inputName:source,inputKind:'ffmpeg_source',inputSettings:{is_local_file:true,local_file:path.join(ROOT,'.artifacts/matting-evaluation-20261101/raw.mkv'),looping:true,restart_on_activate:true,close_when_inactive:false,hw_decode:false},sceneItemEnabled:true});created.push(source);await call('SetInputMute',{inputName:source,inputMuted:true});
  }else{source='Webcam';rawItem=await call('CreateSceneItem',{sceneName:testScene,sourceName:source,sceneItemEnabled:true});}
  // Keep the raw source active without displaying its opaque background.
  await call('SetSceneItemTransform',{sceneName:testScene,sceneItemId:rawItem.sceneItemId,sceneItemTransform:{positionX:-10000,positionY:-10000,alignment:5}});
  const browser=testScene+' native';
  const viewer=once(bridge,'viewer');
  const item=await call('CreateInput',{sceneName:testScene,inputName:browser,inputKind:'browser_source',inputSettings:{url:bridge.url,width:640,height:360,fps:30,shutdown:false,restart_when_active:false},sceneItemEnabled:true});created.push(browser);await fit(item.sceneItemId);
  await call('SetCurrentProgramScene',{sceneName:testScene});entered=true;
  if(!virtual.outputActive)await call('StartVirtualCam');
  await Promise.race([viewer,wait(12000).then(()=>{throw Error('OBS browser did not connect to local transport');})]);
  captureTask=(async()=>{while(!stopped){const started=Date.now();const shot=await call('GetSourceScreenshot',{sourceName:source,imageFormat:'jpg',imageWidth:640,imageHeight:360,imageCompressionQuality:95});captureTimes.push(Date.now()-started);if(!stopped)bridge.submit(Buffer.from(shot.imageData.split(',')[1],'base64'),started);await wait(Math.max(0,33-(Date.now()-started)));}})().catch(error=>{failure=error;stopped=true;});
  const waitStart=Date.now();while(!stopped&&bridge.stats.acknowledged<5){if(Date.now()-waitStart>10000)throw Error('No native frames reached the OBS browser');await wait(50);}
  if(failure)throw failure;
  const initial=await call('GetStats'),start=Date.now(),before=structuredClone(bridge.stats);
  console.log(JSON.stringify({phase:'measuring',mode,seconds:20}));
  while(!stopped&&Date.now()-start<20000)await wait(100);
  const after=await call('GetStats'),elapsed=Date.now()-start;
  const measured=structuredClone(bridge.stats);
  stopped=true;await captureTask;
  const flushStart=Date.now();while(bridge.busy||bridge.latestInput||[...bridge.wss.clients].some(ws=>ws.waiting)){if(Date.now()-flushStart>1500)throw Error('Native output did not flush');await wait(10);}
  await wait(70);
  if(lastFrame?.toString('ascii',0,4)==='SSJP'){const colourLength=lastFrame.readUInt32LE(44);fs.writeFileSync(path.join(OUT,'expected-alpha.png'),lastFrame.subarray(48+colourLength));fs.writeFileSync(path.join(OUT,'foreground.jpg'),lastFrame.subarray(48,48+colourLength));}
  for(const [name,sourceName] of [['alpha',browser],['program',testScene]]){
   const shot=await call('GetSourceScreenshot',{sourceName,imageFormat:'png',imageWidth:640,imageHeight:360});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(shot.imageData.split(',')[1],'base64'));
  }
  const result={mode,transport:bridge.transport,gpu:bridge.workerInfo.gpu,profileProviders:bridge.workerInfo.providers,elapsedMs:elapsed,produced:measured.produced-before.produced,canvasAcknowledged:measured.acknowledged-before.acknowledged,deliveredFps:(measured.acknowledged-before.acknowledged)/(elapsed/1000),captureMs:summary(captureTimes.slice(before.submitted)),workerMs:summary(measured.workerMs.slice(before.produced)),captureToCanvasMs:summary(measured.captureToCanvasMs.slice(before.acknowledged)),stages:Object.fromEntries(['inputWaitMs','outputTransferMs','browserMs','payloadBytes'].map(k=>[k,summary(measured[k].slice(k==='browserMs'?before.acknowledged:before.produced))])),inputReplaced:measured.inputReplaced-before.inputReplaced,browserReplaced:measured.browserReplaced-before.browserReplaced,obs:{fps:after.activeFps,renderFrames:after.renderTotalFrames-initial.renderTotalFrames,skipped:after.renderSkippedFrames-initial.renderSkippedFrames,cpuUsage:after.cpuUsage},limitations:['Canvas acknowledgement is not a camera exposure or OBS presentation timestamp.','Replay mode is real-time replay of previously captured footage, not a new live-camera test.','No game performance measurement or visual quality percentage.'],failure:failure?.message};save('results',result);console.log(JSON.stringify({phase:'complete',...result}));
  save('worker-timing-samples',bridge.stats.timingSamples);if(failure)throw failure;
 }finally{
  stopped=true;clearTimeout(timer);if(captureTask)await captureTask;
  const recovery=[];
  const restore=async(label,operation)=>{try{await operation();recovery.push({label,ok:true});}catch(error){recovery.push({label,ok:false,error:error.message});}};
  if(backup){
   entered=false;
   if(!externalChange)await restore('program scene',()=>call('SetCurrentProgramScene',{sceneName:backup.programScene}));
   if(!backup.virtualActive)await restore('virtual camera',()=>call('StopVirtualCam'));
   for(const name of created.reverse())await restore('owned input',()=>call('RemoveInput',{inputName:name}));
   if(sceneCreated)await restore('owned scene',()=>call('RemoveScene',{sceneName:testScene}));
  }
  if(bridge)await restore('native worker and local server',()=>bridge.stop());
  if(backup){const [program,virtual,filters,scenes]=await Promise.all([call('GetCurrentProgramScene'),call('GetVirtualCamStatus'),call('GetSourceFilterList',{sourceName:'Webcam'}),call('GetSceneList')]);const actualTransform=backup.originalWebcamId===undefined?null:(await call('GetSceneItemTransform',{sceneName:backup.programScene,sceneItemId:backup.originalWebcamId})).sceneItemTransform;const verified={programScene:externalChange||program.currentProgramSceneName===backup.programScene,virtualCamera:virtual.outputActive===backup.virtualActive,webcamFilters:require('node:util').isDeepStrictEqual(filters.filters,backup.webcamFilters),webcamTransform:require('node:util').isDeepStrictEqual(actualTransform,backup.originalTransform),testSceneRemoved:!scenes.scenes.some(s=>s.sceneName===testScene),workerStopped:!bridge?.child||bridge.child.exitCode!==null||bridge.child.signalCode!==null};save('restoration',{recovery,verified});console.log(JSON.stringify({phase:'restored',verified}));if(recovery.some(r=>!r.ok)||Object.values(verified).some(v=>!v))process.exitCode=1;}
  await obs.disconnect();console.log(JSON.stringify({evidenceDirectory:path.relative(ROOT,OUT)}));
 }
}
// An OS-owned loopback listener prevents probes from overlapping, including cleanup.
// A process exit releases the guard; no stale filesystem lock needs user recovery.
const guard=require('node:net').createServer(socket=>socket.destroy());
guard.once('error',()=>{console.error('Another native OBS probe is still running. Wait for its restoration to finish.');process.exitCode=1;});
guard.listen(59457,'127.0.0.1',()=>{main().catch(error=>{console.error(error.message?.toLowerCase().includes('auth')?'Local OBS authentication failed':error.message);process.exitCode=1;}).finally(()=>guard.close());});

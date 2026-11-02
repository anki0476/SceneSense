// Short local A/B timing probe; restores the original filter settings/mode.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),OBS=require('obs-websocket-js/json').default;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const o=new OBS(),cfg=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json')));let before;
const target={sourceName:'Webcam',filterName:'SceneSense Native Cutout'};
try{
 await o.connect('ws://127.0.0.1:'+cfg.server_port,cfg.server_password);
 const [s,r]=await Promise.all([o.call('GetStreamStatus'),o.call('GetRecordStatus')]);if(s.outputActive||r.outputActive)throw Error('Active stream/recording; A/B changes refused');
 before=await o.call('GetSourceFilter',target);const phases=[];
 for(const [name,enabled] of [['original',false],['native',true],['original_again',false]]){
  await o.call('SetSourceFilterSettings',{...target,filterSettings:{native_active:enabled},overlay:true});
  await o.call('SetSourceFilterEnabled',{...target,filterEnabled:enabled});await wait(enabled?2500:1000);
  const first=await o.call('GetStats'),started=Date.now(),samples=[];
  for(let i=0;i<6;i++){
   let gpu;try{gpu=execFileSync('C:/Windows/System32/nvidia-smi.exe',['--query-gpu=utilization.gpu,memory.used,clocks.current.graphics,power.draw','--format=csv,noheader,nounits'],{encoding:'utf8',windowsHide:true,timeout:3000}).trim();}catch(e){gpu='unavailable';}
   const filter=await o.call('GetSourceFilter',target),stats=await o.call('GetStats');samples.push({at:Date.now(),gpu,settings:filter.filterSettings,enabled:filter.filterEnabled,renderMs:stats.averageFrameRenderTime,fps:stats.activeFps});await wait(750);
  }
  const last=await o.call('GetStats');phases.push({name,elapsedMs:Date.now()-started,renderedFrames:last.renderTotalFrames-first.renderTotalFrames,skippedFrames:last.renderSkippedFrames-first.renderSkippedFrames,samples});
 }
 fs.mkdirSync('.artifacts/native-latency',{recursive:true});fs.writeFileSync('.artifacts/native-latency/ab-results.json',JSON.stringify(phases,null,2));
 for(const p of phases)console.log(JSON.stringify({name:p.name,elapsedMs:p.elapsedMs,renderedFrames:p.renderedFrames,skippedFrames:p.skippedFrames,renderMs:p.samples.map(s=>s.renderMs),gpu:p.samples.map(s=>s.gpu),frameAgeMs:p.samples.map(s=>s.settings.frame_age_ms),processingMs:p.samples.map(s=>s.settings.processing_ms),processedFrames:p.samples.map(s=>s.settings.processed_frames)}));
}finally{if(before){await o.call('SetSourceFilterSettings',{...target,filterSettings:{native_active:!!before.filterSettings.native_active},overlay:true});await o.call('SetSourceFilterEnabled',{...target,filterEnabled:before.filterEnabled});}await o.disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1});

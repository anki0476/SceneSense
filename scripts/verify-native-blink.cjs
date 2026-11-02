// Local regression probe: screenshots only; no stream or OBS recording.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const OBS=require('obs-websocket-js/json').default;
const out=path.resolve(__dirname,'../.artifacts/native-blink');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const cfg=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'obs-studio/plugin_config/obs-websocket/config.json')));
 const o=new OBS();
 try {
  await o.connect('ws://127.0.0.1:'+cfg.server_port,cfg.server_password);
  const [stream,record,filters]=await Promise.all([o.call('GetStreamStatus'),o.call('GetRecordStatus'),o.call('GetSourceFilterList',{sourceName:'Webcam'})]);
  if(stream.outputActive||record.outputActive)throw Error('Active stream/recording; probe stopped');
  const native=filters.filters.find(f=>f.filterName==='SceneSense Native Cutout');
  if(!native?.filterEnabled)throw Error('Native cutout is not enabled');
  const previous=JSON.parse(fs.readFileSync(path.join(out,'restart.json')));
  if(previous.virtualCameraActive&&!(await o.call('GetVirtualCamStatus')).outputActive)await o.call('StartVirtualCam');
  await wait(3000);
  const first=await o.call('GetStats'),t=Date.now();
  for(let i=0;i<40;i++){
   const shot=await o.call('GetSourceScreenshot',{sourceName:'Webcam',imageFormat:'png',imageWidth:640,imageHeight:360});
   fs.writeFileSync(path.join(out,`frame-${String(i).padStart(3,'0')}.png`),Buffer.from(shot.imageData.split(',')[1],'base64'));
   await wait(125);
  }
  const last=await o.call('GetStats'),filter=await o.call('GetSourceFilter',{sourceName:'Webcam',filterName:native.filterName});
  const decode=spawnSync('C:/ffmpeg/ffmpeg.exe',['-v','error','-framerate','8','-i',path.join(out,'frame-%03d.png'),'-frames:v','40','-pix_fmt','rgba','-f','rawvideo','pipe:1'],{maxBuffer:50*1024*1024});
  if(decode.status!==0)throw Error('PNG decode failed: '+decode.stderr);
  const raw=decode.stdout,size=640*360*4,frames=[];
  for(let n=0;n<40;n++){
   let foreground=0,cornerOpaque=0;
   for(let y=0;y<360;y++)for(let x=0;x<640;x++){
    const a=raw[n*size+(y*640+x)*4+3];if(a>32)foreground++;
    if(x<60&&y<60&&a>200)cornerOpaque++;
   }
   frames.push({foregroundPixels:foreground,opaqueTopLeftPixels:cornerOpaque});
  }
  const result={samples:40,elapsedMs:Date.now()-t,roomFlashFrames:frames.filter(f=>f.opaqueTopLeftPixels>1800).length,emptyFrames:frames.filter(f=>f.foregroundPixels<200).length,obsFps:last.activeFps,skipped:last.renderSkippedFrames-first.renderSkippedFrames,filterSettings:filter.filterSettings,frames,scope:'Sparse live Webcam source PNG samples; top-left room patch and nonempty cutout. Not every rendered frame or motion acceptance.'};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,frames:undefined}));
  if(result.roomFlashFrames||result.emptyFrames)throw Error('Output still flashes or disappears; inspect captured samples');
 }finally{await o.disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1});

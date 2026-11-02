const {z}=require('zod');
const fs=require('node:fs'),path=require('node:path');
const {FrameHealth}=require('./frame-health.cjs');
// Control-state monitoring only. No video/audio capture, model calls or repair
// side effects occur during observation. An explicit repair request is required.
class StreamSupervisor{
 constructor(obs,publish,{beforeRepair=async()=>{},reconnect=async()=>{throw Error('Reconnect is unavailable.');},sampleFrame,preferencePath,now=Date.now}={}){
  Object.assign(this,{obs,publish,beforeRepair,reconnect,sampleFrame,preferencePath,now});this.frames=new FrameHealth();this.videoIssues=[];let preferences={};try{preferences=JSON.parse(fs.readFileSync(preferencePath,'utf8'));}catch{}this.state={status:'offline',lastRepair:undefined,issues:[],microphones:[],microphone:preferences.microphone||'',videoEnabled:preferences.videoEnabled===true,videoStatus:'off',message:'Connect OBS to monitor your studio.'};this.listeners=[];this.revision=0;this.videoTimer=setInterval(()=>{if(this.obs.state.status==='connected'&&!this.repairing)void this.check().catch(()=>{});},4000);this.videoTimer.unref?.();
  for(const event of ['InputMuteStateChanged','SceneItemEnableStateChanged','SceneItemRemoved','InputRemoved','InputNameChanged','CurrentProgramSceneChanged']){const listener=()=>this.schedule();obs.client.on(event,listener);this.listeners.push([event,listener]);}
 }
 emit(){const webcam=this.frames.samples.webcam;this.state.webcamSample=webcam?{count:webcam.count,unchangedSeconds:Math.max(0,Math.floor(((this.lastWebcamSampleAt??this.now())-webcam.since)/1000)),visible:webcam.visible,dark:webcam.dark}:null;this.state.monitoredSources=this.target?{scene:this.target.scene,webcam:this.target.webcamName,game:this.target.gameName}:null;this.publish({kind:'supervisor',...this.state});return this.state;}
 sync(state){
  const connected=state.status==='connected';
  if(!connected){this.revision++;this.target=null;this.clearFrames();clearTimeout(this.timer);this.state={...this.state,status:'offline',issues:[{id:'obs-disconnected',title:'OBS is disconnected',detail:'Monitoring is unavailable.',repairable:true,action:'Open OBS and reconnect'}],message:'Monitoring unavailable.'};this.emit();return;}
  if(this.target&&this.target.scene!==state.currentScene){this.target=null;this.clearFrames();this.revision++;}
  if(state.selection){const s=state.selection,w=state.items.find(i=>i.id===s.webcamId),g=state.items.find(i=>i.id===s.gameId);if(w&&g){const next={scene:s.scene,webcamId:w.id,webcamName:w.name,gameId:g.id,gameName:g.name};if(JSON.stringify(next)!==JSON.stringify(this.target)){this.target=next;this.clearFrames();this.revision++;}}}
  this.schedule();
 }
 schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.check().catch(()=>{});},150);this.timer.unref?.();}
 clearFrames(){this.frames.reset();this.videoIssues=[];this.lastVideoAt=undefined;this.lastWebcamSampleAt=undefined;}
 savePreferences(){if(!this.preferencePath)return;fs.mkdirSync(path.dirname(this.preferencePath),{recursive:true});fs.writeFileSync(this.preferencePath+'.tmp',JSON.stringify({videoEnabled:this.state.videoEnabled,microphone:this.state.microphone}));fs.renameSync(this.preferencePath+'.tmp',this.preferencePath);}
 setVideo(input){const enabled=z.boolean().parse(input);const old=this.state.videoEnabled;this.state.videoEnabled=enabled;try{this.savePreferences();}catch(e){this.state.videoEnabled=old;throw e;}this.clearFrames();this.state.videoStatus=enabled?'warming':'off';return this.check();}
 cancelRepair(){this.repairAbort?.abort();this.state.lastRepair='Cancellation requested. Any command already sent may have applied.';return this.emit();}
 async check(){
  const revision=++this.revision,target=this.target;const issues=[];
  if(this.obs.state.status!=='connected'){this.sync(this.obs.state);return this.state;}
  try{
   const {inputs}=await this.obs.call('GetInputList',undefined,false);
   const microphones=inputs.filter(x=>['wasapi_input_capture','coreaudio_input_capture','pulse_input_capture','alsa_input_capture'].includes(x.inputKind)).map(x=>x.inputName);
   let microphone=this.state.microphone;if(!microphones.includes(microphone))microphone=microphones.length===1?microphones[0]:'';
   if(microphone){const {inputMuted}=await this.obs.call('GetInputMute',{inputName:microphone},false);if(inputMuted)issues.push({id:'mic-muted',title:'Microphone is muted',detail:microphone,repairable:true,action:'Unmute microphone'});}
   if(target){const {currentProgramSceneName}=await this.obs.call('GetCurrentProgramScene',undefined,false);if(currentProgramSceneName!==target.scene){if(revision===this.revision)this.target=null;return this.check();}
    const {sceneItems}=await this.obs.call('GetSceneItemList',{sceneName:target.scene},false);
    for(const role of ['webcam','game']){const item=sceneItems.find(i=>i.sceneItemId===target[role+'Id']&&i.sourceName===target[role+'Name']);if(!item)issues.push({id:role+'-missing',title:role==='webcam'?'Webcam source changed':'Game source changed',detail:'Confirm your sources again.',repairable:false});else if(!item.sceneItemEnabled)issues.push({id:role+'-hidden',title:role==='webcam'?'Webcam is hidden':'Game source is hidden',detail:item.sourceName,repairable:true,action:role==='webcam'?'Show webcam':'Show game source'});}
   }
   if(this.state.videoEnabled&&this.sampleFrame&&target&&!this.checkingVideo&&(this.lastVideoAt===undefined||this.now()-this.lastVideoAt>=3500)){
    this.checkingVideo=true;this.lastVideoAt=this.now();const findings=[];
    try{for(const role of ['game','webcam']){if(issues.some(x=>x.id.startsWith(role+'-'))){delete this.frames.samples[role];continue;}const frame=await this.sampleFrame(target[role+'Name']);if(revision!==this.revision)return this.state;const sampledAt=this.now();const issue=this.frames.observe(role,frame,sampledAt);if(role==='webcam')this.lastWebcamSampleAt=sampledAt;if(issue)findings.push(issue);}this.videoIssues=findings;this.state.videoStatus='sampling';}
    catch(error){if(revision===this.revision){this.clearFrames();this.lastVideoAt=this.now();this.state.videoStatus='unavailable';this.state.videoError='Video check unavailable: '+error.message;}}
    finally{this.checkingVideo=false;}
   }
   if(this.state.videoEnabled)issues.push(...this.videoIssues.filter(x=>!issues.some(i=>i.id.startsWith(x.id.split('-')[0]+'-'))));
   if(revision!==this.revision)return this.state;
   this.state={...this.state,lastRepair:JSON.stringify(issues)===JSON.stringify(this.state.issues)?this.state.lastRepair:undefined,status:issues.length?'attention':'monitoring',issues,microphones,microphone,checkedAt:Date.now(),message:issues.length?'OBS controls need attention.':!target?'Confirm webcam and game sources to monitor them.':!microphone?'Choose a microphone to monitor its mute state.':'No monitored control issues detected.'};return this.emit();
  }catch(error){if(revision===this.revision){this.state={...this.state,status:'unavailable',issues:[],message:'Could not read OBS controls. '+error.message};this.emit();}throw error;}
 }
 async selectMicrophone(input){const name=z.string().min(1).max(256).parse(input);if(!this.state.microphones.includes(name))throw Error('Choose an OBS microphone from the list.');const previous=this.state.microphone;this.state.microphone=name;try{this.savePreferences();}catch(e){this.state.microphone=previous;throw e;}return this.check();}
 async repairMany(plan){
  const allowed=['mic-muted','webcam-hidden','game-hidden'];
  if(plan!=='all'&&(!Array.isArray(plan)||!plan.length||plan.some(id=>!allowed.includes(id))))throw Error('Specify which reported issues to fix.');
  await this.check();
  const ids=plan==='all'?this.state.issues.filter(x=>allowed.includes(x.id)).map(x=>x.id):[...new Set(plan)];
  if(!ids.length)throw Error(this.state.issues.length?'These issues need review: '+this.state.issues.map(x=>x.title).join('; '):'No supported microphone or visibility issues are reported.');
  const context=JSON.stringify(this.target),microphone=this.state.microphone,results=[];
  for(const id of ids){
   if(JSON.stringify(this.target)!==context||this.state.microphone!==microphone||this.obs.state.status!=='connected'){results.push('Stopped: studio context changed.');break;}
   try{const result=await this.repair(id);results.push(result.lastRepair);}catch(error){results.push('Not completed: '+id+' — '+error.message);break;}
  }
  const unresolved=this.state.issues.filter(x=>!allowed.includes(x.id));if(unresolved.length)results.push('Still needs review: '+unresolved.map(x=>x.title).join('; ')+'.');
  const message=results.join(' ');this.state.lastRepair=message;this.emit();return message;
 }
 async repair(input){
  const id=z.enum(['mic-muted','webcam-hidden','game-hidden','obs-disconnected','game-black','webcam-frozen','current']).parse(input);
  if(this.repairing)throw Error('A repair is already running.');this.repairing=true;this.repairAbort=new AbortController();this.state.repairing=true;this.emit();const signal=this.repairAbort.signal;const cancelled=()=>{if(signal.aborted)throw Error('Repair cancelled. Any command already sent may have applied; refresh to check.');};
  try{
   if(id==='obs-disconnected'||(id==='current'&&this.obs.state.status!=='connected')){
    if(this.obs.state.status==='connected')return this.check();
    await this.beforeRepair();cancelled();await this.reconnect(signal);cancelled();if(this.obs.state.status!=='connected')throw Error('OBS did not reconnect.');await this.check();this.state.lastRepair='Verified in OBS: connection restored.';return this.emit();
   }
   await this.check();const eligible=this.state.issues.filter(x=>x.repairable&&x.id!=='obs-disconnected');const issue=id==='current'?(eligible.length===1?eligible[0]:null):eligible.find(x=>x.id===id);
   if(!issue)throw Error(id==='current'?'Choose one reported issue to fix.':'That issue is no longer reported. Refresh the supervisor.');
   await this.beforeRepair();
   const target=this.target?{...this.target}:null,mic=this.state.microphone;
   const guard=()=>{cancelled();if(this.obs.state.status!=='connected'||JSON.stringify(target)!==JSON.stringify(this.target)||mic!==this.state.microphone)throw Error('Studio context changed. Check again before repairing.');};
   await this.obs.exclusive(async()=>{
    guard();
    if(issue.id==='mic-muted'){
     await this.obs.call('GetInputMute',{inputName:mic});guard();await this.obs.call('SetInputMute',{inputName:mic,inputMuted:false});guard();const actual=await this.obs.call('GetInputMute',{inputName:mic});guard();if(actual.inputMuted)throw Error('OBS did not confirm unmuting the microphone.');
    }else{
     if(!target)throw Error('Confirm sources first.');const role=issue.id.startsWith('webcam-')?'webcam':'game';
     const {currentProgramSceneName}=await this.obs.call('GetCurrentProgramScene');guard();if(currentProgramSceneName!==target.scene)throw Error('Active scene changed. Repair cancelled.');
     const {sceneItems}=await this.obs.call('GetSceneItemList',{sceneName:target.scene});guard();if(!sceneItems.some(i=>i.sceneItemId===target[role+'Id']&&i.sourceName===target[role+'Name']))throw Error('Source changed. Confirm sources again.');
     if(issue.reviewOnly){await this.obs.call('OpenInputPropertiesDialog',{inputName:target[role+'Name']});guard();return;}
     await this.obs.call('SetSceneItemEnabled',{sceneName:target.scene,sceneItemId:target[role+'Id'],sceneItemEnabled:true});guard();
     const actual=await this.obs.call('GetSceneItemEnabled',{sceneName:target.scene,sceneItemId:target[role+'Id']});guard();if(!actual.sceneItemEnabled)throw Error('OBS did not confirm showing the source.');
    }
   });
   await this.check();this.state.lastRepair=issue.reviewOnly?'Opened source settings in OBS. Recovery has not been verified.':'Verified in OBS: '+issue.action+'.';return this.emit();
  }finally{this.repairing=false;this.state.repairing=false;this.repairAbort=null;this.emit();}
 }
 destroy(){this.repairAbort?.abort();clearInterval(this.videoTimer);clearTimeout(this.timer);this.revision++;for(const [event,listener]of this.listeners)this.obs.client.off(event,listener);}
}
module.exports={StreamSupervisor};

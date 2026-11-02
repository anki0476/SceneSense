const fs=require('node:fs'),path=require('node:path');
const {inspectLayout}=require('./layout-vision.cjs');
class LayoutAssist{
  constructor(obs,publish,{getKey,isVoiceActive,inspect=inspectLayout,now=Date.now,preferencePath}={}){
    this.obs=obs;this.publish=publish;this.getKey=getKey;this.isVoiceActive=isVoiceActive;this.inspect=inspect;this.now=now;this.epoch=0;
    this.preferencePath=preferencePath;let prefs={};try{prefs=JSON.parse(fs.readFileSync(preferencePath,'utf8'));}catch{}
    this.state={allowShrinking:prefs.allowShrinking===true,watching:false,mode:prefs.auto===true?'auto':'assist',status:'off',message:'Check whether your webcam covers important game information.',checks:0};
  }
  setPreferences(input){
    const prefs=require('zod').z.object({auto:require('zod').z.boolean(),allowShrinking:require('zod').z.boolean()}).strict().parse(input);
    if(this.preferencePath){fs.mkdirSync(path.dirname(this.preferencePath),{recursive:true});fs.writeFileSync(this.preferencePath+'.tmp',JSON.stringify(prefs));fs.renameSync(this.preferencePath+'.tmp',this.preferencePath);}
    const watching=this.state.watching,undo=this.undoRecord;this.reset();this.undoRecord=undo;this.state.canUndo=!!undo;this.state.mode=prefs.auto?'auto':'assist';this.state.allowShrinking=prefs.allowShrinking;this.state.status=watching?'watching':'off';this.state.message='Watching preferences saved.';if(watching)this.schedule(0);this.emit();return this.state;
  }
  emit(){this.publish({kind:'layout',...this.state});}
  reset(){this.epoch++;this.abort?.abort();clearTimeout(this.timer);clearTimeout(this.expiry);this.timer=null;this.recommendation=null;this.streak=null;this.undoRecord=null;this.state.canUndo=false;this.state.recommendation=null;this.state.evidence=null;this.state.analysis=null;}
  stop(message='Layout checks stopped.',{preserveUndo=false}={}) {const undo=preserveUndo?this.undoRecord:null;this.reset();this.undoRecord=undo;this.state.canUndo=!!undo;this.state.watching=false;this.state.status='off';this.state.message=message;this.emit();return this.state;}
  stopWatching(){return this.stop('Layout checks stopped.',{preserveUndo:true});}
  requireSetup(){if(!this.getKey?.())throw new Error('Configure your OpenAI key before checking game images.');if(!this.obs.state.selection)throw new Error('Confirm webcam and game sources first.');}
  start(mode){if(!['assist','auto'].includes(mode))throw new Error('Unknown layout mode.');this.requireSetup();this.reset();this.pauseUntil=0;this.state.mode=mode;this.state.watching=true;this.schedule(0);this.state.status='watching';this.state.message='Starting game-source checks…';this.emit();return this.state;}
  schedule(delay=8000){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.watchTick();},delay);}
  async watchTick(){
    if(!this.state.watching)return this.state;
    const rec=this.recommendation;
    if(rec&&this.now()<rec.expires&&(this.state.mode!=='auto'||rec.result.requiresApproval)){
      this.schedule(Math.min(8000,Math.max(100,rec.expires-this.now())));return this.state;
    }
    return this.scan();
  }
  pauseForManual(){this.reset();this.pauseUntil=this.now()+30000;if(this.state.watching){this.state.status='paused';this.state.message='Your control takes priority. Layout checks resume after 30 seconds.';this.emit();this.schedule();}else{this.state.status='off';this.state.message='Ready when you need a check.';this.emit();}}
  async yieldToManual(){const pending=this.done;this.pauseForManual();await pending;}
  async yieldToVoice(){
    const pending=this.done,rec=this.recommendation,undo=this.undoRecord,evidence=this.state.evidence,pausedUntil=this.pauseUntil||0;
    this.pauseForManual();this.pauseUntil=pausedUntil;const epoch=this.epoch;
    if(rec&&this.now()<rec.expires){rec.sample.checkpoint.canApply=()=>epoch===this.epoch&&!this.isVoiceActive?.();this.recommendation=rec;this.state.recommendation={...rec.result,expiresAt:rec.expires};this.expiry=setTimeout(()=>{if(epoch===this.epoch&&this.recommendation){this.recommendation=null;this.state.recommendation=null;this.state.status='expired';this.emit();}},Math.max(0,rec.expires-this.now()));}
    if(this.recommendation||undo)this.state.evidence=evidence;
    if(this.recommendation)this.state.status='suggestion';
    this.undoRecord=undo;this.state.canUndo=!!undo;this.emit();await pending;
  }
  async checkNow(){if(this.busy)throw new Error('An image check is already running.');this.pauseUntil=0;return this.scan();}
  async scan(){
    if(this.busy){if(this.state.watching)this.schedule(500);return this.state;}
    if(this.isVoiceActive?.()||this.now()<(this.pauseUntil||0)){this.state.status='paused';this.state.message='Paused for voice or a recent manual change.';this.emit();if(this.state.watching)this.schedule();return this.state;}
    const epoch=this.epoch;this.busy=true;this.done=new Promise(resolve=>this.resolveDone=resolve);this.state.status='checking';this.state.message='Inspecting the game source…';this.emit();
    this.abort=new AbortController();const timeout=setTimeout(()=>this.abort.abort(),30000);
    try{
      this.requireSetup();const sample=await this.obs.layoutSample();if(epoch!==this.epoch)return this.state;
      sample.checkpoint.canApply=()=>epoch===this.epoch&&!this.isVoiceActive?.();
      sample.allowShrinking=this.state.allowShrinking;
      if(!sample.allowShrinking&&sample.placements){const keep=Object.keys(sample.placements).filter(n=>sample.placements[n].scale===1);sample.placements=Object.fromEntries(keep.map(n=>[n,sample.placements[n]]));for(const rects of [sample.rects,sample.canvasRects])if(rects)rects.candidates=Object.fromEntries(Object.entries(rects.candidates).filter(([n])=>keep.includes(n)));if(sample.crops)sample.crops=Object.fromEntries(Object.entries(sample.crops).filter(([n])=>n==='current'||keep.includes(n)));}
      const result=await this.inspect(this.getKey(),sample,this.abort.signal);if(epoch!==this.epoch)return this.state;
      this.state.analysis={reason:result.reason,blockedProbability:result.blockedProbability,categoryConfidence:result.categoryConfidence,obstruction:result.obstruction,risks:result.risks};this.state.checks++;this.state.checkedAt=this.now();
      this.state.evidence={image:sample.image,rects:sample.rects,canvasRects:sample.canvasRects};
      this.recommendation=result.actionable?{sample,result,expires:Math.min(this.now()+(sample.checkpoint.maxAge?30000:10000),sample.checkpoint.capturedAt+(sample.checkpoint.maxAge||12000))}:null;
      if(this.recommendation){sample.checkpoint.maxAge=this.recommendation.expires-sample.checkpoint.capturedAt;}
      this.state.recommendation=result.actionable?{...result,expiresAt:this.recommendation.expires}:null;
      clearTimeout(this.expiry);
      if(this.recommendation)this.expiry=setTimeout(()=>{if(epoch!==this.epoch||!this.recommendation)return;this.recommendation=null;this.state.recommendation=null;this.state.status='expired';this.state.message='Frame expired. Check again.';this.emit();},Math.max(0,this.recommendation.expires-this.now()));
      this.state.status=result.actionable?'suggestion':result.reason==='no-safe-corner'?'blocked':'clear';
      this.state.message=result.actionable?`Possible ${result.obstruction} obstruction. Suggested placement: ${result.position.replace('-',' ')}.`:result.reason==='no-safe-corner'?'Obstruction detected, but no sufficiently clear placement was found. Webcam unchanged.':result.reason==='uncertain-category'?'Possible obstruction, but its type is uncertain. Webcam unchanged.':result.reason==='uncertain-obstruction'?'Not confident enough that this webcam area blocks important content. Webcam unchanged.':'No confident improvement identified in this frame.';
      const signature=JSON.stringify({position:result.position,transform:sample.checkpoint.transform,generation:sample.checkpoint.generation,selection:sample.checkpoint.selection,game:sample.checkpoint.gameTransform});
      this.streak=result.actionable?{signature,count:this.streak?.signature===signature?this.streak.count+1:1}:null;
      if(this.state.mode==='auto'&&this.state.watching&&this.streak?.count>=2&&!result.requiresApproval){await this.apply();if(epoch!==this.epoch)return this.state;this.pauseUntil=this.now()+20000;this.state.message='Moved to '+result.position.replace('-',' ')+' after two matching checks. Cooling down for 20 seconds.';}
      this.emit();
    }catch(error){if(epoch===this.epoch){this.state.watching=false;this.state.status='error';this.state.message=error.name==='AbortError'?'Image analysis timed out. Checks stopped; try again.':error.message;this.recommendation=null;this.state.recommendation=null;this.streak=null;this.emit();}}
    finally{clearTimeout(timeout);this.busy=false;this.resolveDone?.();this.done=null;if(this.state.watching&&!this.timer)this.schedule();}
    return this.state;
  }
  async apply(explicit=false){
    const epoch=this.epoch;
    const recommendation=this.recommendation;
    if(!recommendation||this.now()>recommendation.expires)throw new Error('Recommendation expired. Check the current frame again.');
    if(this.isVoiceActive?.()||(!explicit&&this.now()<(this.pauseUntil||0)))throw new Error('Voice or manual control currently has priority.');
    this.recommendation=null;this.state.recommendation=null;this.streak=null;
    let actual;
    try{actual=await this.obs.applyVoicePlan(recommendation.sample.checkpoint,{position:recommendation.result.placement?'keep':recommendation.result.position,size:'keep'},recommendation.result.placement);}
    catch(error){if(epoch===this.epoch){this.state.status='error';this.state.message=error.message;this.emit();}throw error;}
    if(epoch!==this.epoch)return this.state;
    this.undoRecord={checkpoint:recommendation.sample.checkpoint,actual};this.state.canUndo=true;
    this.state.status='applied';this.state.message='Layout change verified in OBS.';this.emit();return this.state;
  }
  async undo(){
    const record=this.undoRecord,epoch=this.epoch;
    if(!record)throw new Error('No Sense move to undo.');
    if(this.isVoiceActive?.())throw new Error('Finish your voice command first.');
    const checkpoint={...record.checkpoint,expectedTransform:record.actual,capturedAt:Date.now(),canApply:()=>epoch===this.epoch&&!this.isVoiceActive?.()};
    await this.obs.applyVoicePlan(checkpoint,{position:'keep',size:'keep'});
    if(epoch!==this.epoch)return this.state;
    this.undoRecord=null;this.state.canUndo=false;this.state.status='undone';this.state.message='Previous placement restored.';this.pauseUntil=this.now()+30000;this.emit();return this.state;
  }
}
module.exports={LayoutAssist};

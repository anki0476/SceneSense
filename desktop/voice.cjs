const WebSocket = require('ws');
const { z } = require('zod');
const { decide, fastLayoutDecision } = require('./voice-decisions.cjs');
const { transcriptionConfig, transcriptEvent } = require('./transcription.cjs');
class VoiceService {
  constructor(obs,publish,{Socket=WebSocket,decision=decide,beforeStart,executeAppAction,onLayoutAction,hasSenseUndo,onInteraction}={}) {
    this.onInteraction=onInteraction;this.hasSenseUndo=hasSenseUndo;
    this.executeAppAction=executeAppAction;this.onLayoutAction=onLayoutAction;
    this.obs=obs;this.publish=publish;this.Socket=Socket;this.decision=decision;this.beforeStart=beforeStart;this.epoch=0;
    this.state={status:'idle',configured:false,provider:'openai',sampleRate:24000,transcript:'',action:'',error:'',shortcut:'Hold Ctrl+Shift+Z',decisionStatus:'OpenAI Decisions processes live transcript updates.'};
  }
  emit(){this.publish({kind:'voice',...this.state});}
  configure(input){
    if (this.active()) throw new Error('Finish listening before changing the key.');
    const config=typeof input==='string'?{openaiKey:input,provider:'openai',language:'en-IN'}:z.object({openaiKey:z.string(),provider:z.enum(['openai','sarvam']),sarvamKey:z.string().optional(),language:z.enum(['en-IN','auto']).default('en-IN')}).parse(input);
    const key=z.string().min(20).max(512).regex(/^sk-/).parse(config.openaiKey);
    const sarvamKey=config.provider==='sarvam'?z.string().min(10).max(1024).parse(config.sarvamKey):null;
    this.key=key;this.sarvamKey=sarvamKey;this.provider=config.provider;this.language=config.language;
    this.state.provider=this.provider;this.state.sampleRate=this.provider==='sarvam'?16000:24000;
    this.state.configured=true;this.state.error='';this.emit();
  }
  forget(){this.cancel();this.key=null;this.sarvamKey=null;this.state.configured=false;this.emit();}
  active(){return ['connecting','listening','finishing'].includes(this.state.status);}
  async start(){
    if (this.active()) throw new Error('Voice is already active.');
    if (!this.key) throw new Error('Add your OpenAI API key in Voice control first.');
    this.cancel(false);const epoch=this.epoch;
    this.state={...this.state,status:'connecting',transcript:'',action:'',error:'',connectionMs:undefined,firstTranscriptMs:undefined,decisionMs:undefined,executionMs:undefined,audioMs:0,decisionStatus:'Waiting for microphone audio…'};this.emit();
    this.fullText='';this.consumedText='';this.startedAt=Date.now();this.earlyAudio=[];this.earlyBytes=0;this.audioBytes=0;
    try {
      // Open the network connection while OBS yields and saves its checkpoint.
      // Buffered speech is released only after both preparations complete.
      const contextReady=(async()=>{
        if(this.beforeStart)await this.beforeStart();
        if(epoch!==this.epoch)return;
        const checkpoint=this.obs.state&&!this.obs.state.selection?null:await this.obs.voiceCheckpoint();
        if(epoch===this.epoch)this.checkpoint=checkpoint;
      })();
      void contextReady.catch(error=>this.fail(error.message,epoch));
      this.pendingApp=null;this.state.appAction=null;
      this.plan={position:'keep',size:'keep'};this.signature='';this.applied=false;this.terminal=false;this.text='';this.itemId=null;this.processing=false;this.processed='';
      this.transport=transcriptionConfig(this.provider||'openai',this.provider==='sarvam'?this.sarvamKey:this.key,this.language);
      const socket=new this.Socket(this.transport.url,{headers:this.transport.headers});this.socket=socket;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Transcription connection timed out.')),10000);
        const settle=(error)=>{clearTimeout(timer);this.connectReject=null;error?reject(error):resolve();};
        this.connectReject=settle;
        socket.on('open',()=>{if(epoch!==this.epoch)return;if(this.transport.initial)socket.send(JSON.stringify(this.transport.initial));});
        socket.on('message',async raw=>{
          if(epoch!==this.epoch)return;
          try {
            const event=JSON.parse(raw.toString());
            if((event.type||event.event)===this.transport.ready){
              await contextReady;if(epoch!==this.epoch)return;
              if(this.transport.begin)socket.send(JSON.stringify(this.transport.begin));
              this.state.connectionMs=Date.now()-this.startedAt;this.state.status='listening';
              const buffered=this.earlyAudio;this.earlyAudio=[];this.earlyBytes=0;
              for(const chunk of buffered)this.sendAudio(chunk);
              this.emit();settle();
            }
            if(event.event==='error' && event.is_fatal!==false){settle(new Error('Sarvam rejected the transcription session. Check the key, model access and credits.'));this.fail('Sarvam rejected the transcription session. Check the key, model access and credits.',epoch);}
            if(event.type==='error'){settle(new Error('OpenAI rejected the voice session. Check model access, key and API credits.'));this.fail('OpenAI rejected the voice session. Check model access, key and API credits.',epoch);}
            const transcript=transcriptEvent(this.provider||'openai',event);
            if(transcript){
              if(this.itemId && transcript.itemId && transcript.itemId!==this.itemId)return;
              this.itemId=transcript.itemId||this.itemId;
              this.fullText=transcript.replace?transcript.text:this.fullText+transcript.text;
              this.text=this.fullText.startsWith(this.consumedText)?this.fullText.slice(this.consumedText.length):'';
              if(this.state.firstTranscriptMs===undefined)this.state.firstTranscriptMs=Date.now()-this.startedAt;
              this.transcript(epoch);if(transcript.final)this.final=true;
            }
          }catch{this.fail('Could not process the voice response.',epoch);}
        });
        socket.on('error',()=>{settle(new Error('Could not connect to transcription. Check provider key, credits and network.'));this.fail('Could not connect to transcription. Check provider key, credits and network.',epoch);});
        socket.on('close',()=>{settle(new Error('Transcription connection closed.'));if(epoch===this.epoch)this.fail('Voice connection closed. Hold to speak again to reconnect.',epoch);});
      });
      if(epoch===this.epoch)this.limit=setTimeout(()=>{if(this.state.latched)return;if(this.applied)this.undo=this.checkpoint;this.cancel();},Math.max(1,25000-(Date.now()-this.startedAt)));
    }catch(error){this.fail(error.message,epoch);throw error;}
  }
  queue(epoch,delay=100){if(this.debounce)return;this.debounce=setTimeout(()=>{this.debounce=null;void this.drain(epoch);},delay);}
  transcript(epoch){
    if(this.text.length>2000){this.fail('Voice interaction is too long. Please start a new instruction.',epoch);return;}
    this.state.transcript=this.text;this.emit();
    const ready=fastLayoutDecision(this.text),previous=fastLayoutDecision(this.inflightText||'');
    const correction=!this.text.startsWith(this.inflightText||'')||/\b(actually|instead|no|don't|cancel)\b/i.test(this.text.slice((this.inflightText||'').length));
    // This parser only decides when to supersede an obsolete request. Every
    // action is still selected by OpenAI Decisions, including exact commands.
    if(this.processing&&this.text!==this.inflightText&&(correction||(ready&&JSON.stringify(ready)!==JSON.stringify(previous)))){this.superseded=true;this.abort?.abort();}
    if(this.state.latched){clearTimeout(this.debounce);this.debounce=null;this.queue(epoch,650);}else this.queue(epoch);
  }
  async drain(epoch){
    if(epoch!==this.epoch || this.processing || !this.text.trim() || this.text===this.processed)return;
    if(this.terminal){this.processed=this.text;this.state.decisionStatus='Control completed. Release to finish.';this.emit();return;}
    this.processing=true;this.superseded=false;const text=this.text;this.inflightText=text;
    this.state.decisionStatus='OpenAI Decisions is interpreting your speech…';this.emit();
    this.abort=new AbortController();const timer=setTimeout(()=>this.abort?.abort(),8000);
    try {
      const decisionStart=Date.now();const result=await this.decision(this.key,text,this.abort.signal);
      if(epoch!==this.epoch)return;
      this.state.decisionMs=Date.now()-decisionStart;
      this.processed=text;
      if(this.terminal)return;
      // Continued speech is acceptable; a correction makes an older decision stale.
      const tail=this.text.slice(text.length);
      if(!this.text.startsWith(text) || /\b(actually|instead|no|don't|cancel)\b/i.test(tail))return;
      const previousApp=this.pendingApp;this.pendingApp=result.appAction||((result.control==='undo'&&!this.applied&&this.hasSenseUndo?.())?'undo_sense':null);
      if(this.pendingApp&&this.state.latched){const action=this.pendingApp;this.pendingApp=null;const boundary=this.consumedText+text;let message;this.dispatchingApp=true;try{message=await this.executeAppAction(action,text);}finally{this.dispatchingApp=false;}if(epoch!==this.epoch)return;this.state.appAction=action;this.state.action=message||require('./app-actions.cjs').appActions[action];await this.advanceContinuous(epoch,boundary);this.emit();return;}
      if(this.pendingApp){this.state.action='Command recognized: '+require('./app-actions.cjs').appActions[this.pendingApp];this.state.decisionStatus='Release to execute the app command.';this.emit();return;}
      if(previousApp)this.state.action='';
      if(this.state.latched&&this.state.conversational&&result.control==='none'&&result.position==='keep'&&result.size==='keep'){this.state.action='';await this.advanceContinuous(epoch,this.consumedText+text);this.emit();return;}
      const next={position:result.position==='keep'?this.plan.position:result.position,size:result.size==='keep'?this.plan.size:result.size};
      const signature=JSON.stringify({next,control:result.control});
      if(signature===this.signature){this.state.decisionStatus=this.applied?'OpenAI Decisions confirmed the current action.':'OpenAI Decisions is waiting for a complete, confident layout instruction.';this.emit();return;}
      const start=Date.now();
      if(result.control!=='none'||result.position!=='keep'||result.size!=='keep'){
        if(!this.checkpoint)throw new Error('Connect OBS and confirm webcam/game sources before moving the webcam.');
        this.onLayoutAction?.();
      }
      if(result.control==='undo'){
        const target=this.applied?this.checkpoint:this.undo;
        if(!target)throw new Error('No voice interaction to undo yet.');
        await this.obs.applyVoicePlan(target,{position:'keep',size:'keep'});this.applied=false;this.terminal=true;this.state.action='Undid the voice interaction';
      }else if(result.control==='restore'){
        await this.obs.act('restore');this.applied=true;this.terminal=true;this.state.action='Restored saved setup layout';
      }else if(next.position!=='keep' || next.size!=='keep'){
        await this.obs.applyVoicePlan(this.checkpoint,next);this.plan=next;this.applied=true;this.state.action=[next.position!=='keep'?next.position:'',next.size!=='keep'?next.size:''].filter(Boolean).join(' · ');
      }
      if(epoch!==this.epoch)return;
      this.signature=signature;if(this.state.latched&&(this.applied||this.terminal))await this.advanceContinuous(epoch,this.consumedText+text);this.state.executionMs=Date.now()-start;
      this.state.decisionStatus=this.state.action?'OpenAI Decisions selected the action. OBS verified the change.':'OpenAI Decisions is waiting for a complete, confident layout instruction.';this.emit();
    }catch(error){if(epoch===this.epoch && !(error.name==='AbortError'&&this.superseded))this.fail(error.name==='AbortError'?'Voice decision timed out. Please try again.':error.message,epoch);}
    finally{clearTimeout(timer);if(epoch===this.epoch){this.processing=false;if(this.text!==this.processed)this.queue(epoch,0);}}
  }
  async advanceContinuous(epoch,boundary){
    if(this.applied)this.undo=this.checkpoint;
    if(this.beforeStart){await this.beforeStart();if(epoch!==this.epoch)return;}
    const checkpoint=this.obs.state&&!this.obs.state.selection?null:await this.obs.voiceCheckpoint();
    if(epoch!==this.epoch)return;
    this.onInteraction?.({text:boundary.slice((this.consumedText||'').length),action:this.state.action||null});
    this.checkpoint=checkpoint;this.consumedText=boundary;this.text=this.fullText.startsWith(boundary)?this.fullText.slice(boundary.length):'';this.processed='';this.inflightText='';this.plan={position:'keep',size:'keep'};this.signature='';this.applied=false;this.terminal=false;this.state.decisionStatus='Command applied. Still listening…';
  }
  audio(input){
    if(!['connecting','listening'].includes(this.state.status))return;
    if(!(input instanceof Uint8Array) || input.byteLength>16000 || input.byteLength%2)throw new Error('Invalid microphone audio chunk.');
    if(this.state.status==='connecting'){
      this.earlyBytes+=input.byteLength;
      if(this.earlyBytes>this.state.sampleRate*2*5){this.fail('Voice connection took too long. Buffered speech was discarded; please retry.',this.epoch);return;}
      this.earlyAudio.push(input.slice());return;
    }
    this.sendAudio(input);
  }
  sendAudio(input){
    if(!this.socket || this.socket.readyState!==1)return;
    if(this.socket.bufferedAmount>192000){this.fail('Audio upload is falling behind. Check your connection.',this.epoch);return;}
    this.audioBytes=(this.audioBytes||0)+input.byteLength;
    this.state.audioMs=Math.round(this.audioBytes/(this.state.sampleRate*2)*1000);
    if(!this.text && this.audioBytes<=this.state.sampleRate*2){this.state.decisionStatus='Audio received. Waiting for live transcription…';this.emit();}
    this.socket.send(JSON.stringify(this.transport.audio(Buffer.from(input).toString('base64'))));
  }
  async finish(){
    if(this.state.status==='finishing')return;
    if(this.state.status!=='listening'){this.cancel();return;}
    const epoch=this.epoch;this.state.status='finishing';this.emit();clearTimeout(this.limit);
    if(this.audioBytes< this.state.sampleRate*.2){this.cancel();return;}
    this.socket.send(JSON.stringify(this.transport.finish));
    const until=Date.now()+12000;
    while(epoch===this.epoch && Date.now()<until && (!this.final || this.processing || this.text!==this.processed))await new Promise(resolve=>setTimeout(resolve,30));
    if(epoch!==this.epoch)return;
    if(!this.final || this.processing || this.text!==this.processed){this.fail('The final transcript or decision did not arrive in time. Please retry.',epoch);return;}
    if(this.applied)this.undo=this.checkpoint;
    const spoken=this.text,completed=this.applied?this.state.action:null;
    const appAction=this.pendingApp;this.pendingApp=null;this.cancel();
    if(appAction){
      const dispatchEpoch=this.epoch;this.state.action='';this.state.decisionStatus='Executing app command…';this.emit();
      try{if(!this.executeAppAction)throw new Error('App voice controls are unavailable.');const message=await this.executeAppAction(appAction,this.state.transcript);if(this.epoch!==dispatchEpoch)return;this.state.appAction=appAction;this.state.action=message||require('./app-actions.cjs').appActions[appAction];this.state.decisionStatus='App command completed.';this.emit();this.onInteraction?.({text:spoken,action:this.state.action});}
      catch(error){this.state.action='';this.state.status='error';this.state.error=error.message;this.emit();}
    }else this.onInteraction?.({text:spoken,action:completed});
  }
  cancel(emit=true){
    this.epoch++;clearTimeout(this.debounce);clearTimeout(this.limit);this.abort?.abort();
    this.debounce=null;
    this.connectReject?.(new Error('Voice connection cancelled.'));
    const socket=this.socket;this.socket=null;if(socket){socket.removeAllListeners();socket.on('error',()=>{});socket.terminate();}
    this.audioBytes=0;this.earlyAudio=[];this.earlyBytes=0;this.final=false;this.state.status='idle';if(emit)this.emit();
  }
  fail(message,epoch){if(epoch!==this.epoch)return;this.cancel();this.state.action='';this.state.status='error';this.state.error=message;this.emit();}
}
module.exports={VoiceService};

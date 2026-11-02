const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const { VoiceService } = require('../desktop/voice.cjs');
const { decisionRequest, parseDecision } = require('../desktop/voice-decisions.cjs');
test('exact commands use OpenAI Decisions; local parsing only identifies complete transcript revisions',async()=>{
  const {fastLayoutDecision,decide}=require('../desktop/voice-decisions.cjs');
  let requests=0;
  const fetcher=async(url,options)=>{requests++;assert.equal(url,'https://api.openai.com/v1/decisions');assert.ok(JSON.parse(options.body).input.endsWith('Spoken command: Please move my webcam to the top right.'));return {ok:true,json:async()=>({answers:[{name:'position',type:'choice',choice:'top-right',confidence:.99}]})};};
  assert.equal((await decide('sk-fixture-only','Please move my webcam to the top right.',null,fetcher)).position,'top-right');
  assert.equal(requests,1);
  assert.equal(fastLayoutDecision('undo that').control,'undo');
  assert.equal(fastLayoutDecision('make it smaller').size,'smaller');
  for(const text of ['Do not move my webcam to the top right','top right?','I said top right','"top right"','top','top right actually bottom left','top right and smaller'])assert.equal(fastLayoutDecision(text),null);
});
class Socket extends EventEmitter {
  constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];Socket.latest=this;queueMicrotask(()=>this.emit('open'));}
  send(raw){const message=JSON.parse(raw);this.sent.push(message);if(message.type==='session.update')queueMicrotask(()=>this.message({type:'session.updated'}));if(message.type==='input_audio_buffer.commit')queueMicrotask(()=>this.message({type:'conversation.item.input_audio_transcription.completed',item_id:'one',transcript:this.transcript||''}));}
  message(data){this.emit('message',Buffer.from(JSON.stringify(data)));}
  delta(text){this.transcript=(this.transcript||'')+text;this.message({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:text});}
  terminate(){this.readyState=3;}
}
async function setup(decision){
  const calls=[],events=[];const checkpoint={transform:{positionX:10},generation:1};
  const obs={voiceCheckpoint:async()=>checkpoint,applyVoicePlan:async(cp,plan)=>{calls.push({cp,plan:{...plan}});},act:async action=>calls.push({action})};
  const voice=new VoiceService(obs,event=>events.push({...event}),{Socket,decision});voice.configure('sk-test-only-credential-123456');await voice.start();
  return {voice,calls,events,socket:Socket.latest,checkpoint};
}
const result=(position='keep',size='keep',control='none')=>({position,size,control});

test('Sense app commands wait for final speech and execute after voice capture ends',async()=>{
  const executed=[];const f=await setup(async()=>({...result(),appAction:'watch_start'}));f.voice.executeAppAction=async action=>{assert.equal(f.voice.active(),false);executed.push(action);};
  try{f.socket.delta('Sense, start watching.');clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);assert.equal(executed.length,0);f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.deepEqual(executed,['watch_start']);}finally{f.voice.cancel();}
});
test('a final negation cancels a pending app command',async()=>{
  const executed=[];const f=await setup(async(_key,text)=>text.includes('do not')?result():({...result(),appAction:'watch_start'}));f.voice.executeAppAction=async action=>executed.push(action);
  try{f.socket.delta('Sense, start watching.');clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);f.socket.transcript='Sense, do not start watching.';f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.equal(f.voice.state.status,'idle');assert.equal(executed.length,0);}finally{f.voice.cancel();}
});
test('app classification accepts optional Sense naming and rejects unregistered actions',()=>{
  const {parseDecision,decisionRequest}=require('../desktop/voice-decisions.cjs');
  const body={answers:[{name:'app_action',type:'choice',choice:'watch_stop',confidence:.99}]};
  assert.equal(parseDecision(body,'Sense, stop watching.').appAction,'watch_stop');assert.equal(parseDecision(body,'Stop watching.').appAction,'watch_stop');
  assert.equal(decisionRequest('Sense, stop watching.').questions.length,4);body.answers[0].choice='run-shell';assert.throws(()=>parseDecision(body,'Sense, do it.'));
});

test('voice buffers first audio while an image check yields control',async()=>{
  let release;const voice=new VoiceService({voiceCheckpoint:async()=>({})},()=>{},{Socket,decision:async()=>result(),beforeStart:()=>new Promise(r=>release=r)});
  voice.configure('sk-test-only-credential-123456');const previousSocket=Socket.latest;const starting=voice.start();assert.notEqual(Socket.latest,previousSocket,'transcription opens while OBS is still yielding');voice.audio(new Uint8Array([1,0,2,0]));assert.equal(voice.state.status,'connecting');release();await starting;
  try{assert.equal(Socket.latest.sent.find(x=>x.type==='input_audio_buffer.append').audio,'AQACAA==');}finally{voice.cancel();}
});
test('a complete exact command supersedes a slower in-flight interpretation without failing the turn',async()=>{
  const {fastLayoutDecision}=require('../desktop/voice-decisions.cjs');
  const f=await setup((_key,text,signal)=>fastLayoutDecision(text)||new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{const error=new Error();error.name='AbortError';reject(error);}))); 
  try{
    f.voice.text='Move my webcam';const pending=f.voice.drain(f.voice.epoch);
    f.voice.text='Move my webcam to the top right';f.voice.transcript(f.voice.epoch);await pending;
    await f.voice.drain(f.voice.epoch);assert.equal(f.voice.state.status,'listening');assert.equal(f.calls.length,1);
  }finally{f.voice.cancel();}
});
test('repeated or equivalent partials do not repeatedly cancel a valid Decisions request',async()=>{
  let resolve,aborted=false;
  const f=await setup((_key,_text,signal)=>new Promise(r=>{resolve=r;signal.addEventListener('abort',()=>{aborted=true;});}));
  try{
    f.voice.text='Move my webcam to the top right';const pending=f.voice.drain(f.voice.epoch);
    f.voice.transcript(f.voice.epoch);f.voice.text+=' please';f.voice.transcript(f.voice.epoch);
    assert.equal(aborted,false);resolve(result('top-right'));await pending;assert.equal(f.calls.length,1);
  }finally{f.voice.cancel();}
});
async function processText(f,text){f.voice.text=text;await f.voice.drain(f.voice.epoch);}
test('Decisions request is bounded to layout choices and parsing rejects invalid choices',()=>{
  const request=decisionRequest('top right');assert.equal(request.model,'gpt-6-luna');assert.equal(request.questions.length,3);
  assert.deepEqual(parseDecision({answers:[{name:'position',type:'refusal'}]}),result());
  assert.throws(()=>parseDecision({answers:[{name:'position',type:'choice',choice:'delete files',confidence:.99}]}));
});
test('incremental transcription executes before final completion and does not duplicate resizing',async()=>{
  const f=await setup(async (_key,text)=>text.includes('smaller')?result('top-right','smaller'):result('top-right'));
  try{
    f.socket.delta('Move my webcam to the top right');clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);
    assert.equal(f.calls.length,1);assert.equal(f.voice.final,false);
    await processText(f,'Move my webcam to the top right and make it smaller');
    await processText(f,'Move my webcam to the top right and make it smaller please');
    assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].plan,{position:'top-right',size:'smaller'});
    assert.ok(!JSON.stringify(f.events).includes('sk-test'));
  }finally{f.voice.cancel();}
});
test('correction replaces size relative to the same original checkpoint',async()=>{
  const f=await setup(async (_key,text)=>text.includes('larger')?result('bottom-left','larger'):result('top-right','smaller'));
  try{await processText(f,'top right smaller');await processText(f,'top right smaller actually bottom left larger');assert.equal(f.calls[0].cp,f.calls[1].cp);assert.deepEqual(f.calls[1].plan,{position:'bottom-left',size:'larger'});}finally{f.voice.cancel();}
});
test('a late decision cannot execute after cancellation',async()=>{
  let resolve;const f=await setup(()=>new Promise(r=>resolve=r));f.voice.text='top right';const pending=f.voice.drain(f.voice.epoch);f.voice.cancel();resolve(result('top-right'));await pending;assert.equal(f.calls.length,0);
});
test('correction invalidates an earlier in-flight decision',async()=>{
  let resolve;const f=await setup(()=>new Promise(r=>resolve=r));f.voice.text='top right';const pending=f.voice.drain(f.voice.epoch);f.voice.text='top right actually bottom left';resolve(result('top-right'));await pending;assert.equal(f.calls.length,0);f.voice.cancel();
});
test('undo during an interaction restores its initial checkpoint',async()=>{
  const f=await setup(async (_key,text)=>text.includes('undo')?result('keep','keep','undo'):result('top-right'));
  try{await processText(f,'top right');await processText(f,'top right undo that');assert.equal(f.calls[1].cp,f.checkpoint);assert.deepEqual(f.calls[1].plan,{position:'keep',size:'keep'});}finally{f.voice.cancel();}
});
test('microphone PCM is uploaded only while listening and finishes with a commit',async()=>{
  const f=await setup(async()=>result());f.voice.audio(new Uint8Array(4800));assert.ok(f.socket.sent.some(x=>x.type==='input_audio_buffer.append'));
  f.voice.text='';await f.voice.finish();assert.ok(f.socket.sent.some(x=>x.type==='input_audio_buffer.commit'));assert.equal(f.voice.state.status,'idle');const count=f.socket.sent.length;f.voice.audio(new Uint8Array(4800));assert.equal(f.socket.sent.length,count);
});
test('audio backlog fails closed rather than replaying delayed commands',async()=>{
  const f=await setup(async()=>result());f.socket.bufferedAmount=200000;f.voice.audio(new Uint8Array(4800));assert.equal(f.voice.state.status,'error');assert.equal(f.socket.readyState,3);
});
test('audio worklet emits bounded 24 kHz PCM chunks',()=>{
  let Processor;const chunks=[];
  const context={AudioWorkletProcessor:class{constructor(){this.port={postMessage:value=>chunks.push(value)};}},sampleRate:48000,Int16Array,Math,registerProcessor:(_name,cls)=>Processor=cls};
  vm.runInNewContext(fs.readFileSync('public/pcm-worklet.js','utf8'),context);const processor=new Processor();
  processor.port.onmessage({data:{type:'hold',value:true}});
  for(let i=0;i<40;i++)processor.process([[new Float32Array(128).fill(.5)]]);
  const audio=chunks.filter(x=>x.byteLength);assert.equal(audio.length,1);assert.equal(audio[0].byteLength,4800);assert.equal(new Int16Array(audio[0])[0],16383);
});

test('speech captured during connection is preserved in order, including the first chunk',async()=>{
  class SlowSocket extends Socket{send(raw){this.sent.push(JSON.parse(raw));}}
  const voice=new VoiceService({voiceCheckpoint:async()=>({})},()=>{},{Socket:SlowSocket,decision:async()=>result()});
  voice.configure('sk-test-only-credential-123456');const starting=voice.start();
  voice.audio(new Uint8Array([1,0,2,0]));voice.audio(new Uint8Array([3,0,4,0]));
  await new Promise(r=>setImmediate(r));Socket.latest.message({type:'session.updated'});await starting;
  try{assert.deepEqual(Socket.latest.sent.filter(x=>x.type==='input_audio_buffer.append').map(x=>Buffer.from(x.audio,'base64').toString('hex')),['01000200','03000400']);}finally{voice.cancel();}
});

test('repeated holds each create a fresh turn and can execute successfully',async()=>{
  const f=await setup(async()=>result('top-right'));
  try{for(let i=0;i<6;i++){if(i)await f.voice.start();Socket.latest.delta('Move webcam top right');f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.equal(f.voice.state.status,'idle');}assert.equal(f.calls.length,6);}finally{f.voice.cancel();}
});

test('Sarvam uses realtime partial replacements, manual turns and 16 kHz audio',async()=>{
  const {transcriptionConfig,transcriptEvent}=require('../desktop/transcription.cjs');
  const config=transcriptionConfig('sarvam','fixture-sarvam-key','en-IN');const url=new URL(config.url);
  assert.equal(url.pathname,'/speech-to-text-realtime/ws');assert.equal(url.searchParams.get('endpointing'),'manual');assert.equal(config.sampleRate,16000);
  assert.deepEqual(config.audio('aabb'),{event:'audio_input',audio:'aabb'});
  assert.deepEqual(transcriptEvent('sarvam',{event:'transcript.partial',text:'top right'}),{text:'top right',replace:true,final:false});
  assert.equal(transcriptEvent('sarvam',{event:'transcript.final',text:'bottom left'}).final,true);
  const events=[];const voice=new VoiceService({voiceCheckpoint:async()=>({}),applyVoicePlan:async()=>{}},x=>events.push(x),{Socket,decision:async()=>result('top-right')});
  voice.configure({openaiKey:'sk-test-only-credential-123456',sarvamKey:'fixture-sarvam-key',provider:'sarvam',language:'en-IN'});
  const starting=voice.start();await new Promise(r=>setImmediate(r));const socket=Socket.latest;
  socket.message({event:'session.begin'});await starting;
  try{
    voice.audio(new Uint8Array(3200));assert.ok(socket.sent.some(x=>x.event==='audio_input'));
    socket.message({event:'transcript.partial',text:'move webcam top'});socket.message({event:'transcript.partial',text:'move webcam top right'});
    assert.equal(voice.state.transcript,'move webcam top right');
    const finishing=voice.finish();assert.ok(socket.sent.some(x=>x.event==='speech_end'));
    socket.message({event:'transcript.final',text:'move webcam top right'});await finishing;
    assert.equal(voice.state.status,'idle');assert.ok(events.some(x=>x.action==='top-right'));
    assert.ok(!JSON.stringify(events).includes('fixture-sarvam-key'));
  }finally{voice.cancel();}
});

test('worklet keeps unheld audio local, flushes the tail on release and supports Sarvam rate',()=>{
  let Processor;const messages=[];
  const context={AudioWorkletProcessor:class{constructor(){this.port={postMessage:value=>messages.push(value)};}},sampleRate:48000,Int16Array,Math,registerProcessor:(_name,cls)=>Processor=cls};
  vm.runInNewContext(fs.readFileSync('public/pcm-worklet.js','utf8'),context);const processor=new Processor({processorOptions:{targetRate:16000}});
  const frame=()=>processor.process([[new Float32Array(128).fill(.5)]]);
  for(let i=0;i<40;i++)frame();assert.equal(messages.filter(x=>x.byteLength).length,0);
  processor.port.onmessage({data:{type:'hold',value:true}});for(let i=0;i<20;i++)frame();
  processor.port.onmessage({data:{type:'hold',value:false}});
  const audio=messages.filter(x=>x.byteLength);assert.equal(audio.length,1);assert.equal(audio[0].byteLength,1706);assert.equal(messages.at(-1).type,'flushed');
  for(let i=0;i<40;i++)frame();assert.equal(messages.filter(x=>x.byteLength).length,1);
});

test('hold shortcut ignores repeat presses and releases when any chord key is lifted',()=>{
  const {HoldShortcut}=require('../desktop/hold-shortcut.cjs');const events=[];const hold=new HoldShortcut(x=>events.push(x.kind));
  hold.keys={Z:44,Ctrl:29,CtrlRight:3613,Shift:42,ShiftRight:54};
  hold.down({keycode:44,ctrlKey:true,shiftKey:true});hold.down({keycode:44,ctrlKey:true,shiftKey:true});hold.up({keycode:42});
  assert.deepEqual(events,['voice-press','voice-release']);hold.up({keycode:44});assert.equal(events.length,2);
  hold.down({keycode:44,ctrlKey:true,shiftKey:false});assert.equal(events.length,2);
  hold.down({keycode:44,ctrlKey:true,shiftKey:true});hold.stop();assert.equal(events.at(-1),'voice-release');
});

test('hands-free mode executes consecutive app commands without ending capture or replaying old text',async()=>{
 const executed=[];const f=await setup(async(_key,text)=>({...result(),appAction:text.includes('stop')?'watch_stop':'watch_start'}));
 f.voice.state.latched=true;f.voice.executeAppAction=async(action,text)=>{assert.equal(f.voice.active(),true);executed.push({action,text});};
 try{f.socket.delta('start watching.');clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);assert.equal(f.voice.state.status,'listening');f.socket.delta(' stop watching.');clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);assert.deepEqual(executed.map(x=>x.action),['watch_start','watch_stop']);assert.equal(executed[1].text.trim(),'stop watching.');f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.equal(executed.length,2);}finally{f.voice.cancel();}
});
test('hands-free repeated size commands get fresh checkpoints and remain listening',async()=>{
 const f=await setup(async()=>result('keep','smaller'));f.voice.state.latched=true;
 try{for(const text of ['smaller.',' smaller.']){f.socket.delta(text);clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);}assert.equal(f.calls.length,2);assert.equal(f.voice.state.status,'listening');}finally{f.voice.cancel();}
});

test('conversational hands-free speech emits separate chat interactions without webcam writes',async()=>{
 const f=await setup(async()=>result());const interactions=[];f.voice.onInteraction=value=>interactions.push(value);f.voice.state.latched=true;f.voice.state.conversational=true;
 try{for(const words of ['What’s up?',' How are you?']){f.socket.delta(words);clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);}assert.equal(interactions.length,2);assert.equal(interactions[0].action,null);assert.equal(interactions[1].text.trim(),'How are you?');assert.equal(f.calls.length,0);assert.equal(f.voice.state.status,'listening');f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.equal(interactions.filter(x=>x.text.trim()).length,2);}finally{f.voice.cancel();}
});
test('spoken Asphalt command executes the same app action once on push-to-talk release',async()=>{const {decideWithAPI}=require('../desktop/voice-decisions.cjs');const f=await setup((key,text,signal)=>decideWithAPI(key,text,signal,()=>{throw Error('Unexpected Decisions call');}));const actions=[],interactions=[];f.voice.executeAppAction=async action=>{actions.push(action);return 'Asphalt setup verified.';};f.voice.onInteraction=x=>interactions.push(x);try{f.socket.delta('Sense, set up everything for an Asphalt Legends stream.');f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.deepEqual(actions,['setup_asphalt']);assert.equal(interactions.at(-1).action,'Asphalt setup verified.');}finally{f.voice.cancel();}});
test('failed app execution clears the recognized-command success line',async()=>{const f=await setup(async()=>({...result(),appAction:'setup_asphalt'}));f.voice.executeAppAction=async()=>{throw Error('Setup incomplete');};try{f.socket.delta('Set up everything for Asphalt Legends stream');f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.equal(f.voice.state.status,'error');assert.equal(f.voice.state.action,'');assert.match(f.voice.state.error,/incomplete/);}finally{f.voice.cancel();}});

test('explicit microphone repairs route to the OBS supervisor without conversation classification',async()=>{
 const {decideWithAPI,explicitMicrophoneRepair}=require('../desktop/voice-decisions.cjs');
 for(const text of ['Unmute my microphone.','Sense, unmute my mic','Could you unmute the OBS microphone?','Please unmute my microphone please']){
  const decision=await decideWithAPI('fixture',text,null,async()=>{throw Error('Must not fall through to model classification');});
  assert.equal(decision.appAction,'supervisor_unmute');
 }
 for(const text of ['Do not unmute my microphone','Sense, don’t unmute my mic','How do I unmute my microphone?','"unmute my microphone"','Unmute my microphone, actually do not','unmute','I said unmute my microphone'])assert.equal(explicitMicrophoneRepair(text),false,text);
});

test('spoken microphone repair dispatches after release and reports the verified result',async()=>{
 const {decideWithAPI}=require('../desktop/voice-decisions.cjs');
 const f=await setup((key,text,signal)=>decideWithAPI(key,text,signal,async()=>{throw Error('Unexpected classifier request');}));const executed=[];
 f.voice.executeAppAction=async action=>{executed.push(action);return 'Verified in OBS: microphone unmuted.';};
 try{f.socket.delta('Unmute my microphone.');clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);assert.equal(executed.length,0);f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.deepEqual(executed,['supervisor_unmute']);assert.equal(f.voice.state.action,'Verified in OBS: microphone unmuted.');}finally{f.voice.cancel();}
});

test('explicit source visibility commands route to supervisor and exclude quoted or negated speech',async()=>{
 const {decideWithAPI,explicitSourceRepair}=require('../desktop/voice-decisions.cjs');
 for(const [text,action] of [['Sense, show my hidden webcam.','supervisor_show_webcam'],['Show my webcam','supervisor_show_webcam'],['Could you unhide the camera?','supervisor_show_webcam'],['Please show my game capture','supervisor_show_game']]){
  const decision=await decideWithAPI('fixture',text,null,async()=>{throw Error('Unexpected classification');});assert.equal(decision.appAction,action);
 }
 for(const text of ['Do not show my webcam','How do I show my hidden webcam?','"show my webcam"','Show my webcam, actually do not','show','I said show my webcam'])assert.equal(explicitSourceRepair(text),null,text);
});

test('spoken webcam repair dispatches once on release with verified feedback',async()=>{
 const {decideWithAPI}=require('../desktop/voice-decisions.cjs');const actions=[],interactions=[];
 const f=await setup((key,text,signal)=>decideWithAPI(key,text,signal,async()=>{throw Error('Unexpected classification');}));
 f.voice.executeAppAction=async action=>{actions.push(action);return 'Verified in OBS: webcam shown.';};f.voice.onInteraction=x=>interactions.push(x);
 try{f.socket.delta('Sense, show my hidden webcam.');clearTimeout(f.voice.debounce);f.voice.debounce=null;await f.voice.drain(f.voice.epoch);assert.equal(actions.length,0);f.voice.audio(new Uint8Array(4800));await f.voice.finish();assert.deepEqual(actions,['supervisor_show_webcam']);assert.equal(interactions.at(-1).action,'Verified in OBS: webcam shown.');}finally{f.voice.cancel();}
});

test('combined repair commands require explicit supported clauses',async()=>{
 const {explicitRepairPlan,decideWithAPI}=require('../desktop/voice-decisions.cjs');
 assert.deepEqual(explicitRepairPlan('Sense, unmute my microphone and show my webcam.'),['mic-muted','webcam-hidden']);
 assert.deepEqual(explicitRepairPlan('Show my game source and then unhide my camera'),['game-hidden','webcam-hidden']);
 assert.equal(explicitRepairPlan('Fix all reported issues'),'all');
 for(const text of ['fix it','Unmute my microphone and do not show my webcam','How do I unmute my microphone and show my webcam?','"unmute my mic and show my webcam"','unmute my mic and start streaming'])assert.equal(explicitRepairPlan(text),null,text);
 assert.equal((await decideWithAPI('fixture','Unmute my microphone and show my webcam',null,async()=>{throw Error('Unexpected classifier');})).appAction,'supervisor_repair_many');
});

test('repair plans have no two-command or fixed clause-count limit',()=>{const {explicitRepairPlan}=require('../desktop/voice-decisions.cjs');assert.deepEqual(explicitRepairPlan('unmute my mic and show my webcam and show my game source'),['mic-muted','webcam-hidden','game-hidden']);assert.deepEqual(explicitRepairPlan(Array(9).fill('show my webcam').join(' and ')),['webcam-hidden']);});

test('fix-all accepts common spoken variations while rejecting negation and advice questions',()=>{const {explicitRepairPlan}=require('../desktop/voice-decisions.cjs');for(const text of ['Sense, fix all of the reported issues.','Please fix all these issues','Could you resolve every detected problem for me?','Fix all my current OBS issues'])assert.equal(explicitRepairPlan(text),'all',text);for(const text of ['Do not fix all issues','How can I fix all issues?','Fix all issues except the microphone'])assert.equal(explicitRepairPlan(text),null,text);});

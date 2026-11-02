const {test}=require('node:test');const assert=require('node:assert/strict');
const {LayoutAssist}=require('../desktop/layout-assist.cjs');
const {parseVision,visionRequest,inspectLayout}=require('../desktop/layout-vision.cjs');
const good={position:'bottom-left',obstruction:'hud',confidence:.99,blockedProbability:.99,actionable:true};
function setup(inspect=async()=>good){
  const calls=[],events=[];let now=1000,active=false;
  const obs={state:{selection:{}},layoutSample:async()=>({image:'data:image/png;base64,aabb',rects:{current:{},candidates:{}},checkpoint:{capturedAt:now,generation:1,selection:{scene:'game'},transform:{positionX:0},gameTransform:{width:1920}}}),applyVoicePlan:async(cp,plan)=>{assert.ok(cp.canApply());calls.push(plan);}};
  const service=new LayoutAssist(obs,e=>events.push(e),{getKey:()=> 'fixture-key',inspect,now:()=>now,isVoiceActive:()=>active});
  return {service,calls,events,setNow:value=>now=value,setActive:value=>active=value};
}
test('one image check only recommends, and auto requires two stable matching checks',async()=>{
  const f=setup();try{f.service.state.mode='auto';f.service.state.watching=true;await f.service.scan();assert.equal(f.calls.length,0);assert.equal(f.service.state.status,'suggestion');await f.service.scan();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{position:'bottom-left',size:'keep'});await f.service.scan();assert.equal(f.calls.length,1);}finally{f.service.stop();}
});
test('suggestion mode never moves automatically; an explicit apply is verified',async()=>{
  const f=setup();try{await f.service.checkNow();await f.service.checkNow();assert.equal(f.calls.length,0);await f.service.apply();assert.equal(f.calls.length,1);assert.equal(f.service.state.status,'applied');assert.equal(f.service.state.canUndo,true);await f.service.undo();assert.equal(f.service.state.status,'undone');assert.equal(f.calls.length,2);assert.equal(f.service.state.canUndo,false);}finally{f.service.stop();}
});
test('manual override discards late vision results and hands control back after reads finish',async()=>{
  let resolve;const f=setup(()=>new Promise(r=>resolve=r));
  try{f.service.state.watching=true;const scan=f.service.scan();await new Promise(r=>setImmediate(r));const yielding=f.service.yieldToManual();resolve(good);await Promise.all([scan,yielding]);assert.equal(f.calls.length,0);assert.equal(f.service.recommendation,null);assert.equal(f.service.state.status,'paused');}finally{f.service.stop();}
});
test('expired recommendations and active voice cannot apply',async()=>{
  const f=setup();try{await f.service.scan();f.setNow(12001);await assert.rejects(f.service.apply(),/expired/);f.setNow(1000);await f.service.scan();f.setActive(true);await assert.rejects(f.service.apply(),/priority/);assert.equal(f.calls.length,0);}finally{f.service.stop();}
});
test('uncertain vision abstains and invalid actions are rejected',()=>{
  const names=['current','top-left','top-right','bottom-left','bottom-right'];
  const sample={crops:Object.fromEntries(names.map(x=>[x,'fixture'])),rects:{current:{x:1,y:0},candidates:{'top-left':{x:0,y:0},'top-right':{x:1,y:0},'bottom-left':{x:0,y:1},'bottom-right':{x:1,y:1}}}};
  const body={answers:[...names.map(name=>({name,type:'predicate',probability:name==='bottom-right'?.01:.99})),{name:'obstruction',type:'choice',choice:'hud',confidence:.99}]};
  assert.equal(parseVision(body,sample).position,'bottom-right');body.answers[4].probability=.8;assert.equal(parseVision(body,sample).reason,'no-safe-corner');assert.equal(parseVision(body,sample).actionable,false);body.answers[4].probability=.01;body.answers[0].probability=.6;assert.equal(parseVision(body,sample).reason,'uncertain-obstruction');assert.equal(parseVision(body,sample).actionable,false);body.answers.at(-1).choice='delete';assert.throws(()=>parseVision(body,sample));
  assert.throws(()=>parseVision({answers:[{name:'current',type:'refusal'}]},sample),/incomplete/);
});
test('vision request sends only game evidence with fixed choices and validates image transport',async()=>{
  const request=visionRequest({image:'data:image/png;base64,fixture',crops:{current:'data:image/png;base64,fixture'},rects:{current:{x:0,y:0,width:.2,height:.2},candidates:{}}});
  assert.equal(request.model,'gpt-6-luna');assert.equal(request.input[0].content[1].type,'input_image');assert.equal(request.questions.length,2);assert.equal(request.questions.at(-1).choices.length,5);
  await assert.rejects(inspectLayout('fixture',{image:'https://example.com/untrusted'},null),/supported/);
});
test('crop geometry clips partial regions and detects blank space outside the game',()=>{
  const {imageRegion}=require('../desktop/layout-images.cjs');
  assert.deepEqual(imageRegion({x:-.1,y:0,width:.3,height:.2},1000,500),{x:0,y:0,width:200,height:100});
  assert.equal(imageRegion({x:1.1,y:0,width:.2,height:.2},1000,500),null);
  assert.throws(()=>imageRegion({x:NaN,y:0,width:.2,height:.2},1000,500));
});
test('voice handoff retains a fresh suggestion for an explicit apply after speech',async()=>{
  const f=setup();try{await f.service.checkNow();const rec=f.service.recommendation;await f.service.yieldToVoice();assert.equal(f.service.recommendation,rec);await f.service.apply(true);assert.equal(f.calls.length,1);}finally{f.service.stop();}
});

test('a smaller edge placement is evaluated and requires approval even in automatic mode',async()=>{
 const id='middle-right-75',names=['current',id];const sample={crops:Object.fromEntries(names.map(n=>[n,'fixture'])),placements:{[id]:{scale:.75}},rects:{current:{x:0,y:0},candidates:{[id]:{x:.7,y:.4}}}};
 const parsed=parseVision({answers:[{name:'current',type:'predicate',probability:.99},{name:id,type:'predicate',probability:.01},{name:'obstruction',type:'choice',choice:'menu',confidence:.99}]},sample);
 assert.equal(parsed.position,id);assert.equal(parsed.requiresApproval,true);assert.equal(parsed.placement.scale,.75);
 const f=setup(async()=>parsed);try{f.service.state.mode='auto';f.service.state.watching=true;await f.service.scan();await f.service.scan();assert.equal(f.calls.length,0);assert.equal(f.service.state.status,'suggestion');}finally{f.service.stop();}
});

test('88 percent obstruction offers review without weakening automatic movement',async()=>{
 const names=['current','top-left','top-right','bottom-left','bottom-right'];const sample={crops:Object.fromEntries(names.map(n=>[n,'fixture'])),rects:{current:{x:0,y:0},candidates:Object.fromEntries(names.slice(1).map((n,i)=>[n,{x:i%2,y:Math.floor(i/2)}]))}};
 const answers=[...names.map(name=>({name,type:'predicate',probability:name==='current'?.88:name==='top-right'?.06:.95})),{name:'obstruction',type:'choice',choice:'menu',confidence:.98}];
 const result=parseVision({answers},sample);assert.equal(result.actionable,true);assert.equal(result.position,'top-right');assert.equal(result.requiresApproval,true);
 const f=setup(async()=>result);try{f.service.state.mode='auto';f.service.state.watching=true;await f.service.scan();await f.service.scan();assert.equal(f.calls.length,0);await f.service.apply(true);assert.equal(f.calls.length,1);}finally{f.service.stop();}
 answers[0].probability=.7;assert.equal(parseVision({answers},sample).actionable,true);assert.equal(parseVision({answers},sample).requiresApproval,true);answers[0].probability=.699;assert.equal(parseVision({answers},sample).actionable,false);
});

test('corner selection chooses lowest obstruction score before proximity',()=>{
 const names=['top-left','top-right','bottom-left','bottom-right'];const sample={crops:Object.fromEntries(['current',...names].map(n=>[n,'fixture'])),rects:{current:{x:0,y:0},candidates:Object.fromEntries(names.map((n,i)=>[n,{x:i%2,y:Math.floor(i/2)}]))}};
 const answers=[{name:'current',type:'predicate',probability:.99},...names.map((name,i)=>({name,type:'predicate',probability:[.09,.08,.07,.01][i]})),{name:'obstruction',type:'choice',choice:'menu',confidence:.99}];
 assert.equal(parseVision({answers},sample).position,'bottom-right');for(const answer of answers)if(names.includes(answer.name))answer.probability=.4;assert.equal(parseVision({answers},sample).actionable,false);
});

test('screen search checks corners first and only requests interior evidence when corners fail',async()=>{
 const names=['top-left','top-right','bottom-left','bottom-right','screen-2-2'];const image='data:image/png;base64,fixture';const sample={image,crops:Object.fromEntries(['current',...names].map(n=>[n,image])),placements:{'screen-2-2':{scale:1}},rects:{current:{x:0,y:0},candidates:Object.fromEntries(names.map((n,i)=>[n,{x:i/5,y:i/5}]))}};
 const requests=[];let clearCorner=false;
 const fetcher=async(_url,options)=>{const questions=JSON.parse(options.body).questions;requests.push(questions.map(q=>q.name));return {ok:true,json:async()=>({answers:questions.map(q=>q.type==='choice'?{name:q.name,type:'choice',choice:'menu',confidence:.99}:{name:q.name,type:'predicate',probability:q.name==='screen-2-2'||(clearCorner&&q.name==='top-right')?.01:.99})})};};
 const fallback=await inspectLayout('fixture',sample,null,fetcher);assert.equal(fallback.position,'screen-2-2');assert.equal(fallback.requiresApproval,true);assert.equal(requests.length,2);assert.equal(requests[0].includes('screen-2-2'),false);
 requests.length=0;clearCorner=true;assert.equal((await inspectLayout('fixture',sample,null,fetcher)).position,'top-right');assert.equal(requests.length,1);
});

test('watching preferences survive a new service without starting watching',()=>{
 const fs=require('fs'),os=require('os'),path=require('path');const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'sense-prefs-')),'watching.json');
 const a=new LayoutAssist({},()=>{},{preferencePath:file});a.setPreferences({auto:true,allowShrinking:true});
 const b=new LayoutAssist({},()=>{},{preferencePath:file});assert.equal(b.state.allowShrinking,true);assert.equal(b.state.mode,'auto');assert.equal(b.state.watching,false);assert.throws(()=>b.setPreferences({auto:'yes',allowShrinking:false}));
});
test('shrinking off removes resized evidence before analysis and changing it invalidates old proposals',async()=>{
 let seen;const f=setup(async(_key,sample)=>{seen=sample;return good;});
 const sample=()=>({image:'fixture',placements:{'top-left':{scale:1},'top-left-60':{scale:.6}},rects:{current:{},candidates:{'top-left':{},'top-left-60':{}}},crops:{current:'a','top-left':'b','top-left-60':'c'},checkpoint:{capturedAt:1000}});
 f.service.obs.layoutSample=async()=>sample();try{await f.service.scan();assert.deepEqual(Object.keys(seen.rects.candidates),['top-left']);f.service.setPreferences({auto:false,allowShrinking:true});assert.equal(f.service.recommendation,null);await f.service.scan();assert.ok(seen.rects.candidates['top-left-60']);}finally{f.service.stop();}
});
test('explicit shrinking opt-in allows a confident smaller corner but not interior or uncertain moves',()=>{
 const sample={allowShrinking:true,placements:{'bottom-left-60':{scale:.6}},rects:{current:{x:0,y:0},candidates:{'bottom-left-60':{x:0,y:1}}},crops:{current:'a','bottom-left-60':'b'}};
 const body={answers:[{name:'current',type:'predicate',probability:.99},{name:'bottom-left-60',type:'predicate',probability:.01},{name:'obstruction',type:'choice',choice:'hud',confidence:.99}]};
 assert.equal(parseVision(body,sample).requiresApproval,false);sample.allowShrinking=false;assert.equal(parseVision(body,sample).requiresApproval,true);sample.allowShrinking=true;body.answers[0].probability=.88;assert.equal(parseVision(body,sample).requiresApproval,true);
});

test('Stop watching retains the verified move for button and subsequent voice undo',async()=>{
 const f=setup();try{
  await f.service.checkNow();await f.service.apply(true);const record=f.service.undoRecord;
  const stopped=f.service.stopWatching();assert.equal(stopped.watching,false);assert.equal(stopped.canUndo,true);assert.equal(f.events.at(-1).canUndo,true);assert.equal(f.service.undoRecord,record);assert.equal(f.service.timer,null);assert.equal(f.service.recommendation,null);
  await f.service.yieldToVoice();assert.equal(f.service.undoRecord,record);await f.service.undo();assert.equal(f.calls.length,2);assert.equal(f.service.state.canUndo,false);assert.equal(f.service.state.watching,false);
 }finally{f.service.stop();}
});
test('Stop watching cancels pending analysis without losing the previous undo',async()=>{
 let resolve;const f=setup();try{
  await f.service.checkNow();await f.service.apply(true);const record=f.service.undoRecord;
  f.service.inspect=()=>new Promise(r=>resolve=r);const pending=f.service.checkNow();await new Promise(r=>setImmediate(r));f.service.stopWatching();resolve(good);await pending;
  assert.equal(f.service.undoRecord,record);assert.equal(f.service.state.canUndo,true);assert.equal(f.service.recommendation,null);assert.equal(f.service.state.watching,false);
  f.service.stop('Sources changed.');assert.equal(f.service.undoRecord,null);assert.equal(f.service.state.canUndo,false);
 }finally{f.service.stop();}
});

test('scheduled watching preserves an approval-required suggestion until it expires',async()=>{let inspections=0;const f=setup(async()=>{inspections++;return {...good,requiresApproval:true};});try{f.service.state.mode='auto';f.service.state.watching=true;await f.service.scan();const rec=f.service.recommendation;await f.service.watchTick();assert.equal(inspections,1);assert.equal(f.service.recommendation,rec);assert.equal(f.service.state.status,'suggestion');f.setNow(rec.expires+1);await f.service.watchTick();assert.equal(inspections,2);}finally{f.service.stop();}});
test('scheduled auto corner checks still build the agreement required for movement',async()=>{const f=setup();try{f.service.state.mode='auto';f.service.state.watching=true;await f.service.watchTick();await f.service.watchTick();assert.equal(f.calls.length,1);}finally{f.service.stop();}});

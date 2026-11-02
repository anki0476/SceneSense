const { z } = require('zod');
const {appActions,appActionQuestion}=require('./app-actions.cjs');
const positions = ['keep','top-left','top-right','bottom-left','bottom-right'];
const sizes = ['keep','smaller','larger'];
const controls = ['none','undo','restore'];
function isAsphaltSetupCommand(input){
 if(typeof input!=='string'||/["“”]/.test(input))return false;
 const text=input.toLowerCase().replace(/^[\s]*(?:hey\s+)?sense[\s,:.!-]*/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
 if(/\b(don't|do not|never|cancel|stop|not|instead|how|why|what|suggest|recommend|said|say)\b/.test(text))return false;
 return /^(?:please )?(?:(?:can|could|would) you )?(?:set ?up|prepare|ready|configure)\b/.test(text)&&/\basphalt(?: legends)?\b/.test(text)&&/\b(stream|streaming|setup|everything)\b/.test(text);
}
function fastLayoutDecision(input){
  if(typeof input!=='string'||/[?"“”]/.test(input))return null;
  const text=input.trim().toLowerCase().replace(/^(?:hey\s+)?sense[\s,:.!-]*/,'').replace(/[.!]+$/,'').replace(/\s+/g,' ').replace(/^please /,'').replace(/ please$/,'');
  const empty={position:'keep',size:'keep',control:'none'};
  if(/^(undo( that)?|go back)$/.test(text))return {...empty,control:'undo'};
  if(/^restore( (my |the )?(webcam( layout)?|camera( layout)?|saved layout))?$/.test(text))return {...empty,control:'restore'};
  const corner=text.match(/^(?:(?:move|place|put) (?:(?:my|the) )?(?:webcam|camera) (?:to |in )?(?:the )?)?(top|bottom) (left|right)$/);
  if(corner)return {...empty,position:corner[1]+'-'+corner[2]};
  const size=text.match(/^(?:make (?:(?:my|the) )?(?:webcam|camera|it) )?(smaller|larger)$/);
  if(size)return {...empty,size:size[1]};
  return null;
}
function explicitMicrophoneRepair(input){
  if(typeof input!=='string')return false;
  const text=input.trim().toLowerCase().replace(/^(?:hey\s+)?sense[\s,:.!-]*/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
  return /^(?:please )?(?:(?:can|could|would) you )?unmute (?:(?:my|the|our) )?(?:(?:obs|stream) )?(?:microphone|mic)(?: please)?$/.test(text);
}
function explicitSourceRepair(input){
  if(typeof input!=='string')return null;
  const text=input.trim().toLowerCase().replace(/^(?:hey\s+)?sense[\s,:.!-]*/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
  const match=text.match(/^(?:please )?(?:(?:can|could|would) you )?(?:show|unhide) (?:(?:my|the|our) )?(?:hidden )?(webcam|camera|game(?: capture| source)?)(?: please)?$/);
  return match?(match[1].startsWith('game')?'supervisor_show_game':'supervisor_show_webcam'):null;
}
function explicitRepairPlan(input){
 if(typeof input!=='string'||/["“”]/.test(input))return null;
 const text=input.trim().toLowerCase().replace(/^(?:hey\s+)?sense[\s,:.!-]*/,'').replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
 if(/^(?:please )?(?:(?:can|could|would) you )?(?:fix|repair|resolve) (?:all(?: of)?|every)(?: (?:the|my|these|those|reported|detected|current|stream|obs|remaining))* (?:issues?|problems?|faults?)(?: please| for me)?$/.test(text))return 'all';
 const parts=text.split(/\s*(?:,?\s+and then\s+|,?\s+and\s+|,?\s+then\s+|,\s*)/);
 if(parts.length<2)return null;
 const ids=parts.map(part=>explicitMicrophoneRepair(part)?'mic-muted':({supervisor_show_webcam:'webcam-hidden',supervisor_show_game:'game-hidden'}[explicitSourceRepair(part)]));
 return ids.every(Boolean)?[...new Set(ids)]:null;
}
function decisionRequest(transcript,options={}) {
  const input='Context: The user is controlling SceneSense through its assistant Sense using push-to-talk. Every spoken request is addressed to the app; saying Sense is optional. Available webcam history commands are Undo (revert the last webcam change) and Restore (return to the saved webcam layout).\nSpoken command: '+transcript;
  const request={model:'gpt-6-luna',input,questions:[
    {type:'choice',name:'position',instructions:'Which webcam corner is the speaker requesting? Upper means top; lower means bottom. Short commands such as top right count. Choose keep when no complete corner is requested, for undo/restore, negation, quoted speech, or a question about how the feature works. Polite requests such as can you move my camera count. Use the latest complete correction.',choices:positions.map(value=>({value,description:value==='keep'?'No corner change requested.':'Move the webcam to '+value+'.'}))},
    {type:'choice',name:'size',instructions:'What webcam size change does the speaker request? Smaller, shrink it, reduce it, and make my webcam smaller mean smaller. Larger, bigger, grow it, and make my webcam larger mean larger. Otherwise choose keep. Negated or quoted commands and undo/restore mean keep. Use the latest complete correction.',choices:sizes.map(value=>({value,description:value==='keep'?'No size change requested.':value==='smaller'?'Reduce webcam size.':'Increase webcam size.'}))},
    {type:'choice',name:'control',instructions:'What webcam history action does the speaker request? Undo, undo that, go back, and revert that change mean undo. Restore, restore my webcam, and restore saved layout mean restore. A size or corner change alone means none. Negated or quoted commands and questions about how a feature works mean none.',choices:controls.map(value=>({value,description:value==='none'?'No history action requested.':value==='undo'?'Undo the previous webcam change.':'Restore the saved webcam layout.'}))}
  ]};
  for(const question of request.questions)question.instructions+=' Removing or restoring the webcam background is a filter action, not a layout or history action: choose '+(question.name==='control'?'none':'keep')+' for background-only requests.';
  if(!fastLayoutDecision(transcript))request.questions.push(appActionQuestion(options));
  return request;
}
function parseDecision(body,transcript='') {
  const answers = new Map((body.answers || []).map(x=>[x.name,x]));
  function value(name, options, fallback) {
    const answer=answers.get(name);
    if (!answer || answer.type !== 'choice' || !Number.isFinite(answer.confidence) || answer.confidence < .8) return fallback;
    return z.enum(options).parse(answer.choice);
  }
  const result={position:value('position',positions,'keep'),size:value('size',sizes,'keep'),control:value('control',controls,'none')};
  const action=value('app_action',['none',...Object.keys(appActions)],'none');if(action!=='none')result.appAction=action;
  return result;
}
async function decide(key, transcript, signal, fetcher) {
  return decideWithAPI(key,transcript,signal,fetcher);
}
async function decideWithAPI(key,transcript,signal,fetcher=require('./judge-proxy.cjs').proxyFetch,options={}){
  if(explicitRepairPlan(transcript))return {position:'keep',size:'keep',control:'none',appAction:'supervisor_repair_many'};
  const sourceRepair=explicitSourceRepair(transcript);
  if(sourceRepair)return {position:'keep',size:'keep',control:'none',appAction:sourceRepair};
  if(explicitMicrophoneRepair(transcript))return {position:'keep',size:'keep',control:'none',appAction:'supervisor_unmute'};
  if(isAsphaltSetupCommand(transcript))return {position:'keep',size:'keep',control:'none',appAction:'setup_asphalt'};
  if(options.experimental&&require('./game-profile.cjs').gameFromSpeech(transcript))return {position:'keep',size:'keep',control:'none',appAction:'setup_game'};
  const response=await fetcher('https://api.openai.com/v1/decisions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(decisionRequest(transcript,options)),signal});
  if (!response.ok) throw new Error(response.status===401?'OpenAI rejected the API key.':response.status===403?'The API key does not have permission to use OpenAI Decisions.':response.status===429?'OpenAI quota or rate limit reached. Check API credits and limits.':`OpenAI Decisions request failed (HTTP ${response.status}). Check model access and connection.`);
  return parseDecision(await response.json(),transcript);
}
module.exports={explicitRepairPlan,explicitSourceRepair,explicitMicrophoneRepair,isAsphaltSetupCommand,decisionRequest,parseDecision,decide,decideWithAPI,fastLayoutDecision};

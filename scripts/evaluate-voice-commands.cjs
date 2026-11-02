const {loadVoiceEnv}=require('../desktop/env-config.cjs');
const {decideWithAPI:decide}=require('../desktop/voice-decisions.cjs');
const path=require('node:path');
const cases=[
 ['Move my webcam to the top right.','top-right','keep','none'],
 ['Move the camera to the bottom left.','bottom-left','keep','none'],
 ['Make my webcam smaller.','keep','smaller','none'],
 ['Make my webcam larger.','keep','larger','none'],
 ['Undo that.','keep','keep','undo'],
 ['Restore my webcam layout.','keep','keep','restore'],
 ['Do not move my webcam.','keep','keep','none'],
 ['Top right.','top-right','keep','none'],
 ['Smaller.','keep','smaller','none'],
 ['Restore.','keep','keep','restore'],
 ['Move my webcam to the top','keep','keep','none'],
 ['How do I move my webcam to the top right?','keep','keep','none'],
 ['Do not undo that.','keep','keep','none'],
 ['Move my webcam to the top right, actually bottom left.','bottom-left','keep','none'],
 ['Move my webcam to the bottom right and make it smaller.','bottom-right','smaller','none']
];
(async()=>{
 const config=loadVoiceEnv(path.join(__dirname,'..','.env'));if(!config)throw new Error();
 let passed=0;const times=[];
 for(let i=0;i<cases.length;i++){
  const [text,position,size,control]=cases[i];const start=Date.now();
  try{const actual=await decide(config.openaiKey,text,AbortSignal.timeout(10000));const elapsed=Date.now()-start;times.push(elapsed);
   const ok=actual.position===position&&actual.size===size&&actual.control===control;
   console.log((ok?'PASS':'FAIL')+' command '+(i+1)+' ('+elapsed+' ms)');if(ok)passed++;
  }catch{console.log('FAIL command '+(i+1)+': request or parsing error.');}
 }
 console.log(passed+'/'+cases.length+' text commands matched; no audio uploaded and no OBS changes.');
 if(times.length)console.log('Mean request latency: '+Math.round(times.reduce((a,b)=>a+b,0)/times.length)+' ms.');
 if(passed!==cases.length)process.exitCode=1;
})().catch(()=>{console.log('Voice command evaluation could not run; check local credentials and network.');process.exitCode=1;});

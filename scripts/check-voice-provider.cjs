const path=require('node:path');
const {loadVoiceEnv}=require('../desktop/env-config.cjs');
const {VoiceService}=require('../desktop/voice.cjs');
const {decideWithAPI:decide}=require('../desktop/voice-decisions.cjs');
(async()=>{
 let config;
 try{config=loadVoiceEnv(path.join(__dirname,'..','.env'));}catch{console.log('FAIL: .env could not be parsed.');process.exitCode=1;return;}
 if(!config){console.log('FAIL: No OpenAI key configured.');process.exitCode=1;return;}
 const voice=new VoiceService({voiceCheckpoint:async()=>({})},()=>{});
 try{voice.configure(config);}catch{console.log('FAIL: Voice credentials/provider settings failed local validation.');process.exitCode=1;return;}
 console.log('Configured transcription provider: '+config.provider);
 try{const start=Date.now();await voice.start();console.log('PASS: Live transcription handshake ('+(Date.now()-start)+' ms). No microphone audio uploaded.');}
 catch{console.log('FAIL: Live transcription handshake. Check provider key, account access, credits and network.');process.exitCode=1;}
 finally{voice.cancel();}
 try{const start=Date.now();const decision=await decide(config.openaiKey,'Move my webcam to the top right.',AbortSignal.timeout(10000));
  if(decision.position!=='top-right'||decision.size!=='keep'||decision.control!=='none')throw new Error('Unexpected classification');
  console.log('PASS: Live Decisions interpreted a top-right instruction ('+(Date.now()-start)+' ms). No OBS action executed.');
 }catch{console.log('FAIL: Live Decisions access or expected classification. Check API key, quota, model access or decision parsing.');process.exitCode=1;}
})().catch(()=>{console.log('FAIL: Provider verification could not complete.');process.exitCode=1;});

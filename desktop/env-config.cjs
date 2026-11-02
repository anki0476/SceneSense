const fs=require('node:fs');
const {parseEnv}=require('node:util');
function parseVoiceEnv(source){
  const env=parseEnv(source);
  const openaiKey=(env.OPENAI_API_KEY||'').trim(),sarvamKey=(env.SARVAM_API_KEY||'').trim();
  if(!openaiKey)return null;
  const requested=(env.VOICE_PROVIDER||'auto').trim();
  if(!['auto','openai','sarvam'].includes(requested))throw new Error('Invalid voice provider.');
  return {openaiKey,sarvamKey,provider:requested==='auto'?(sarvamKey?'sarvam':'openai'):requested,language:env.VOICE_LANGUAGE||'en-IN'};
}
function loadVoiceEnv(file){try{return parseVoiceEnv(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw new Error('Check the voice settings in your .env file.');}}
module.exports={parseVoiceEnv,loadVoiceEnv};

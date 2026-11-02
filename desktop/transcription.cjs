const hints=['Sense','SceneSense','start watching','stop watching','check current frame','webcam','camera','top right','top left','bottom right','bottom left','smaller','larger','undo','restore'];
function transcriptionConfig(provider,key,language='en-IN'){
  if(provider==='sarvam'){
    const url=new URL('wss://api.sarvam.ai/speech-to-text-realtime/ws');
    for(const [name,value] of Object.entries({model:'saaras:v4',language_code:language,stream_type:'balanced',mode:'transcribe',endpointing:'manual',encoding:'linear16',sample_rate:'16000',keyterms:JSON.stringify(hints)}))url.searchParams.set(name,value);
    return {url:url.href,headers:{'api-subscription-key':key},sampleRate:16000,initial:null,ready:'session.begin',audio:audio=>({event:'audio_input',audio}),begin:{event:'speech_start'},finish:{event:'speech_end'}};
  }
  return {url:'wss://api.openai.com/v1/realtime?intent=transcription',headers:{Authorization:`Bearer ${key}`},sampleRate:24000,ready:'session.updated',begin:null,
    initial:{type:'session.update',session:{type:'transcription',audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:'gpt-live-transcribe',delay:'low',languages:['en'],keywords:hints,prompt:'The speaker is controlling their webcam layout in OBS.'},turn_detection:null}}}},
    audio:audio=>({type:'input_audio_buffer.append',audio}),finish:{type:'input_audio_buffer.commit'}};
}
function transcriptEvent(provider,event){
  if(provider==='sarvam'){
    if(event.event==='transcript.partial' || event.event==='transcript.final')return {text:event.text||'',replace:true,final:event.event==='transcript.final'};
  }else{
    if(event.type==='conversation.item.input_audio_transcription.delta')return {text:event.delta||'',replace:false,itemId:event.item_id};
    if(event.type==='conversation.item.input_audio_transcription.completed')return {text:event.transcript||'',replace:true,final:true,itemId:event.item_id};
  }
  return null;
}
module.exports={transcriptionConfig,transcriptEvent};

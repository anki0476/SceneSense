// Hidden desktop integration only: synthetic audio and transcript events.
const {EventEmitter}=require('node:events');
const {decide}=require('../../desktop/voice-decisions.cjs');
class Socket extends EventEmitter{
  constructor(){super();this.transcript=Socket.utterance||'Move my webcam to the top right';this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.emit('open'));}
  message(data){this.emit('message',Buffer.from(JSON.stringify(data)));}
  send(raw){
    const data=JSON.parse(raw);
    if(data.type==='session.update')this.readyTimer=setTimeout(()=>this.message({type:'session.updated'}),250);
    if(data.type==='input_audio_buffer.append'){
      const split=Math.floor(this.transcript.length*.65);
      if(!this.partial){this.partial=1;queueMicrotask(()=>this.message({type:'conversation.item.input_audio_transcription.delta',item_id:'fixture',delta:this.transcript.slice(0,split)}));}
      else if(this.partial===1){this.partial=2;queueMicrotask(()=>this.message({type:'conversation.item.input_audio_transcription.delta',item_id:'fixture',delta:this.transcript.slice(split)}));}
    }
    if(data.type==='input_audio_buffer.commit')queueMicrotask(()=>this.message({type:'conversation.item.input_audio_transcription.completed',item_id:'fixture',transcript:this.transcript}));
  }
  terminate(){clearTimeout(this.readyTimer);this.readyState=3;}
}
// Exercise the actual Decisions request/response code with a local fake HTTP
// transport. This cannot contact a provider or charge an API account.
async function decision(key,text,signal){
  return decide(key,text,signal,async(url,options)=>{
    if(url!=='https://api.openai.com/v1/decisions')throw new Error('Unexpected Decisions URL.');
    const body=JSON.parse(options.body);
    if(body.model!=='gpt-6-luna'||!body.input.endsWith('Spoken command: '+text))throw new Error('Unexpected Decisions input.');
    await new Promise((resolve,reject)=>{
      if(signal.aborted)return reject(Object.assign(new Error(),{name:'AbortError'}));
      const timer=setTimeout(done,60);
      function done(){signal.removeEventListener('abort',abort);resolve();}
      function abort(){clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Object.assign(new Error(),{name:'AbortError'}));}
      signal.addEventListener('abort',abort,{once:true});
    });
    const commands={'Sense, open connections.':'nav_connections','Sense, open studio.':'nav_studio','Sense, check current frame.':'check_frame','Sense, preview the suggestion.':'preview_suggestion','Sense, apply the suggestion.':'apply_suggestion','Sense, undo your last move.':'undo_sense'};
    return {ok:true,json:async()=>({answers:[{type:'choice',name:'position',choice:text.includes('top right')?'top-right':'keep',confidence:.99},{type:'choice',name:'size',choice:'keep',confidence:.99},{type:'choice',name:'control',choice:'none',confidence:.99},{type:'choice',name:'app_action',choice:commands[text]||commands['Sense, '+text.charAt(0).toLowerCase()+text.slice(1)]||'none',confidence:.99}]})};
  });
}
module.exports={Socket,decision};

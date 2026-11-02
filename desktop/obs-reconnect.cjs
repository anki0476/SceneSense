const {setTimeout:delay}=require('node:timers/promises');
const net=require('node:net');
function portReady(port,signal){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('Repair cancelled.'));
  const socket=net.createConnection({host:'127.0.0.1',port});let settled=false;
  const finish=(ready,error)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);socket.destroy();error?reject(error):resolve(ready);};
  const abort=()=>finish(false,Error('Repair cancelled.'));
  signal?.addEventListener('abort',abort,{once:true});
  socket.setTimeout(700);socket.once('connect',()=>finish(true));socket.once('timeout',()=>finish(false));socket.once('error',()=>finish(false));
 });
}
async function reconnectObs(obs,saved,{signal,launch,wait=delay,onProgress=()=>{},attempts=60,probe=portReady,now=Date.now,timeoutMs=60000}={}){
 const cancelled=()=>{if(signal?.aborted)throw Error('Repair cancelled.');};
 const started=now(),elapsed=()=>Math.floor((now()-started)/1000);
 cancelled();onProgress('Opening OBS…');await launch(signal);cancelled();
 let reason='WebSocket server not accepting connections';
 for(let attempt=0;attempt<attempts&&now()-started<timeoutMs;attempt++){
  cancelled();
  // Launch checks are idempotent, including when a previous OBS process was exiting.
  if(attempt===3){await launch(signal);cancelled();}
  onProgress('Waiting for OBS WebSocket · '+elapsed()+'s · attempt '+(attempt+1)+' of '+attempts+' (port '+saved.port+')…');
  try{
   if(await probe(saved.port,signal)){
    cancelled();onProgress('OBS WebSocket is ready. Authenticating and loading studio…');
    await obs.connect({host:'127.0.0.1',port:saved.port,password:saved.password});
    if(signal?.aborted){await obs.disconnect();cancelled();}
    if(obs.state.status!=='connected')throw Error('Connection was not verified.');
    onProgress('OBS connection verified after '+elapsed()+'s.');return;
   }
  }catch(error){
   cancelled();
   if([error.code,error.cause?.code].includes(4009))throw Error('OBS rejected the saved password. Update your OBS preset in Connections.');
   const code=error.cause?.code??error.code;
   reason=code==='ECONNREFUSED'?'server not accepting connections':code==='ETIMEDOUT'?'connection timed out':code===4006?'unsupported WebSocket protocol':'WebSocket authentication or OBS initialization failed';
   onProgress('OBS reconnect attempt '+(attempt+1)+' failed: '+reason+'. Waiting for readiness…');
  }
  if(attempt<attempts-1&&now()-started<timeoutMs){try{await wait(1000,undefined,{signal});}catch{cancelled();throw Error('Could not wait for OBS.');}}
 }
 throw Error('OBS reconnect failed after '+elapsed()+'s ('+attempts+' checks maximum) on port '+saved.port+': '+reason+'. Check that WebSocket is enabled and the saved preset has the current port and password.');
}
module.exports={reconnectObs,portReady};

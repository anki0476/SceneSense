// Actual worker + local-server lifecycle/security probe; no webcam or OBS mutation.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {once}=require('node:events'),{WebSocket}=require('ws');
const {NativeMattingBridge}=require('../desktop/native-matting-bridge.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.artifacts/native-integration-20261101');
async function main(){
 const bridge=new NativeMattingBridge({root,profile:path.join(out,'lifecycle-profile')});bridge.on('failure',()=>{});let idle,viewer;
 try{
  await bridge.start();const wrong=await fetch('http://127.0.0.1:'+bridge.port+'/not-a-session');assert.equal(wrong.status,404);
  const rejected=await new Promise(resolve=>{const client=new WebSocket(bridge.url.replace('http:','ws:')+'/frames',{origin:'http://untrusted.invalid'});client.on('open',()=>{client.terminate();resolve(false);});client.on('error',()=>resolve(true));});assert.equal(rejected,true);
  viewer=new WebSocket(bridge.url.replace('http:','ws:')+'/frames',{origin:'http://127.0.0.1:'+bridge.port});viewer.on('error',()=>{});await once(viewer,'open');
  idle=net.connect(bridge.port,'127.0.0.1');idle.on('error',()=>{});await once(idle,'connect');
  const start=Date.now();let timer;try{await Promise.race([bridge.stop(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Shutdown exceeded five seconds')),5000);})]);}finally{clearTimeout(timer);}
  const result={wrongSessionReturns404:true,wrongOriginRejected:true,shutdownWithActiveViewerAndIdleSocketMs:Date.now()-start,workerStopped:bridge.child.exitCode!==null||bridge.child.signalCode!==null,serverStopped:!bridge.server.listening,scope:'Actual GPU worker and local transport; no camera capture or OBS changes.'};assert.ok(result.workerStopped&&result.serverStopped);fs.writeFileSync(path.join(out,'lifecycle.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{idle?.destroy();viewer?.terminate();await bridge.stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

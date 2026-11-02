const path=require('node:path');
const {execFile}=require('node:child_process');
function run(executable,args,options){return new Promise((resolve,reject)=>execFile(executable,args,options,error=>error?reject(new Error('Update build failed. The current app is still open. Check the project build, then try again.')):resolve()));}
async function buildUpdate(root,{executable=process.execPath,execute=run}={}){
  const options={cwd:root,windowsHide:true,timeout:120000,maxBuffer:1024*1024,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}};
  await execute(executable,[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit'],options);
  await execute(executable,[path.join(root,'node_modules/vite/bin/vite.js'),'build'],options);
}
module.exports={buildUpdate};

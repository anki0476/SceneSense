const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
function buildFingerprint(root){
  const hash=createHash('sha256');
  function visit(relative){
    const absolute=path.join(root,relative);
    if(!fs.existsSync(absolute))return;
    if(fs.statSync(absolute).isDirectory()){for(const name of fs.readdirSync(absolute).sort())visit(path.join(relative,name));}
    else {hash.update(relative.replaceAll('\\','/'));hash.update('\0');hash.update(fs.readFileSync(absolute));hash.update('\0');}
  }
  for(const entry of ['desktop','dist','package.json','package-lock.json','RELEASE_NOTES.json'])visit(entry);
  return hash.digest('hex');
}
function releaseNotes(root){
  try{const value=JSON.parse(fs.readFileSync(path.join(root,'RELEASE_NOTES.json'),'utf8'));if(!Array.isArray(value))return [];return value.filter(x=>typeof x.id==='string'&&Array.isArray(x.items)&&x.items.every(t=>typeof t==='string'&&t.length<1000)).slice(0,200);}catch{return [];}
}
function newReleaseItems(previous,next){const known=new Set(previous.map(x=>JSON.stringify(x)));return [...new Set(next.filter(x=>!known.has(JSON.stringify(x))).flatMap(x=>x.items))].slice(0,50);}
function saveUpdateReceipt(file,previous,target,changes=[]){fs.writeFileSync(file,JSON.stringify({previous,target,changes,at:new Date().toISOString()}));}
function consumeUpdateReceipt(file,current){
  if(!fs.existsSync(file))return null;
  try{
    const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
    if(![receipt.previous,receipt.target].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)))throw new Error();
    if(receipt.target!==current)return {status:'changed',message:'Local files changed again after the update build. Restart for updates to load the latest changes.'};
    const changes=Array.isArray(receipt.changes)?receipt.changes.filter(x=>typeof x==='string'&&x.length<1000).slice(0,50):[];
    return receipt.previous===receipt.target?{status:'current',message:'Already up to date. SceneSense restarted with the same local build.'}:{status:'updated',message:'Updated successfully. SceneSense is running the rebuilt local app.',changes:changes.length?changes:['Local app code was rebuilt. No release notes were supplied for this update.']};
  }catch{return {status:'unknown',message:'SceneSense restarted, but the previous update status could not be verified.'};}
  finally{fs.rmSync(file,{force:true});}
}
module.exports={buildFingerprint,saveUpdateReceipt,consumeUpdateReceipt,releaseNotes,newReleaseItems};

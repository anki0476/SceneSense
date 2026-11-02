const {createHash}=require('node:crypto');
function describeBitmap(bitmap){
 if(!Buffer.isBuffer(bitmap)||bitmap.length!==64*36*4)throw Error('Invalid bounded video sample.');
 let dark=0,visible=0;for(let i=0;i<bitmap.length;i+=4){if(bitmap[i+3]>16){visible++;if(Math.max(bitmap[i],bitmap[i+1],bitmap[i+2])<8)dark++;}}
 return {dark:visible===0||dark/(64*36)>.995,visible:visible>64*36*.01,hash:createHash('sha256').update(bitmap).digest('hex')};
}
class FrameHealth{
 constructor(){this.reset();}
 reset(){this.samples={};}
 observe(role,frame,now){
  const old=this.samples[role],same=old?.hash===frame.hash;
  const state={visible:frame.visible,dark:frame.dark,hash:frame.hash,count:same?old.count+1:1,since:same?old.since:now,darkSince:frame.dark?(old?.darkSince??now):null,darkCount:frame.dark?(old?.darkCount||0)+1:0};this.samples[role]=state;
  if(role==='game'&&frame.dark&&state.darkCount>=3&&now-state.darkSince>=8000)return {id:'game-black',title:'Game capture looks black',detail:'Repeated dark snapshots. A loading screen or dark game scene can also cause this.',repairable:true,reviewOnly:true,action:'Review capture settings',video:true};
  if(role==='webcam'&&frame.visible&&!frame.dark&&state.count>=4&&now-state.since>=12000)return {id:'webcam-frozen',title:'Webcam may be frozen',detail:'The sampled image has not changed for at least 12 seconds. A still image can also cause this.',repairable:true,reviewOnly:true,action:'Review webcam settings',video:true};
  return null;
 }
}
module.exports={describeBitmap,FrameHealth};

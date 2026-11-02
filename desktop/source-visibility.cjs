const {z}=require('zod');
class SourceVisibility{
 constructor(obs,getTarget){this.obs=obs;this.getTarget=getTarget;}
 async read(){
  if(this.obs.state.status!=='connected')throw Error('Connect OBS first.');
  const target=this.getTarget();const snapshot=target?{...target}:null;
  const {currentProgramSceneName}=await this.obs.call('GetCurrentProgramScene',undefined,false);
  if(currentProgramSceneName!==this.obs.state.currentScene)throw Error('Scene changed. Confirm sources again.');
  const {sceneItems}=await this.obs.call('GetSceneItemList',{sceneName:currentProgramSceneName},false);
  if(currentProgramSceneName!==this.obs.state.currentScene)throw Error('Scene changed. Try again.');
  return {scene:currentProgramSceneName,sources:sceneItems.map(item=>({id:item.sceneItemId,name:item.sourceName,visible:item.sceneItemEnabled}))};
 }
 async set(input){
  const {scene,id,name,visible}=z.object({scene:z.string().min(1),id:z.number().int().nonnegative(),name:z.string().min(1),visible:z.boolean()}).strict().parse(input);
  return this.obs.exclusive(async()=>{
   const before=await this.read(),source=before.sources.find(x=>x.id===id&&x.name===name);
   if(before.scene!==scene||!source)throw Error('Sources changed. Try again.');
   await this.obs.call('SetSceneItemEnabled',{sceneName:before.scene,sceneItemId:source.id,sceneItemEnabled:visible});
   const actual=await this.read();if(actual.sources.find(x=>x.id===id&&x.name===name)?.visible!==visible)throw Error('OBS did not verify the visibility change.');
   return actual;
  });
 }
}
module.exports={SourceVisibility};

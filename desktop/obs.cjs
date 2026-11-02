const { z } = require('zod');
const connectionSchema = z.object({ host: z.enum(['127.0.0.1', 'localhost']).default('127.0.0.1'), port: z.number().int().min(1024).max(65535), password: z.string().max(256) });
const selectionSchema = z.object({ scene: z.string().min(1).max(256), webcamId: z.number().int().nonnegative(), gameId: z.number().int().nonnegative() }).refine(x => x.webcamId !== x.gameId, 'Choose different webcam and game sources.');
const actionSchema = z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'smaller', 'larger', 'restore']);
function destination(transform, video, action) {
  if (transform.rotation !== 0 || transform.alignment !== 5 || transform.boundsType !== 'OBS_BOUNDS_NONE') throw new Error('Phase 1 supports an unrotated webcam with top-left alignment and no bounding box. In OBS: Transform → Edit Transform.');
  if (transform.scaleX <= 0 || transform.scaleY <= 0) throw new Error('Flipped webcam transforms are not supported yet.');
  if (['cropTop','cropBottom','cropLeft','cropRight'].some(k => (transform[k] || 0) !== 0)) throw new Error('Phase 1 requires an uncropped webcam source. Reset its crop in OBS before confirming.');
  const scale = action === 'smaller' ? 0.9 : action === 'larger' ? 1.1 : 1;
  const width = transform.width * scale, height = transform.height * scale;
  if (![width, height].every(Number.isFinite) || width < 32 || height < 32 || width > video.baseWidth - 48 || height > video.baseHeight - 48) throw new Error('Webcam size must fit inside the canvas with a 24px margin.');
  let positionX = Math.max(24, Math.min(transform.positionX, video.baseWidth - width - 24));
  let positionY = Math.max(24, Math.min(transform.positionY, video.baseHeight - height - 24));
  if (action.includes('left')) positionX = 24;
  if (action.includes('right')) positionX = video.baseWidth - width - 24;
  if (action.startsWith('top')) positionY = 24;
  if (action.startsWith('bottom')) positionY = video.baseHeight - height - 24;
  return { positionX, positionY, scaleX: transform.scaleX * scale, scaleY: transform.scaleY * scale };
}
// OBS accepts a zero-sized inactive bounding box in a read response, but rejects
// those dimensions in SetSceneItemTransform. Do not round-trip inactive bounds.
function restorable(t) { return Object.fromEntries(['positionX','positionY','scaleX','scaleY','rotation','alignment','boundsType',...(t.boundsType === 'OBS_BOUNDS_NONE' ? [] : ['boundsAlignment','boundsWidth','boundsHeight']),'cropTop','cropBottom','cropLeft','cropRight'].filter(k => t[k] !== undefined).map(k => [k, t[k]])); }
function layout(t) { return Object.fromEntries(['positionX','positionY','width','height'].map(k => [k,t[k]])); }
class ObsService {
  constructor(client, publish,{cropImage}={}) {
    this.cropImage=cropImage;
    this.client = client; this.publish = publish; this.state = { status: 'disconnected', scenes: [], items: [], selection: null, hasRestore: false }; this.busy = false; this.generation = 0;
    client.on('ConnectionClosed', () => { this.state.status = 'disconnected'; this.invalidate(); });
    client.on('ConnectionError', () => {});
    client.on('CurrentProgramSceneChanged', event => { this.state.currentScene = event?.sceneName; this.invalidate(); });
    for (const event of ['SceneItemRemoved','SceneNameChanged','SceneItemCreated','InputNameChanged','SceneItemEnableStateChanged']) client.on(event, () => this.invalidate());
  }
  invalidate() { this.generation++; this.state.items = []; this.state.selection = null; this.snapshot = null; this.state.hasRestore = false; this.state.restorePoint = null; this.state.lastVerified = null; this.emit(); }
  assertCurrent(generation) { if (generation !== this.generation || this.state.status !== 'connected') throw new Error('OBS context changed. Refresh and confirm sources again.'); }
  emit() { this.publish({ kind: 'obs', ...this.state }); }
  async exclusive(task) { if (this.busy) throw new Error('An OBS operation is already running.'); this.busy = true; try { return await task(); } finally { this.busy = false; } }
  async call(type, data, invalidateOnTimeout = true) {
    let timer;
    try { return await Promise.race([this.client.call(type, data), new Promise((_, reject) => { timer = setTimeout(() => { if (invalidateOnTimeout) this.invalidate(); reject(new Error(invalidateOnTimeout ? 'OBS did not respond. Refresh the connection before trying again; the previous action may have applied.' : 'Preview timed out. Retrying automatically.')); }, 5000); })]); }
    finally { clearTimeout(timer); }
  }
  async connect(input) {
    return this.exclusive(async () => {
      const { host, port, password } = connectionSchema.parse(input);
      await this.client.disconnect(); this.state = { status: 'connecting', scenes: [], items: [], selection: null, hasRestore: false }; this.emit();
      try {
        let timer;
        try { await Promise.race([this.client.connect(`ws://${host}:${port}`, password, { rpcVersion: 1 }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Connection timed out.')), 8000); })]); }
        finally { clearTimeout(timer); }
        this.generation++; this.state.status = 'connected'; await this.refresh(); return this.state;
      } catch (cause) { await this.client.disconnect(); this.state.status = 'disconnected'; this.emit(); throw new Error('Could not connect to OBS. Check that OBS is open, WebSocket is enabled, and the port/password match.', { cause }); }
    });
  }
  async refresh() {
    if (this.state.status !== 'connected') throw new Error('Connect OBS first.');
    const generation = this.generation;
    const [scenes, video] = await Promise.all([this.call('GetSceneList'), this.call('GetVideoSettings')]);
    this.assertCurrent(generation);
    this.state.scenes = scenes.scenes.map(s => s.sceneName); this.state.currentScene = scenes.currentProgramSceneName; this.state.video = video;
    this.state.items = []; this.state.selection = null; this.snapshot = null; this.state.hasRestore = false; this.state.restorePoint = null; this.state.lastVerified = null; this.emit(); return this.state;
  }
  async items(scene) {
    z.string().min(1).max(256).parse(scene);
    if (this.state.status !== 'connected' || scene !== this.state.currentScene) throw new Error('Select the active program scene.');
    const generation = this.generation;
    const response = await this.call('GetSceneItemList', { sceneName: scene });
    this.assertCurrent(generation);
    this.state.items = response.sceneItems.filter(s => !s.isGroup && s.sourceType !== 'OBS_SOURCE_TYPE_SCENE').map(s => ({ id: s.sceneItemId, name: s.sourceName, enabled: s.sceneItemEnabled, kind: s.inputKind || s.sourceType }));
    this.state.selection = null; this.snapshot = null; this.state.hasRestore = false; this.state.restorePoint = null; this.state.lastVerified = null; this.emit(); return this.state.items;
  }
  async select(input) {
    return this.exclusive(async () => {
      const s = selectionSchema.parse(input); const generation = this.generation;
      this.assertCurrent(generation);
      const current = await this.call('GetCurrentProgramScene');
      if (current.currentProgramSceneName !== s.scene) throw new Error('The active scene changed. Refresh and select sources again.');
      if (![s.webcamId, s.gameId].every(id => this.state.items.some(x => x.id === id && x.enabled))) throw new Error('Choose two visible sources in the active scene.');
      const { sceneItemTransform } = await this.call('GetSceneItemTransform', { sceneName: s.scene, sceneItemId: s.webcamId });
      this.assertCurrent(generation);
      destination(sceneItemTransform, this.state.video, 'top-left');
      this.snapshot = restorable(sceneItemTransform); this.state.restorePoint = layout(sceneItemTransform); this.state.lastVerified = null; this.state.selection = s; this.state.hasRestore = true; this.emit(); return this.state;
    });
  }
  async act(input) {
    const action = actionSchema.parse(input);
    return this.exclusive(async () => {
      const s = this.state.selection, generation = this.generation;
      if (!s || this.state.status !== 'connected') throw new Error('Connect and confirm your webcam/game sources first.');
      this.state.lastVerified = null; this.emit();
      const current = await this.call('GetCurrentProgramScene');
      if (current.currentProgramSceneName !== s.scene) throw new Error('Scene changed. Refresh and confirm sources again.');
      const { sceneItemTransform: before } = await this.call('GetSceneItemTransform', { sceneName: s.scene, sceneItemId: s.webcamId });
      const target = action === 'restore' ? this.snapshot : destination(before, this.state.video, action);
      if (generation !== this.generation || this.state.selection !== s) throw new Error('OBS context changed. No action was sent.');
      await this.animatePlacement({sceneName:s.scene,sceneItemId:s.webcamId},target,generation);
      const { sceneItemTransform: actual } = await this.call('GetSceneItemTransform', { sceneName: s.scene, sceneItemId: s.webcamId });
      this.assertCurrent(generation);
      if (!Object.entries(target).every(([k,v]) => typeof v === 'number' ? Math.abs(actual[k] - v) < (k.startsWith('scale') ? 0.00001 : 0.5) : actual[k] === v)) throw new Error('OBS layout differs from the requested change. Inspect the preview before retrying.');
      if (action === 'restore' && !['width','height'].every(k => Math.abs(actual[k] - this.state.restorePoint[k]) < 0.5)) throw new Error('Position restored, but webcam dimensions differ from the saved layout. Its source resolution may have changed. Confirm sources to save a new restore point.');
      this.state.lastVerified = { ...layout(actual), action }; this.emit();
      return { action, transform: actual };
    });
  }
  async preview(role) {
    if (!['webcam','game'].includes(role)) throw new Error('Unknown preview source.');
    const s = this.state.selection;
    if (!s || this.state.status !== 'connected') throw new Error('Confirm sources first.');
    const generation = this.generation;
    const item = this.state.items.find(x => x.id === (role === 'webcam' ? s.webcamId : s.gameId));
    const response = await this.call('GetSourceScreenshot', { sourceName: item.name, imageFormat: 'jpeg', imageWidth: role === 'game' ? 960 : 480, imageCompressionQuality: 65 });
    this.assertCurrent(generation);
    return response.imageData;
  }
  async programPreview() {
    if (this.state.status !== 'connected' || !this.state.currentScene) throw new Error('Connect OBS to view your scene.');
    const generation = this.generation, scene = this.state.currentScene;
    const response = await this.call('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpeg', imageWidth: 960, imageCompressionQuality: 65 }, false);
    this.assertCurrent(generation);
    return { image: response.imageData, scene, capturedAt: Date.now() };
  }
  async prepareSmoothPreview() {
    return this.exclusive(async () => {
      if (this.state.status !== 'connected') throw new Error('Connect OBS before enabling smooth video.');
      const generation = this.generation;
      const status = await this.call('GetVirtualCamStatus');
      this.assertCurrent(generation);
      if (!status.outputActive) await this.call('StartVirtualCam');
      this.assertCurrent(generation);
      const verified = await this.call('GetVirtualCamStatus');
      this.assertCurrent(generation);
      if (!verified.outputActive) throw new Error('OBS Virtual Camera did not start. Check its setup in OBS.');
      return { active: true };
    });
  }
  async voiceCheckpoint() {
    return this.exclusive(async () => {
      const selection = this.state.selection, generation = this.generation;
      if (!selection) throw new Error('Confirm webcam and game sources before using voice.');
      const current = await this.call('GetCurrentProgramScene');
      if (current.currentProgramSceneName !== selection.scene) throw new Error('Scene changed. Confirm sources again.');
      const { sceneItemTransform } = await this.call('GetSceneItemTransform', { sceneName: selection.scene, sceneItemId: selection.webcamId });
      this.assertCurrent(generation);
      return { selection, generation, transform: structuredClone(sceneItemTransform) };
    });
  }
  async layoutSample(){
    return this.exclusive(async()=>{
      const selection=this.state.selection,generation=this.generation;
      if(!selection)throw new Error('Confirm webcam and game sources first.');
      const current=await this.call('GetCurrentProgramScene');
      if(current.currentProgramSceneName!==selection.scene)throw new Error('Scene changed. Confirm sources again.');
      const gameItem=this.state.items.find(x=>x.id===selection.gameId);
      if(gameItem?.kind!=='game_capture')throw new Error('Scene awareness currently requires a Game Capture source. Select your game capture in Connections.');
      const source={sceneName:selection.scene};
      const {sceneItemTransform:camera}=await this.call('GetSceneItemTransform',{...source,sceneItemId:selection.webcamId});
      const {sceneItemTransform:game}=await this.call('GetSceneItemTransform',{...source,sceneItemId:selection.gameId});
      if(game.rotation!==0||game.alignment!==5||game.boundsType!=='OBS_BOUNDS_NONE'||!(game.scaleX>0&&game.scaleY>0&&game.width>0&&game.height>0)||['cropTop','cropBottom','cropLeft','cropRight'].some(k=>(game[k]||0)!==0))throw new Error('Image checks currently require an uncropped, unrotated game source with top-left alignment and no bounding-box scaling.');
      const rect=t=>({x:(t.positionX-game.positionX)/game.width,y:(t.positionY-game.positionY)/game.height,width:t.width/game.width,height:t.height/game.height});
      destination(camera,this.state.video,'top-left');
      const placements=require('./layout-placements.cjs').placements(camera,this.state.video);
      const candidates=Object.fromEntries(Object.entries(placements).map(([id,t])=>[id,rect(t)]));
      const {imageData:image}=await this.call('GetSourceScreenshot',{sourceName:gameItem.name,imageFormat:'jpeg',imageWidth:1280,imageCompressionQuality:90},false);
      this.assertCurrent(generation);
      const rects={current:rect(camera),candidates};
      const canvasRect=t=>({x:t.positionX/this.state.video.baseWidth,y:t.positionY/this.state.video.baseHeight,width:t.width/this.state.video.baseWidth,height:t.height/this.state.video.baseHeight});
      const canvasRects={current:canvasRect(camera),candidates:Object.fromEntries(Object.entries(placements).map(([id,t])=>[id,canvasRect(t)]))};
      return {image,rects,canvasRects,placements,crops:this.cropImage?.(image,rects),checkpoint:{selection,generation,transform:structuredClone(camera),gameTransform:structuredClone(game),requireUnchanged:true,maxAge:60000,capturedAt:Date.now()}};
    });
  }
  async animatePlacement(source,target,generation,canApply){
    const {sceneItemTransform:initial}=await this.call('GetSceneItemTransform',source);let expected=initial;
    for(let frame=1;frame<=8;frame++){
      this.assertCurrent(generation);if(canApply&&!canApply())throw new Error('Placement cancelled during animation. Inspect the current preview.');
      const {sceneItemTransform:actual}=await this.call('GetSceneItemTransform',source);
      if(!['positionX','positionY','scaleX','scaleY'].every(k=>Math.abs(actual[k]-expected[k])<(k.startsWith('scale')?.00001:.5)))throw new Error('OBS layout differs during animation. Movement stopped.');
      const t=frame/8,ease=t*t*(3-2*t);const next=frame===8?{...target}:{};
      for(const key of ['positionX','positionY','scaleX','scaleY'])if(Number.isFinite(target[key]))next[key]=initial[key]+(target[key]-initial[key])*ease;
      await this.call('SetSceneItemTransform',{...source,sceneItemTransform:next});expected={...expected,...next};if(frame<8)await new Promise(resolve=>setTimeout(resolve,30));
    }
  }
  async applyVoicePlan(checkpoint, input, placement) {
    const plan = z.object({ position: z.enum(['keep','top-left','top-right','bottom-left','bottom-right']), size: z.enum(['keep','smaller','larger']) }).parse(input);
    return this.exclusive(async () => {
      this.assertCurrent(checkpoint.generation);
      if (!this.state.selection || this.state.selection.scene !== checkpoint.selection.scene || this.state.selection.webcamId !== checkpoint.selection.webcamId) throw new Error('Webcam selection changed. Voice action cancelled.');
      const current = await this.call('GetCurrentProgramScene');
      if (current.currentProgramSceneName !== checkpoint.selection.scene) throw new Error('Scene changed. Voice action cancelled.');
      const base = checkpoint.transform;
      if(checkpoint.requireUnchanged){
        if(this.state.selection.gameId!==checkpoint.selection.gameId||Date.now()-checkpoint.capturedAt>(checkpoint.maxAge||12000))throw new Error('Image recommendation expired or game selection changed. Check again.');
        const equal=(actual,expected)=>Object.entries({...restorable(expected),width:expected.width,height:expected.height}).every(([k,v])=>typeof v==='number'?Math.abs(actual[k]-v)<.00001:actual[k]===v);
        for(const [id,expected] of [[checkpoint.selection.webcamId,checkpoint.expectedTransform||base],[checkpoint.selection.gameId,checkpoint.gameTransform]]){
          const {sceneItemTransform}=await this.call('GetSceneItemTransform',{sceneName:checkpoint.selection.scene,sceneItemId:id});
          if(!equal(sceneItemTransform,expected))throw new Error('OBS layout changed since analysis. No automatic move was sent. Check again.');
        }
      }
      const scale = plan.size === 'smaller' ? .9 : plan.size === 'larger' ? 1.1 : 1;
      let target = restorable(base);
      if (plan.size !== 'keep') Object.assign(target, destination(base, this.state.video, plan.size));
      if (plan.position !== 'keep') Object.assign(target, destination({ ...base, ...target, width: base.width * scale, height: base.height * scale }, this.state.video, plan.position));
      if(placement){const v=this.state.video;const p=z.object({positionX:z.number().min(0),positionY:z.number().min(0),width:z.number().positive(),height:z.number().positive(),scaleX:z.number().positive(),scaleY:z.number().positive(),scale:z.number().min(.6).max(1)}).parse(placement);if(p.positionX+p.width>v.baseWidth||p.positionY+p.height>v.baseHeight||Math.abs(p.width-base.width*p.scale)>.01||Math.abs(p.height-base.height*p.scale)>.01||Math.abs(p.scaleX-base.scaleX*p.scale)>.00001||Math.abs(p.scaleY-base.scaleY*p.scale)>.00001)throw new Error('Invalid placement. Check again.');Object.assign(target,{positionX:p.positionX,positionY:p.positionY,scaleX:p.scaleX,scaleY:p.scaleY});}
      this.assertCurrent(checkpoint.generation);
      const source = { sceneName: checkpoint.selection.scene, sceneItemId: checkpoint.selection.webcamId };
      if(checkpoint.requireUnchanged&&(Date.now()-checkpoint.capturedAt>(checkpoint.maxAge||12000)||!checkpoint.canApply?.()))throw new Error('Image recommendation cancelled or expired. No move was sent.');
      await this.animatePlacement(source,target,checkpoint.generation,checkpoint.requireUnchanged?checkpoint.canApply:undefined);
      const { sceneItemTransform: actual } = await this.call('GetSceneItemTransform', source);
      this.assertCurrent(checkpoint.generation);
      if (!Object.entries(target).every(([k,v]) => typeof v === 'number' ? Math.abs(actual[k]-v) < (k.startsWith('scale') ? .00001 : .5) : actual[k] === v)) throw new Error('OBS did not match the voice instruction.');
      this.state.lastVerified = { ...layout(actual), action: 'voice' }; this.emit();
      return actual;
    });
  }
  async disconnect() { if (this.busy) throw new Error('Wait for the current OBS operation.'); await this.client.disconnect(); }
}
module.exports = { ObsService, destination, restorable };

const { WebSocketServer } = require('ws');
const { createHash } = require('node:crypto');
const hash = text => createHash('sha256').update(text).digest('base64');
const password = 'fixture-password';
const original = { positionX:50, positionY:60, scaleX:.5, scaleY:.5, width:320, height:180, rotation:0, alignment:5, boundsType:'OBS_BOUNDS_NONE', boundsWidth:0, boundsHeight:0, boundsAlignment:0, cropTop:0, cropBottom:0, cropLeft:0, cropRight:0 };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
async function createObsFixture({supervisor=false}={}) {
  const server = new WebSocketServer({ host:'127.0.0.1',port:0 });
  await new Promise(resolve => server.once('listening',resolve));
  const state = { scene:'Fixture Game',micMuted:false,webcamVisible:true, transform:{...original}, writes:[], filters:[], failedAuth:0, requests:[] };
  function event(type, data) { for (const s of server.clients) if (s.authenticated) s.send(JSON.stringify({op:5,d:{eventType:type,eventIntent:4,eventData:data}})); }
  server.on('connection', socket => {
    const salt='fixture-salt', challenge='fixture-challenge';
    socket.send(JSON.stringify({op:0,d:{obsWebSocketVersion:'5.6.0',rpcVersion:1,authentication:{salt,challenge}}}));
    socket.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.op === 1) {
        if (m.d.authentication !== hash(hash(password + salt) + challenge)) { state.failedAuth++; socket.close(4009,'Authentication failed'); return; }
        socket.authenticated=true; socket.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}})); return;
      }
      if (!socket.authenticated || m.op !== 6) return;
      state.requests.push(m.d.requestType);
      let responseData = {}, result=true;
      switch (m.d.requestType) {
        case 'GetInputList': responseData={inputs:[{inputName:'Fixture Mic',inputKind:'wasapi_input_capture'}]};break;
        case 'GetInputVolume': responseData={inputVolumeDb:0};break;
        case 'GetInputMute': responseData={inputMuted:state.micMuted};break;
        case 'SetInputMute': state.micMuted=m.d.requestData.inputMuted;event('InputMuteStateChanged',{inputName:'Fixture Mic',inputMuted:state.micMuted});if(supervisor&&state.micMuted)setTimeout(()=>{state.webcamVisible=false;event('SceneItemEnableStateChanged',{sceneName:state.scene,sceneItemId:1,sceneItemEnabled:false});},50).unref();break;
        case 'SetSceneItemEnabled':state.webcamVisible=m.d.requestData.sceneItemEnabled;event('SceneItemEnableStateChanged',{sceneName:state.scene,sceneItemId:1,sceneItemEnabled:state.webcamVisible});break;
        case 'GetSceneItemEnabled':responseData={sceneItemEnabled:state.webcamVisible};break;
        case 'OpenInputPropertiesDialog':responseData={};break;
        case 'GetSourceFilterKindList': responseData={sourceFilterKinds:['background_removal']}; break;
        case 'GetSourceFilterList': responseData={filters:state.filters}; break;
        case 'CreateSourceFilter': state.filters.push({...m.d.requestData,filterEnabled:true}); break;
        case 'SetSourceFilterEnabled': {const filter=state.filters.find(x=>x.filterName===m.d.requestData.filterName);if(!filter)result=false;else filter.filterEnabled=m.d.requestData.filterEnabled;break;}
        case 'GetVirtualCamStatus': responseData={outputActive:!!state.virtualActive}; break;
        case 'StartVirtualCam': state.virtualActive=true; break;
        case 'GetSceneList': responseData={currentProgramSceneName:state.scene,scenes:[{sceneName:'Fixture Game'},{sceneName:'Fixture BRB'}]}; break;
        case 'GetVideoSettings': responseData={baseWidth:1920,baseHeight:1080}; break;
        case 'GetCurrentProgramScene': responseData={currentProgramSceneName:state.scene}; break;
        case 'GetSceneItemList': responseData={sceneItems:[{sceneItemId:1,sourceName:'Fixture Webcam',sceneItemEnabled:state.webcamVisible,sourceType:'OBS_SOURCE_TYPE_INPUT',inputKind:'dshow_input'},{sceneItemId:2,sourceName:'Fixture Game Capture',sceneItemEnabled:true,sourceType:'OBS_SOURCE_TYPE_INPUT',inputKind:'game_capture'}]}; break;
        case 'GetSceneItemTransform': responseData={sceneItemTransform:m.d.requestData.sceneItemId===2?{...original,positionX:0,positionY:0,width:1920,height:1080,scaleX:1,scaleY:1}:{...state.transform}}; break;
        case 'SetSceneItemTransform': {
          const target=m.d.requestData.sceneItemTransform;
          if (['boundsWidth','boundsHeight'].some(k=>target[k] !== undefined && target[k]<1)) { result=false; break; }
          Object.assign(state.transform,m.d.requestData.sceneItemTransform);
          state.transform.width=640*state.transform.scaleX; state.transform.height=360*state.transform.scaleY;
          state.writes.push({...state.transform}); break;
        }
        case 'GetSourceScreenshot': {
          const t=state.transform;
          const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#182338"/><text x="800" y="540" fill="white" font-size="40">SIMULATED OBS SCENE</text><rect x="${t.positionX}" y="${t.positionY}" width="${t.width}" height="${t.height}" fill="#bba3ff"/></svg>`;
          responseData={imageData:m.d.requestData.sourceName===state.scene?'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'):image}; break;
        }
        default: result=false;
      }
      socket.send(JSON.stringify({op:7,d:{requestType:m.d.requestType,requestId:m.d.requestId,requestStatus:{result,code:result?100:204},responseData}}));
    });
  });
  return { port:server.address().port, password, state, original,
    changeScene() { state.scene='Fixture BRB'; event('CurrentProgramSceneChanged',{sceneName:state.scene}); },
    async close() { for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); }
  };
}
module.exports = { createObsFixture };

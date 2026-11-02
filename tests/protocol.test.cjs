const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const OBSWebSocket = require('obs-websocket-js/json').default;
const { ObsService } = require('../desktop/obs.cjs');
test('real OBS client completes v5 handshake and reads scenes over WebSocket', async () => {
  const server = new WebSocketServer({ host:'127.0.0.1',port:0 });
  await new Promise(resolve => server.once('listening',resolve));
  server.on('connection', socket => {
    socket.send(JSON.stringify({op:0,d:{obsWebSocketVersion:'5.6.0',rpcVersion:1}}));
    socket.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.op === 1) socket.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));
      if (m.op === 6) socket.send(JSON.stringify({op:7,d:{requestType:m.d.requestType,requestId:m.d.requestId,requestStatus:{result:true,code:100},responseData:m.d.requestType==='GetSceneList'?{currentProgramSceneName:'Fixture',scenes:[{sceneName:'Fixture'}]}:{baseWidth:1920,baseHeight:1080}}}));
    });
  });
  const client = new OBSWebSocket(); const service = new ObsService(client, () => {});
  try { const state = await service.connect({host:'127.0.0.1',port:server.address().port,password:''}).catch(error => { throw error.cause || error; }); assert.equal(state.status,'connected'); assert.deepEqual(state.scenes,['Fixture']); }
  finally { await client.disconnect(); for (const s of server.clients) s.terminate(); await new Promise(resolve => server.close(resolve)); }
});

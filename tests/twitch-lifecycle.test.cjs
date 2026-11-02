const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { TwitchService } = require('../desktop/twitch.cjs');
const clientId='fixtureClientId123';
class Timers {
  constructor(){this.next=0;this.jobs=new Map();}
  setTimeout(fn,delay){const id=++this.next;this.jobs.set(id,{fn,delay});return id;}
  setInterval(fn,delay){return this.setTimeout(fn,delay);}
  clearTimeout(id){this.jobs.delete(id);}
  clearInterval(id){this.jobs.delete(id);}
  async fire(id){const job=this.jobs.get(id);assert.ok(job,'timer exists');this.jobs.delete(id);await job.fn();}
}
const ok=body=>({ok:true,status:200,body});
const no=message=>({ok:false,status:400,body:{message}});
function setup(overrides={}) {
  const timers=new Timers(), sockets=[], requests=[], events=[];
  const tokens=[ok({access_token:'test-access',refresh_token:'test-refresh',expires_in:14400}),ok({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:14400})];
  class Socket extends EventEmitter {
    constructor(url){super();this.url=url;this.closed=false;sockets.push(this);}
    terminate(){if(!this.closed){this.closed=true;this.emit('close');}}
    close(){this.terminate();}
    message(type,payload){this.emit('message',Buffer.from(JSON.stringify({metadata:{message_type:type},payload})));}
  }
  const http=async(url,input)=>{
    requests.push({url,...input});
    if(url.endsWith('/device'))return ok({device_code:'test-device',user_code:'TESTCODE',expires_in:1800,interval:5,verification_uri:'https://www.twitch.tv/activate?device-code=TESTCODE'});
    if(url.endsWith('/token'))return tokens.shift();
    if(url.endsWith('/validate'))return ok({client_id:clientId,user_id:'123',login:'fixturecreator',scopes:['user:read:chat']});
    if(url.endsWith('/subscriptions'))return ok({data:[{status:'enabled'}]});
    throw new Error('Unexpected URL');
  };
  const service=new TwitchService(event=>events.push(structuredClone(event)),{http,Socket,timers,...overrides});
  return {service,timers,sockets,requests,events,tokens};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function authorized() {const f=setup();await f.service.begin(clientId);await f.timers.fire(f.service.pollTimer);f.sockets[0].message('session_welcome',{session:{id:'session-1',keepalive_timeout_seconds:10}});await flush();return f;}
test('device authorization validates token, then subscribes to own-channel chat',async()=>{
  const f=await authorized();
  try {
    assert.equal(f.service.state.status,'connected');assert.equal(f.service.state.login,'fixturecreator');assert.equal(f.service.state.code,undefined);
    const request=f.requests.find(x=>x.url.endsWith('/subscriptions'));
    const body=JSON.parse(request.body);assert.deepEqual(body.condition,{broadcaster_user_id:'123',user_id:'123'});assert.equal(body.transport.session_id,'session-1');
    assert.ok(!JSON.stringify(f.events).includes('test-access'));assert.ok(!JSON.stringify(f.events).includes('test-refresh'));
  } finally{f.service.disconnect();}
});
test('pending and slowdown responses honor polling without duplicate authorization',async()=>{
  const f=setup();f.tokens.unshift(no('authorization_pending'),no('slow_down'));
  try{await f.service.begin(clientId);await f.timers.fire(f.service.pollTimer);assert.equal(f.service.state.status,'authorizing');await f.timers.fire(f.service.pollTimer);assert.equal(f.service.device.interval,10000);assert.equal(f.timers.jobs.get(f.service.pollTimer).delay,10000);}finally{f.service.disconnect();}
});
test('denied authorization leaves a recoverable error and forgets device code',async()=>{
  const f=setup();f.tokens.unshift(no('access_denied'));await f.service.begin(clientId);await f.timers.fire(f.service.pollTimer);assert.equal(f.service.state.status,'error');assert.equal(f.service.device,null);assert.equal(f.service.token,null);assert.equal(f.timers.jobs.size,0);
});
test('a cancelled in-flight authorization cannot resurrect the connection',async()=>{
  let resolve;const response=new Promise(r=>{resolve=r;});const f=setup({http:()=>response});
  const pending=f.service.begin(clientId);f.service.disconnect();resolve(ok({}));await assert.rejects(pending,/cancelled/);assert.equal(f.service.state.status,'disconnected');assert.equal(f.sockets.length,0);
});
test('refresh rotates the single-use refresh token without exposing it',async()=>{
  const f=await authorized();try{await f.timers.fire(f.service.refreshTimer);assert.equal(f.service.refreshToken,'rotated-refresh');assert.equal(f.service.token,'rotated-access');const request=f.requests.filter(x=>x.url.endsWith('/token'))[1];assert.equal(request.body.get('refresh_token'),'test-refresh');assert.ok(!JSON.stringify(f.events).includes('rotated-access'));}finally{f.service.disconnect();}
});
test('EventSub reconnect transfers session without subscribing again',async()=>{
  const f=await authorized();try{
    f.sockets[0].message('session_reconnect',{session:{reconnect_url:'wss://eventsub.wss.twitch.tv/ws?reconnect=test'}});
    assert.equal(f.service.state.status,'reconnecting');f.sockets[1].message('session_welcome',{session:{id:'session-2',keepalive_timeout_seconds:10}});await flush();
    assert.equal(f.service.state.status,'connected');assert.equal(f.sockets[0].closed,true);assert.equal(f.requests.filter(x=>x.url.endsWith('/subscriptions')).length,1);
  }finally{f.service.disconnect();}
});
test('keepalive timeout closes the socket and clears credentials',async()=>{
  const f=await authorized();const watchdog=[...f.timers.jobs].find(([,job])=>job.delay===15000)?.[0];await f.timers.fire(watchdog);assert.equal(f.service.state.status,'error');assert.equal(f.service.token,null);assert.equal(f.timers.jobs.size,0);
});
test('reconnect addresses outside Twitch are rejected',async()=>{
  const f=await authorized();f.sockets[0].message('session_reconnect',{session:{reconnect_url:'wss://example.com/ws'}});assert.equal(f.service.state.status,'error');assert.equal(f.sockets.length,1);assert.equal(f.service.token,null);
});

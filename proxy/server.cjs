const http=require('node:http');
const crypto=require('node:crypto');
const {WebSocket,WebSocketServer}=require('ws');
const code=process.env.JUDGE_ACCESS_CODE,openai=process.env.OPENAI_API_KEY,sarvam=process.env.SARVAM_API_KEY;
if(!code||code.length<24||!openai)throw Error('Set JUDGE_ACCESS_CODE (24+ characters) and OPENAI_API_KEY.');
let requests=0,active=0;
const cap=Number(process.env.MAX_REQUESTS||1000),clients=new Map();
function authorized(req){const value=String(req.headers.authorization||'').replace(/^Bearer /,'');const a=Buffer.from(value),b=Buffer.from(code);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function admit(req){if(!authorized(req)||requests>=cap)return false;const now=Date.now(),id=req.socket.remoteAddress;const entry=clients.get(id)||{at:now,n:0};if(now-entry.at>60000){entry.at=now;entry.n=0;}clients.set(id,entry);if(++entry.n>40)return false;requests++;return true;}
function error(res,status,text){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:text}));}
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health'&&req.method==='GET'){res.end('ok');return;}
 if(!admit(req))return error(res,403,'Access denied or usage limit reached.');
 if(req.method!=='POST'||!['/openai/v1/decisions','/openai/v1/responses'].includes(req.url))return error(res,404,'Unsupported route.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);res.on('close',()=>controller.abort());
 try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)return error(res,413,'Request too large.');chunks.push(chunk);}
 const body=JSON.parse(Buffer.concat(chunks));if(!['gpt-6-luna','gpt-6.1-terra'].includes(body.model))return error(res,400,'Unsupported model.');
 if(body.stream)return error(res,400,'Streaming HTTP is not supported.');
 if(body.max_output_tokens>2000)return error(res,400,'Output limit exceeded.');
 const upstream=await fetch('https://api.openai.com'+req.url.slice('/openai'.length),{method:'POST',headers:{Authorization:'Bearer '+openai,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
 res.writeHead(upstream.status,{'Content-Type':'application/json'});res.end(await upstream.text());
 }catch{if(!res.headersSent)error(res,502,'Upstream request failed.');else res.end();}finally{clearTimeout(timer);}
});
const wss=new WebSocketServer({noServer:true,maxPayload:128*1024});
server.on('upgrade',(req,socket,head)=>{
 const url=new URL(req.url,'http://localhost');
 const isOpenAI=url.pathname==='/openai/v1/realtime',isSarvam=url.pathname==='/sarvam/speech-to-text-realtime/ws';
 if((!isOpenAI&&!isSarvam)||!admit(req)||active>=3||(isSarvam&&!sarvam)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
 active++;
 wss.handleUpgrade(req,socket,head,client=>{
 const target=(isOpenAI?'wss://api.openai.com/v1/realtime':'wss://api.sarvam.ai/speech-to-text-realtime/ws')+url.search;
 const upstream=new WebSocket(target,{headers:isOpenAI?{Authorization:'Bearer '+openai}:{'api-subscription-key':sarvam},maxPayload:2*1024*1024,handshakeTimeout:15000});
 let closed=false;const pending=[];let bytes=0;
 const timer=setTimeout(()=>close(),120000);
 function close(){if(closed)return;closed=true;active--;clearTimeout(timer);client.close();upstream.close();setTimeout(()=>{client.terminate();upstream.terminate();},1000).unref();}
 client.on('message',(data,binary)=>{if(upstream.bufferedAmount>512000)return close();if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary});else{bytes+=data.length;if(bytes>128000)return close();pending.push([data,binary]);}});
 upstream.on('open',()=>{for(const [data,binary]of pending)upstream.send(data,{binary});pending.length=0;});
 upstream.on('message',(data,binary)=>{if(client.bufferedAmount>512000)return close();if(client.readyState===WebSocket.OPEN)client.send(data,{binary});});
 for(const ws of [client,upstream]){ws.on('close',close);ws.on('error',close);}
 });
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('SceneSense judge proxy listening'));

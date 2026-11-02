import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Development-only, same-origin feedback inbox. Never executes annotations.
export function feedbackServer(){
 return {name:'scenesense-feedback',configureServer(server){
  server.middlewares.use('/__scenesense/feedback',async(req,res)=>{
   const reply=(code,text)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:text}));};
   if(req.method!=='POST')return reply(405,'Use POST.');
   if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json'))return reply(403,'Same-origin JSON requests only.');
   try{
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536)return reply(413,'Feedback is too large.');}
    const value=JSON.parse(body);
    if(value.product!=='SceneSense'||!Array.isArray(value.annotations)||value.annotations.length>100)throw Error('Invalid feedback.');
    const annotations=value.annotations.map(n=>{
     if(!Number.isSafeInteger(n.id)||!Number.isFinite(n.x)||!Number.isFinite(n.y)||typeof n.note!=='string'||!n.note.trim()||n.note.length>4000||typeof n.target!=='string'||n.target.length>500||typeof n.view!=='string'||n.view.length>100)throw Error('Invalid annotation.');
     return {id:n.id,target:n.target,note:n.note,x:n.x,y:n.y,view:n.view};
    });
    const folder=path.join(server.config.root,'feedback');await mkdir(folder,{recursive:true});
    await writeFile(path.join(folder,'SceneSense-feedback.json'),JSON.stringify({product:'SceneSense',annotations},null,2)+'\n');
    reply(200,'Sent to the project. Tell Codex to review the annotations.');
   }catch{reply(400,'Could not save feedback. Check the notes and try again.');}
  });
 }};
}

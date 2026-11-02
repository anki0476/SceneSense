const {z}=require('zod');
class ObsOutputs{
 constructor(obs,{settleMs=8000,pollMs=250}={}){this.obs=obs;this.settleMs=settleMs;this.pollMs=pollMs;}
 guard(generation){this.obs.assertCurrent(generation);}
 async status(){const generation=this.obs.generation;if(this.obs.state.status!=='connected')throw Error('Connect OBS first.');const [stream,record]=await Promise.all([this.obs.call('GetStreamStatus',undefined,false),this.obs.call('GetRecordStatus',undefined,false)]);this.guard(generation);return {streaming:stream.outputActive,recording:record.outputActive,paused:!!record.outputPaused};}
 async set(input){const {kind,active}=z.object({kind:z.enum(['stream','record']),active:z.boolean()}).parse(input);return this.obs.exclusive(async()=>{const before=await this.status(),generation=this.obs.generation;if(before[kind==='stream'?'streaming':'recording']===active)return before;await this.obs.call((active?'Start':'Stop')+(kind==='stream'?'Stream':'Record'));this.guard(generation);let after=await this.status();const deadline=Date.now()+this.settleMs;while(after[kind==='stream'?'streaming':'recording']!==active&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,this.pollMs));this.guard(generation);after=await this.status();}if(after[kind==='stream'?'streaming':'recording']!==active)throw Error('OBS has not confirmed the output change yet. Check OBS and refresh before retrying.');return after;});}
}
module.exports={ObsOutputs};

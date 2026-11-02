const {z}=require('zod');
const changeSchema=z.object({inputName:z.string().min(1).max(256),volumeDb:z.number().finite().min(-100).max(26).optional(),muted:z.boolean().optional()}).refine(x=>(x.volumeDb!==undefined)!==(x.muted!==undefined),'Choose one audio change.');
class AudioMixer{
 constructor(obs){this.obs=obs;}
 connected(){if(this.obs.state.status!=='connected')throw Error('Connect OBS to control audio.');return this.obs.generation;}
 async read(inputName){const [volume,mute]=await Promise.all([this.obs.call('GetInputVolume',{inputName},false),this.obs.call('GetInputMute',{inputName},false)]);return {inputName,volumeDb:Number.isFinite(volume.inputVolumeDb)?volume.inputVolumeDb:-100,muted:mute.inputMuted};}
 async snapshot(){const generation=this.connected();const {inputs}=await this.obs.call('GetInputList');const results=await Promise.allSettled(inputs.map(x=>this.read(x.inputName)));this.obs.assertCurrent(generation);const channels=[];for(const result of results){if(result.status==='fulfilled')channels.push(result.value);else if(result.reason?.code!==604)throw result.reason;}return channels;}
 async list(){return this.obs.exclusive(()=>this.snapshot());}
 async set(input){const change=changeSchema.parse(input);return this.obs.exclusive(async()=>{const generation=this.connected();await this.read(change.inputName);this.obs.assertCurrent(generation);if(change.volumeDb!==undefined)await this.obs.call('SetInputVolume',{inputName:change.inputName,inputVolumeDb:change.volumeDb});else await this.obs.call('SetInputMute',{inputName:change.inputName,inputMuted:change.muted});this.obs.assertCurrent(generation);const actual=await this.read(change.inputName);this.obs.assertCurrent(generation);if(change.volumeDb!==undefined&&Math.abs(actual.volumeDb-change.volumeDb)>.05||change.muted!==undefined&&actual.muted!==change.muted)throw Error('OBS did not confirm the audio change. Refresh and try again.');return actual;});}
}
module.exports={AudioMixer};

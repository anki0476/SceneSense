class MicrophonePCM extends AudioWorkletProcessor {
  constructor(options){
    super();this.rate=options?.processorOptions?.targetRate||24000;
    this.buffer=new Int16Array(Math.round(this.rate/10));this.index=0;this.phase=0;this.held=false;
    this.sum=0;this.count=0;this.meterFrames=0;this.energy=0;
    this.port.onmessage=({data})=>{
      if(data.type==='hold'){
        if(data.value){this.held=true;this.index=0;this.phase=0;this.sum=0;this.count=0;}
        else{this.held=false;this.flush();this.port.postMessage({type:'flushed'});}
      }
    };
  }
  flush(){if(this.index){const chunk=this.buffer.slice(0,this.index);this.port.postMessage(chunk.buffer,[chunk.buffer]);this.index=0;}}
  process(inputs){
    const samples=inputs[0]?.[0];if(!samples)return true;
    const ratio=sampleRate/this.rate;
    for(let i=0;i<samples.length;i++){
      this.energy+=samples[i]*samples[i];this.meterFrames++;
      if(this.meterFrames>=sampleRate/10){this.port.postMessage({type:'level',rms:Math.sqrt(this.energy/this.meterFrames)});this.energy=0;this.meterFrames=0;}
      if(!this.held)continue;
      this.sum+=samples[i];this.count++;this.phase++;
      if(this.phase<ratio)continue;this.phase-=ratio;
      const sample=Math.max(-1,Math.min(1,this.sum/this.count));this.sum=0;this.count=0;
      this.buffer[this.index++]=sample<0?sample*32768:sample*32767;
      if(this.index===this.buffer.length){this.port.postMessage(this.buffer.buffer,[this.buffer.buffer]);this.buffer=new Int16Array(Math.round(this.rate/10));this.index=0;}
    }
    return true;
  }
}
registerProcessor('microphone-pcm',MicrophonePCM);

import {soundEnabled} from './soundPreferences';
// Short local synth cues: no downloaded audio or network requests.
let context:AudioContext|undefined,lastDone=0;
export function voiceSound(kind:'start'|'end'|'done'|'tap'){
 try{
  const group=kind==='tap'?'buttons':'notch';
  if(!soundEnabled(group))return;
  if(kind==='done'){if(Date.now()-lastDone<700)return;lastDone=Date.now();}
  context??=new AudioContext();const audio=context;
  void audio.resume().then(()=>{
   if(!soundEnabled(group))return;
   const at=audio.currentTime;
   const notes=kind==='tap'?[[250,180,0,.045]]:kind==='start'?[[520,780,0,.075]]:kind==='end'?[[420,300,0,.045]]:[[660,660,0,.09],[880,880,.10,.12],[1100,1100,.23,.18]];
   for(const [from,to,delay,duration] of notes){
    const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';
    oscillator.frequency.setValueAtTime(from,at+delay);oscillator.frequency.exponentialRampToValueAtTime(to,at+delay+duration);
    gain.gain.setValueAtTime(.0001,at+delay);gain.gain.exponentialRampToValueAtTime((kind==='done'||kind==='tap'?.30:.44),at+delay+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+delay+duration);
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at+delay);oscillator.stop(at+delay+duration+.01);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
   }
  }).catch(()=>{});
 }catch{/* Sound must never interrupt dictation. */}
}

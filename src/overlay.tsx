import ThoughtLine from './components/ThoughtLine';
import {useButtonSounds} from './useButtonSounds';
import {SenseThinking} from './SenseThinking';
import {useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/inter';
import {VoiceBeam} from 'voice-glow';
import {VoiceIndicator} from './VoiceIndicator';
import {SenseAvatar} from './SenseAvatar';
import './tokens.css';
import './overlay.css';
type State={setup?:{working:boolean;steps:string[];label:string};working?:boolean;reply?:string;replyOwned?:boolean;theme?:'dark'|'light';greeting?:string;latched?:boolean;visible:boolean;orb:'listening'|'connecting'|'working'|'breathing'|'searching';label:string};
declare global{interface Window{voiceOverlay?:{subscribe:(callback:(state:State)=>void)=>()=>void;subscribeLevel:(callback:(level:number)=>void)=>()=>void;openVoice:()=>void;finish:()=>void;ready:()=>void}}}
function Overlay(){
  useButtonSounds();
  const level=useRef(0);
  useEffect(()=>window.voiceOverlay?.subscribeLevel(value=>{level.current=value;}),[]);
  const [state,setState]=useState<State>({visible:false,orb:'breathing',label:''});
  useEffect(()=>{document.documentElement.dataset.theme=state.theme||'dark';},[state.theme]);
  const [reduced,setReduced]=useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const bridge=window.voiceOverlay;const unsubscribe=bridge?.subscribe(setState);bridge?.ready();const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>{unsubscribe?.();media.removeEventListener('change',change);};},[]);
  const reactive=state.visible&&!state.greeting&&['listening','connecting','working','searching'].includes(state.orb);
  return <><VoiceBeam className="notch-beam" type="pill" theme="dark" colorVariant="colorful" level={()=>reactive?level.current:0} active={reactive} paused={!reactive||reduced} motion={state.orb==='working'||state.orb==='searching'?()=>({gather:1,offset:Math.sin(performance.now()/700)*.65,stretch:.2,heldLevel:.35}):null}><div className={`voice-notch ${state.visible?'visible':''}`}>{state.visible&&state.working?<SenseThinking label={state.label}/>:state.orb==='listening'||state.greeting||state.replyOwned?<span className="voice-indicator" role="status" aria-live="polite"><SenseAvatar working={!state.greeting&&!state.replyOwned} theme="dark" paused={reduced||!state.visible}/><span>{state.label}</span></span>:<VoiceIndicator state={state.orb} label={state.label} dark paused={reduced||!state.visible}/>}{state.latched&&<button className="notch-finish" aria-label="Finish listening" onClick={()=>window.voiceOverlay?.finish()}>✓ Done</button>}<span className="notch-dot" aria-hidden="true"/></div></VoiceBeam>{state.visible&&(state.greeting||state.reply)&&<div className="sense-greeting-bubble" role="status">{state.setup?<ThoughtLine working={state.setup.working} steps={state.setup.steps} label={state.setup.label} doneLabel={state.setup.label} showTimer={false} collapseOnSettle={false} collapsible={false} fontSize={14}/>:state.reply||state.greeting}</div>}</>;
}
createRoot(document.getElementById('root')!).render(<Overlay/>);

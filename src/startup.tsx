import {Component,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {LiquidGlassLogo} from './components/liquid-glass-logo';
import type {LiquidGlassLogoHandle} from './components/liquid-glass-logo';
import './startup.css';
declare global{interface Window{startup?:{theme:'dark'|'light';canAnimate:boolean;done:()=>void}}}
const logo='./scenesense-logo.svg';
const background=window.startup?.theme==='light'?'#ffffff':'#000000';
function StaticLogo(){return <img className="startup-static-logo" src={logo} alt="SceneSense"/>;}
class StartupBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<StaticLogo/>:this.props.children;}}
function Startup(){
 const host=useRef<HTMLDivElement>(null),engine=useRef<LiquidGlassLogoHandle>(null);
 const [reduce,setReduce]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const animate=!!window.startup?.canAnimate&&!reduce;
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReduce(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>{
  const done=()=>window.startup?.done();let settle:ReturnType<typeof setTimeout>|undefined,finish:ReturnType<typeof setTimeout>|undefined,started=false;
  const deadline=setTimeout(done,6500);
  function schedule(){if(started)return;const ready=host.current?.querySelector('[data-liquid-glass-ready]');const fallback=!animate||host.current?.querySelector('.liquid-glass-logo-fallback,.startup-static-logo');if(!ready&&!fallback)return;started=true;
   if(fallback){finish=setTimeout(done,650);return;}
   settle=setTimeout(()=>{engine.current?.seek(1.8);engine.current?.pause();finish=setTimeout(done,650);},1800/.85+300);
  }
  const observer=new MutationObserver(schedule);if(host.current)observer.observe(host.current,{subtree:true,attributes:true,childList:true});schedule();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')done();};window.addEventListener('keydown',escape);
  return()=>{clearTimeout(deadline);clearTimeout(settle);clearTimeout(finish);observer.disconnect();window.removeEventListener('keydown',escape);};
 },[animate]);
 return <main ref={host} className="startup-stage" aria-label="SceneSense startup"><StartupBoundary>{animate?<LiquidGlassLogo ref={engine} logo={logo} ending="logo" theme="light" dropStrength={1.35} decay={1.6} speed={.85} background={background} logoColor="original" mark="" text="" loop={false} finalLogoScale={1} maxDpr={1.25} style={{height:480}} aria-label="SceneSense Clear Corner logo"/>:<StaticLogo/>}</StartupBoundary></main>;
}
createRoot(document.getElementById('root')!).render(<Startup/>);

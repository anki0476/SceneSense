import {Component,lazy,Suspense,useState,type ReactNode} from 'react';
import type {AnimationName} from './backgroundPreference';
const Aero=lazy(()=>import('./components/backgrounds/AeroShards'));
const Waves=lazy(()=>import('./components/backgrounds/GradientWaves'));
const Rings=lazy(()=>import('./components/backgrounds/MagicRings'));
const ASCII=lazy(()=>import('./components/backgrounds/GradientASCII'));
const Topography=lazy(()=>import('./components/backgrounds/Topography'));
function reportFailure(){window.dispatchEvent(new CustomEvent('background-render-error',{detail:'This animation could not start on this device. Choose another background.'}));}
class BackgroundBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}componentDidCatch(){reportFailure();}render(){return this.state.failed?null:this.props.children;}}
export function AnimatedBackground({name,theme}:{name:AnimationName;theme:'dark'|'light'}){
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 return <BackgroundBoundary><Suspense fallback={null}>
  {name==='topography'&&<Topography color="#4f7cff" lineCount={22} lineWidth={1.2} elevation={1} foreground={.2} tilt={32} speed={.25} direction="forward" glow={.6} depthOfField={.4} fog={.35} mouseInteraction={false} mouseStrength={0} parallax={0} clickEffect="pulse" lightMode={theme==='light'} dpr={1.25}/>}
  {name==='aero'&&<Aero shardColor="#896ABD" accentColor="#A855F7" placement="full" material="glass" markers="plus" count={1300} depthOfField={.75} vignette={.3} mouseInteraction={false} mouseStrength={0} parallax={0} pulseOnClick holdToGather={false} lightMode={theme==='light'} dpr={1.25} onError={(error:Error)=>{console.warn('AeroShards:',error.message.slice(0,240));setFailed(true);reportFailure();}}/>}
  {name==='waves'&&<Waves horizonColor="#5227FF" waveColor="#FF9FFC" crestColor="#FFFFFF" speed={.4} amplitude={2.5} relief={1} lightAngle={120} mouseInteraction={false} mouseStrength={0} parallaxStrength={0} swellOnClick lightMode={theme==='light'} dpr={1.25}/>}
  {name==='rings'&&<Rings color="#A855F7" colorTwo="#6366F1" motion="pulse" ringCount={6} speed={1} lineThickness={2} glow={1} followMouse={false} mouseInfluence={0} hoverScale={1} hoverIntensity={0} parallax={0} clickBurst theme={theme} maxDevicePixelRatio={1.25}/>}
  {name==='ascii'&&<ASCII colors={['#1e3fd8','#f6f8ff','#a5d8ff','#38bdf8']} shape="horizon" characters=" =+xX0S8#@" cellSize={18} density={.8} mouseInteraction={false} clickEffect="wave" dpr={1.25}/>}
 </Suspense></BackgroundBoundary>;
}


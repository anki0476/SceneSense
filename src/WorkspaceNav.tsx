import {useLayoutEffect,useRef,useState,useId,type CSSProperties} from 'react';
import {Icon} from './Icons';
const tabs=[['studio','studio','Studio'],['voice','mic','Voice'],['connections','plug','Connections'],['scene','chat','Sense']] as const;
export function WorkspaceNav({view,onNavigate}:{view:string;onNavigate:(view:'studio'|'voice'|'connections'|'scene')=>void}){
 const nav=useRef<HTMLElement>(null),filterId='nav-lens-'+useId().replace(/:/g,'');
 const [box,setBox]=useState({left:0,top:0,width:0,height:0});
 useLayoutEffect(()=>{const measure=()=>{const host=nav.current,target=host?.querySelector<HTMLElement>('[aria-current=page]');if(!host||!target){setBox(b=>({...b,width:0}));return;}setBox({left:target.offsetLeft,top:target.offsetTop,width:target.offsetWidth,height:target.offsetHeight});};measure();const observer=new ResizeObserver(measure);if(nav.current)observer.observe(nav.current);document.fonts?.ready.then(measure);return()=>observer.disconnect();},[view]);
 const style={'--lens-left':`${box.left}px`,'--lens-top':`${box.top}px`,'--lens-width':`${box.width}px`,'--lens-height':`${box.height}px`} as CSSProperties;
 return <nav ref={nav} className="main-nav sliding-glass-nav" aria-label="Workspace" style={style}>
  {tabs.map(([id,icon,label])=><button key={id} data-tour-page={id} aria-current={view===id?'page':undefined} onClick={()=>onNavigate(id)}><>{id==='scene'?<img className="nav-sense-icon" src="./sense-mascot.png" width="22" height="22" alt="" aria-hidden="true"/>:<Icon name={icon} size={18}/>}</><span>{label}</span></button>)}
  <svg className="nav-lens-filter" width="0" height="0" aria-hidden="true"><defs><filter id={filterId} x="-10%" y="-15%" width="120%" height="130%" colorInterpolationFilters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.04" numOctaves="1" seed="8" result="lens"/><feDisplacementMap in="SourceGraphic" in2="lens" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>
  <span className="nav-glass-lens" aria-hidden="true" hidden={!box.width}><span className="nav-refracted-strip" style={{filter:`url(#${filterId})`}}>{tabs.map(([id,icon,label])=><span key={id} className="nav-refracted-tab"><>{id==='scene'?<img className="nav-sense-icon" src="./sense-mascot.png" width="22" height="22" alt="" aria-hidden="true"/>:<Icon name={icon} size={18}/>}</><span>{label}</span></span>)}</span></span>
 </nav>;
}

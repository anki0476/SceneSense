import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {SenseAvatar} from './SenseAvatar';
import {SensePointer} from './SensePointer';
type Rect={x:number;y:number;width:number;height:number};
type GuideState={status:string;canUndo?:boolean;recommendation?:{position:string;placement?:{scale:number;label?:string};obstruction:string;expiresAt?:number}|null;evidence?:{canvasRects?:{current:Rect;candidates:Record<string,Rect>}}|null};
export function SenseGuide({state,disabled,applyDisabled=false,onAction}:{state:GuideState;disabled:boolean;applyDisabled?:boolean;onAction:(channel:string)=>Promise<void>}){
  const [host,setHost]=useState<Element|null>(null),[phase,setPhase]=useState('hidden'),[dismissed,setDismissed]=useState(''),[text,setText]=useState('');
  const rects=state.evidence?.canvasRects,rec=state.recommendation;
  const key=rec&&rects?rec.position+JSON.stringify(rects.candidates[rec.position])+JSON.stringify(rects.current):'';
  useEffect(()=>{const listener=(event:Event)=>{const command=(event as CustomEvent).detail;if(command==='dismiss_sense'){setDismissed(key);setPhase('hidden');}else if(command==='preview_suggestion'&&key){setDismissed('');setPhase('preview');}};window.addEventListener('sense-guide-command',listener);return()=>window.removeEventListener('sense-guide-command',listener);},[key]);
  useEffect(()=>{setHost(document.querySelector('.stage .preview'));},[]);
  useEffect(()=>{
    if(!key)return;
    setDismissed('');
    setPhase('arriving');const fly=setTimeout(()=>setPhase(current=>['preview','result'].includes(current)?current:'pointing'),40),explain=setTimeout(()=>setPhase(current=>['preview','result'].includes(current)?current:'explain'),700);
    return()=>{clearTimeout(fly);clearTimeout(explain);};
  },[key]);
  useEffect(()=>{if(!rec?.expiresAt)return;const timer=setTimeout(()=>setPhase('hidden'),Math.max(0,rec.expiresAt-Date.now()));return()=>clearTimeout(timer);},[rec?.expiresAt]);
  useEffect(()=>{if(state.status==='applied'||state.status==='undone'){setPhase('result');const timer=setTimeout(()=>setPhase('hidden'),6000);return()=>clearTimeout(timer);}},[state.status]);
  const message=state.status==='applied'?'Placement applied. You can undo this move.':state.status==='undone'?'Your previous placement is restored.':`Your webcam may cover ${rec?.obstruction==='hud'?'game HUD details':rec?.obstruction==='menu'?'menu controls':rec?.obstruction==='text'?'important text':'the action'}. Try ${rec?.placement?.label||rec?.position.replace(/-(75|60)$/,'').replaceAll('-',' ')}${rec?.placement&&rec.placement.scale<1?' at '+Math.round(rec.placement.scale*100)+'% size':''}.`;
  useEffect(()=>{
    if(phase==='hidden'||phase==='arriving'||phase==='pointing')return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){setText(message);return;}
    setText('');let count=0;const timer=setInterval(()=>{setText(message.slice(0,++count));if(count>=message.length)clearInterval(timer);},14);return()=>clearInterval(timer);
  },[message,phase]);
  if(!host||!rects||phase==='hidden'||(key&&dismissed===key)||(!rec&&state.status!=='applied'&&state.status!=='undone'))return null;
  const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
  const x=clamp(rects.current.x-.045,.06,.86),y=clamp(rects.current.y+rects.current.height+.035,.08,.48);
  const box=(r:Rect)=>({left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'});
  const proposed=rec&&rects.candidates[rec.position];
  const pointing=!!rec&&phase!=='arriving'&&phase!=='result';
  return createPortal(<SensePointer className={`sense-guide sense-${phase}`} id="sense-placement"
    active={pointing} target={phase==='preview'&&proposed?'.sense-proposed':'.sense-focus'}
    from={phase==='preview'?'.sense-focus':'.sense-avatar-anchor'}>
    {rec&&<div className="sense-focus" style={box(rects.current)}/>}
    {phase==='preview'&&proposed&&<div className="sense-proposed" style={box(proposed)}><span>Proposed · {Math.round((rec?.placement?.scale||1)*100)}% size</span></div>}
    <div className="sense-avatar-anchor" style={{left:(phase==='arriving'?8:x*100)+'%',top:(phase==='arriving'?82:y*100)+'%'}}><SenseAvatar/></div>
    {['explain','preview','result'].includes(phase)&&<div className="sense-bubble" style={{left:clamp(x*100-26,3,54)+'%',top:clamp(y*100+11,18,50)+'%'}}><div className="sense-bubble-top"><strong>Sense</strong><button className="quiet" aria-label="Dismiss Sense" onClick={()=>{setDismissed(key);setPhase('hidden');}}>×</button></div><p><span aria-hidden="true">{text}</span><span className="sense-sr" role="status">{message}</span></p><div className="button-row">{rec?<><button className="primary" disabled={disabled||(phase==='preview'&&applyDisabled)} onClick={()=>phase==='preview'?void onAction('layout:apply'):setPhase('preview')}>{phase==='preview'?(applyDisabled?'Checking frame…':'Apply move'):'Preview move'}</button><button disabled={disabled} onClick={()=>{setDismissed(key);setPhase('hidden');void onAction('layout:keep');}}>Keep here</button></>:state.canUndo?<button disabled={disabled} onClick={()=>void onAction('layout:undo')}>Undo move</button>:null}</div></div>}
  </SensePointer>,host);
}

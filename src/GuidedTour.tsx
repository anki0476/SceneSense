import type {ShowcasePointerHandle} from './components/showcase-pointer';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {SensePointer} from './SensePointer';
import {SenseAvatar} from './SenseAvatar';
import {useTheme} from './Theme';
import './tour.css';

type View='studio'|'connections'|'voice'|'activity'|'settings'|'scene';
const storageKey='scenesense-tour-v1';
const steps:{view:View;target:string;title:string;text:string}[]=[
  {view:'studio',target:'.stage-toolbar',title:'Your audience’s view',text:'This preview follows OBS. Connect your studio to see your game, webcam and overlays. Smooth video is optional.'},
  {view:'studio',target:'.webcam-controls',title:'Make room for the game',text:'Move or resize your webcam here. Confirm your sources first; Restore returns to the layout saved at confirmation.'},
  {view:'connections',target:'.connection-form .form-row',title:'Connect OBS once',text:'In OBS, enable Tools → WebSocket Server Settings. Enter its port and password here. You can test everything without going live.'},
  {view:'connections',target:'.preset-controls',title:'Skip the setup next time',text:'Give your OBS connection a name and save it as a preset. Passwords are encrypted on this device. Reconnect at startup is optional.'},
  {view:'connections',target:'.sources',title:'Tell Sense what to move',text:'Load sources from your active OBS scene, choose your webcam and game, then confirm. Confirmation saves your original webcam layout for this session.'},
  {view:'voice',target:'#voice-control .section-title',title:'Just tell Sense',text:'Hold Ctrl + Shift + Z to speak. For hands-free listening, hold Ctrl + Shift and tap Z twice; repeat or choose ✓ Done to finish. Saying “Sense” is optional.'},
  {view:'voice',target:'.voice-command-help summary',title:'Find your words',text:'The command guide lists what Sense can do. Search for webcam, watching or microphone. Conversational Sense on the Sense page also offers chat and current gaming news; these use your API key.'},
  {view:'scene',target:'.layout-assist .button-row',title:'A second pair of eyes',text:'Check a frame once, or Start watching for repeated checks. Sense looks for important game content behind the webcam, prioritizes corners and offers a placement preview.'},
  {view:'scene',target:'.layout-assist .preset-toggle',title:'You choose the autonomy',text:'Automatic movement needs two matching eligible corner checks. Allow shrinking to include smaller corner placements; interior placements still need approval. Your manual and voice controls take priority.'},
  {view:'connections',target:'.twitch-connection',title:'Let chat lend a hand',text:'Twitch is optional. Connect your creator account to receive !blocked reports from viewers. Reports are signals for you; they cannot control OBS.'},
  {view:'settings',target:'.settings-sidebar nav button:last-child',title:'See what changed',text:'Activity lives in Settings. Open it here to view the changes recorded in your current session.'},
  {view:'studio',target:'.app-settings button',title:'Make yourself comfortable',text:'Open Settings to switch between light and dark mode or view Activity. SceneSense remembers your choice, including Sense’s bubbles.'},
  {view:'studio',target:'.restart-update',title:'Stay fresh',text:'Restart for updates rebuilds and relaunches this local app. The update bubble tells you whether anything changed and lists what’s new. Replay this tour anytime from Settings.'},
];

export function GuidedTour({children,view,onNavigate}:{children:ReactNode;view:View;onNavigate:(view:View)=>void}){
  const {theme}=useTheme();
  const [welcome,setWelcome]=useState(()=>{try{return !localStorage.getItem(storageKey);}catch{return true;}});
  const [index,setIndex]=useState<number|null>(null);
  const [located,setLocated]=useState(false);
  const [side,setSide]=useState('right');
  const dialog=useRef<HTMLDialogElement>(null);
  const panel=useRef<HTMLElement>(null);

  const origin=useRef<View>(view);
  const transitionId=useRef(0),pageChanged=useRef(false),pointer=useRef<ShowcasePointerHandle>(null);
  const [transitioning,setTransitioning]=useState(false);
  const step=index===null?null:steps[index];
  const remember=()=>{try{localStorage.setItem(storageKey,'seen');}catch{}};
  const dismissWelcome=()=>{remember();setWelcome(false);};
  const show=async(next:number)=>{
    const id=++transitionId.current;setTransitioning(true);
    const crossing=steps[next].view!==view;pageChanged.current=crossing;
    if(crossing&&index!==null){
      const selector=steps[next].view==='settings'?'.app-settings button':`.main-nav button[data-tour-page="${steps[next].view}"]`;
      const button=document.querySelector<HTMLElement>(selector);
      if(button){
        button.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
        await new Promise<void>(resolve=>{let previous=scrollY,stable=0;const began=performance.now();const settle=()=>{stable=Math.abs(scrollY-previous)<.5?stable+1:0;previous=scrollY;if(id!==transitionId.current||(performance.now()-began>120&&stable>3)||performance.now()-began>1400)resolve();else requestAnimationFrame(settle);};requestAnimationFrame(settle);});
        if(id!==transitionId.current)return;
        await pointer.current?.run('sense-tour',[{action:'hover',target:selector,duration:600},{action:'wait',duration:180},{action:'click',target:selector,duration:120},{action:'wait',duration:180}]);
      }
    }
    if(id!==transitionId.current){void pointer.current?.cursor('sense-tour').clear();return;}
    setLocated(false);setIndex(next);if(crossing)onNavigate(steps[next].view);
  };
  const start=()=>{origin.current=view;dismissWelcome();show(0);};
  const startRef=useRef(start);startRef.current=start;
  useEffect(()=>{const replay=()=>startRef.current();window.addEventListener('sense-tour-start',replay);return()=>window.removeEventListener('sense-tour-start',replay);},[]);
  const finish=()=>{++transitionId.current;setTransitioning(false);remember();setIndex(null);setLocated(false);onNavigate(origin.current);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-start-tour]')?.focus());};
  useEffect(()=>()=>{++transitionId.current;},[]);
  useEffect(()=>{
    if(welcome&&!dialog.current?.open)dialog.current?.showModal();
    if(!welcome&&dialog.current?.open)dialog.current.close();
  },[welcome]);
  useEffect(()=>{
    if(!step)return;
    setLocated(false);
    const target=document.querySelector<HTMLElement>(step.target);
    if(!target||target.getClientRects().length===0)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const crossing=pageChanged.current;pageChanged.current=false;
    target.scrollIntoView({block:'center',behavior:reduced||crossing?'instant':'smooth'});
    
    const rect=target.getBoundingClientRect();
    setSide(rect.left+rect.width/2>innerWidth/2?'left':'right');
    let frame=0,lastY=window.scrollY,stable=0;const began=performance.now();
    const settle=()=>{const now=performance.now();stable=Math.abs(window.scrollY-lastY)<.5?stable+1:0;lastY=window.scrollY;if(reduced||(now-began>(crossing?250:120)&&stable>=3)||now-began>1400){setLocated(true);setTransitioning(false);panel.current?.focus({preventScroll:true});}else frame=requestAnimationFrame(settle);};
    frame=requestAnimationFrame(settle);
    return ()=>cancelAnimationFrame(frame);
  },[step,view]);
  useEffect(()=>{
    if(index===null)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();finish();}};
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[index]);
  const target=useMemo(()=>step?{target:step.target,x:0.3,y:0.5}:undefined,[step]);
  const from=useMemo(()=>step?{target:step.target,x:0.1,y:0.5}:undefined,[step]);
  return <SensePointer controllerRef={pointer} className="sense-tour-surface" id="sense-tour" target={target} from={from} active={index!==null&&located}>
    {children}

    <dialog ref={dialog} className="tour-welcome" onCancel={event=>{event.preventDefault();dismissWelcome();}} aria-labelledby="tour-welcome-title">
      <SenseAvatar theme={theme}/><p className="tour-eyebrow">MEET YOUR STREAM COMPANION</p>
      <h2 id="tour-welcome-title">Hey, I’m Sense.</h2><p>Want a quick look around? I’ll point out the essentials. You set the pace.</p>
      <div className="button-row"><button className="primary" onClick={start}>Show me around</button><button onClick={dismissWelcome}>Maybe later</button></div>
      <p className="tour-small">The tour won’t run commands. Replay it from Settings.</p>
    </dialog>
    {step&&<aside ref={panel} tabIndex={-1} role="dialog" aria-labelledby="tour-step-title" aria-describedby="tour-step-text" className={`tour-bubble tour-bubble-${side}`}>
      <div className="tour-bubble-heading"><SenseAvatar theme={theme}/><strong>Sense</strong><span>{index!+1} / {steps.length}</span><button className="quiet" onClick={finish} aria-label="Skip tour">Skip</button></div>
      <h2 id="tour-step-title">{step.title}</h2><p id="tour-step-text">{step.text}</p>
      {!located&&<button onClick={()=>onNavigate(step.view)}>Show this section</button>}
      <div className="tour-progress" aria-hidden="true"><span style={{width:`${((index!+1)/steps.length)*100}%`}}/></div>
      <div className="tour-actions"><button disabled={transitioning||index===0} onClick={()=>show(index!-1)}>Back</button><button className="primary" disabled={transitioning} onClick={()=>index===steps.length-1?finish():show(index!+1)}>{index===steps.length-1?'Finish tour':'Next'}</button></div>
    </aside>}
  </SensePointer>;
}



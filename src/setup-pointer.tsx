import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ShowcasePointer,type CursorConfig,type CursorStep} from './components/showcase-pointer';
type Target={id:number;x:number;y:number;width:number;height:number;name:string;press?:boolean;from?:{x:number;y:number}};
declare global{interface Window{setupPointer?:{listen:(callback:(target:Target)=>void)=>()=>void;done:(id:number)=>void}}}
function SetupPointer(){const [target,setTarget]=useState<Target|null>(null);
 useEffect(()=>window.setupPointer?.listen(setTarget),[]);
 const cursors=useMemo<CursorConfig[]>(()=>{if(!target)return [];const script:CursorStep[]=[{action:'hover',target:'#setup-action-target',duration:450},{action:'click',target:'#setup-action-target'},{action:'wait',duration:90},{action:'call',run:()=>{window.setupPointer?.done(target.id);}}];return [{id:'desktop-sense',name:'Sense',color:'#ad80ff',start:target.from||{x:Math.max(20,target.x-120),y:Math.max(20,target.y+60)},script}];},[target]);
 return <ShowcasePointer style={{position:'fixed',inset:0,pointerEvents:'none'}} cursors={cursors} loop={false} idleDrift={0} trail={0} onCursorPress={()=>{}} onCycle={()=>{}}>{target&&<div id="setup-action-target" aria-hidden="true" style={{position:'absolute',left:target.x,top:target.y,width:target.width,height:target.height}}/>}</ShowcasePointer>;
}
const style=document.createElement('style');style.textContent='html,body,#root{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;pointer-events:none}';document.head.append(style);
createRoot(document.getElementById('root')!).render(<SetupPointer/>);

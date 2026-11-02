import {useEffect,useState,useRef} from 'react';
export type UpdateInfo={status:string;message:string;changes?:string[]};
export function UpdateBubble({info,onDismiss}:{info:UpdateInfo;onDismiss:()=>void}){
 const lines=[info.message,...(info.status==='updated'?info.changes||[]:[])];
 const timerRef=useRef<ReturnType<typeof setInterval>|undefined>(undefined);
 const text=lines.join('\n');const [count,setCount]=useState(0);
 useEffect(()=>{
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let timer:ReturnType<typeof setInterval>|undefined;
  const start=()=>{clearInterval(timer);if(motion.matches){setCount(text.length);return;}setCount(0);let index=0;timer=setInterval(()=>{index=Math.min(text.length,index+1);setCount(current=>Math.min(text.length,current+1));if(index===text.length)clearInterval(timer);},18);timerRef.current=timer;};
  start();motion.addEventListener('change',start);return()=>{clearInterval(timer);motion.removeEventListener('change',start);};
 },[text]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onDismiss();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[onDismiss]);
 let offset=info.message.length+1;
 return <aside className="update-comic" id="update-status-bubble" aria-label="Restart update status">
  <div className="comic-actions"><strong>{info.status==='updated'?'Update complete!':info.status==='current'?'All caught up!':'Update status'}</strong><button className="quiet" aria-label="Dismiss update status" onClick={onDismiss}>Close</button></div>
  <div className="visually-hidden" role="status">{info.message}{info.status==='updated'&&!!info.changes?.length&&<> What's new:<ul>{info.changes.map((item,i)=><li key={i}>{item}</li>)}</ul></>}</div>
  <div className="comic-content" aria-hidden="true"><p>{info.message.slice(0,count)}{count<info.message.length&&<span className="comic-caret"/>}</p>
   {info.status==='updated'&&!!info.changes?.length&&count>info.message.length&&<><h2>What's new</h2><ul>{info.changes.map((item,i)=>{const start=offset;offset+=item.length+1;return count>=start?<li key={i}>{item.slice(0,Math.max(0,count-start))}{count<offset-1&&<span className="comic-caret"/>}</li>:null;})}</ul></>}
  </div>
  {count<text.length&&<button className="text-button comic-skip" onClick={()=>{clearInterval(timerRef.current);setCount(text.length);}}>Show all</button>}
 </aside>;
}



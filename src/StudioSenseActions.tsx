import {useEffect,useState} from 'react';
import {TactileButton} from './TactileButton';
import {Icon} from './Icons';
export function StudioSenseActions({call,ready,confirmed,onOpen,onCheck}:{call:(channel:string,input?:unknown)=>Promise<any>;ready:boolean;confirmed:boolean;onOpen:()=>void;onCheck:()=>void}){
 const [layout,setLayout]=useState({watching:false,mode:'assist',status:'off'}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void call('state').then(s=>{if(alive&&s.layout)setLayout(s.layout);}).catch(()=>{});const off=window.scenesense?.subscribe(e=>{if(e.kind==='layout')setLayout(e);});return()=>{alive=false;off?.();};},[]);
 async function watch(){setBusy(true);setError('');try{const current=(await call('state')).layout;const state=await call(current.watching?'layout:stop':'layout:start',current.watching?undefined:current.mode);if(state)setLayout(state);}catch(e){setError(e instanceof Error?e.message:'Could not change watching.');}finally{setBusy(false);}}
 return <><div className="button-row scene-quick-actions"><TactileButton onClick={onOpen}>Open Sense<Icon name="arrow" size={16}/></TactileButton><TactileButton disabled={!confirmed||busy||layout.status==='checking'} onClick={onCheck}>{layout.status==='checking'?'Inspecting game…':'Check current frame'}</TactileButton><TactileButton disabled={busy||(!layout.watching&&(!ready||!confirmed||layout.status==='checking'))} onClick={()=>void watch()}>{busy?'Waiting for Sense…':layout.watching?'Stop watching':'Start watching'}</TactileButton></div>{error&&<p role="alert" className="inline-error">{error}</p>}</>;
}

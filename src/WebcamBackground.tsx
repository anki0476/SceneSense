import {useEffect,useRef,useState} from 'react';
import {TactileButton} from './TactileButton';
import './webcam-background.css';
type FilterState={status:string;enabled:boolean;source?:string;message?:string;engine?:string;processingMs?:number;frameAgeMs?:number};
export function WebcamBackground({context,source,invoke,onChanged}:{context:string;source?:string;invoke:(channel:string,payload?:unknown)=>Promise<any>;onChanged:()=>void}){
 const [state,setState]=useState<FilterState>({status:'unavailable',enabled:false}),[busy,setBusy]=useState(false),[operation,setOperation]=useState('Checking OBS…'),[error,setError]=useState('');
 const callbacks=useRef({invoke,onChanged});callbacks.current={invoke,onChanged};const epoch=useRef(0);
 async function check(){const id=epoch.current;setBusy(true);setOperation('Checking OBS…');setError('');try{const result=await callbacks.current.invoke('obs:background:status');if(id===epoch.current)setState(result);}catch(e){if(id===epoch.current)setError(e instanceof Error?e.message:'Could not check the webcam filter.');}finally{if(id===epoch.current)setBusy(false);}}
 useEffect(()=>{epoch.current++;setState({status:'unavailable',enabled:false});setError('');setBusy(false);if(context&&window.scenesense)void check();const unsubscribe=window.scenesense?.subscribe(event=>{if(context&&event.kind==='webcam-background'&&event.source===source)setState(event);});return()=>{epoch.current++;unsubscribe?.();};},[context,source]);
 async function change(enabled:boolean){const id=epoch.current;setBusy(true);setOperation(enabled?'Removing background…':'Restoring background…');setError('');try{const result=await callbacks.current.invoke('obs:background:set',enabled);if(id===epoch.current){setState(result);callbacks.current.onChanged();}}catch(e){if(id===epoch.current)setError(e instanceof Error?e.message:'Could not change the webcam filter.');}finally{if(id===epoch.current)setBusy(false);}}
 const available=state.status==='ready'||state.status==='conflict';
 return <div className="webcam-background"><div className="background-heading"><h3>Webcam background</h3><span className="small-label">{state.engine==='native'?'Native GPU · Local':'Local in OBS'}</span></div>
  <div className="background-modes" role="group" aria-label="Webcam background">
   <button disabled={!available||busy} aria-pressed={available&&!state.enabled} onClick={()=>void change(false)}>Original</button>
   <button disabled={state.status!=='ready'||busy} aria-pressed={available&&state.enabled} onClick={()=>void change(true)}>Remove background</button>
  </div>
  <p className="background-status" role="status" aria-live="polite">{busy?operation:error||(!context?'Confirm webcam and game sources first.':!window.scenesense?'Open the desktop app to use background removal.':state.message||(available?state.enabled?'Filter enabled. Check your cutout in the program preview.':'Original background.':'Check the OBS plugin to get started.'))}</p>
  {context&&<button className="text-button" disabled={busy||!window.scenesense} onClick={()=>void check()}>Check cutout</button>}
  {state.status==='missing'&&<TactileButton disabled={busy} onClick={()=>void callbacks.current.invoke('obs:background:setup').catch(e=>setError(e.message))}>Plugin setup ↗</TactileButton>}
  <details><summary>About background removal</summary><p>Changes OBS output. Compare Original and Remove background in the program preview.</p><p>Applies to every scene using this webcam source. Position and size stay unchanged. Hair and fast movement may need better lighting.</p><p>{state.engine==='native'?'Processed directly inside OBS with the local SceneSense GPU filter.':'Powered by the separately installed OBS Background Removal plugin.'} No webcam upload is needed for removal.</p>{state.engine==='native'&&state.processingMs!==undefined&&<p>Last processing: {Math.round(state.processingMs)} ms. Filter frame age: {Math.round(state.frameAgeMs||0)} ms. This excludes camera exposure and final display delay.</p>}</details>
 </div>;
}

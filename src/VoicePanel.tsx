import {voiceSound} from './voiceSounds';
import {createPortal} from 'react-dom';
import {SenseThinking} from './SenseThinking';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import {VoiceIndicator} from './VoiceIndicator';
import {NewsReply} from './NewsReply';
import type {NewsSource} from './NewsReply';
import {VoiceCommandGuide} from './VoiceCommandGuide';
import {VoiceBeam} from 'voice-glow';
type VoiceState={status:string;configured:boolean;provider?:string;sampleRate?:number;transcript:string;action:string;error:string;shortcut:string;globalShortcutReady?:boolean;connectionMs?:number;firstTranscriptMs?:number;decisionMs?:number;decisionStatus?:string;audioMs?:number};
type SenseReply={status:string;text:string;news?:boolean;sources?:NewsSource[];checkedAt?:string};
type Call=(channel:string,input?:unknown)=>Promise<any>;
type Capture={stream:MediaStream;context:AudioContext;node:AudioWorkletNode};
type Turn={start:Promise<any>;uploads:Set<Promise<any>>;ending:boolean;source:string;flushed?:()=>void};
export function VoicePanel({call,ready,onFeedback,onSetup,controlsRef,conversationHost}:{conversationHost?:HTMLElement|null;call:Call;ready:boolean;onFeedback?:(message:string)=>void;onSetup?:()=>void;controlsRef?:{current:((action:string,text?:string)=>Promise<void>)|null}}) {
  const [state,setState]=useState<VoiceState>({status:'idle',configured:false,transcript:'',action:'',error:'',shortcut:'Hold Ctrl+Shift+Z'});
  const [key,setKey]=useState(''),[sarvamKey,setSarvamKey]=useState(''),[provider,setProvider]=useState('openai'),[language,setLanguage]=useState('en-IN');
  const [error,setError]=useState(''),[micReady,setMicReady]=useState(false),[preparing,setPreparing]=useState(false),[level,setLevel]=useState(0);
  const [autoPrepare,setAutoPrepare]=useState(()=>{try{return localStorage.getItem('scenesense-auto-microphone')!=='false';}catch{return true;}});
  const [holding,setHolding]=useState(false),[ending,setEnding]=useState(false);
  const [lastTrigger,setLastTrigger]=useState('');
  const [conversational,setConversational]=useState(()=>{try{return localStorage.getItem('scenesense-conversational')!=='false';}catch{return true;}});
  const [senseReply,setSenseReply]=useState<SenseReply>({status:'idle',text:''});
  const [newsResult,setNewsResult]=useState<SenseReply|null>(null);
  useEffect(()=>{void call('sense:conversation',conversational).catch(()=>{});try{localStorage.setItem('scenesense-conversational',String(conversational));}catch{}return()=>{};},[conversational]);
  const [commands,setCommands]=useState<Record<string,string>>({});
  const feedbackRef=useRef(onFeedback);feedbackRef.current=onFeedback;
  function blocked(message:string){setError(message);feedbackRef.current?.(message);}
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[deviceId,setDeviceId]=useState(()=>{try{return localStorage.getItem('scenesense-voice-microphone')||'';}catch{return '';}}),[micName,setMicName]=useState('');
  const preparingRef=useRef(false);
  const completionSound=useRef<ReturnType<typeof setTimeout>|null>(null);const pendingChime=useRef(false);
  const capture=useRef<Capture|null>(null),turn=useRef<Turn|null>(null),armRevision=useRef(0);
  const stateRef=useRef(state),readyRef=useRef(ready);stateRef.current=state;readyRef.current=ready;
  const pressRef=useRef((_source:string)=>{}),releaseRef=useRef((_source:string)=>{});
  function stopTurn(){
    const current=turn.current;turn.current=null;setHolding(false);setEnding(false);
    capture.current?.node.port.postMessage({type:'hold',value:false});current?.flushed?.();
  }
  function disarm(){
    armRevision.current++;stopTurn();const current=capture.current;capture.current=null;
    if(current){current.node.port.onmessage=null;current.node.disconnect();current.stream.getTracks().forEach(x=>x.stop());void current.context.close();}
    setMicReady(false);setLevel(0);
  }
  async function arm(selected=deviceId){
    disarm();preparingRef.current=true;setPreparing(true);setError('');const revision=armRevision.current;
    let stream:MediaStream|undefined,context:AudioContext|undefined;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{...(selected?{deviceId:{exact:selected}}:{}),channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(revision!==armRevision.current){stream.getTracks().forEach(x=>x.stop());return;}
      context=new AudioContext({sampleRate:stateRef.current.sampleRate||24000});await Promise.race([context.resume(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Click Prepare microphone to enable audio on this computer.')),2000))]);
      await context.audioWorklet.addModule(new URL('pcm-worklet.js',document.baseURI).href);
      const node=new AudioWorkletNode(context,'microphone-pcm',{processorOptions:{targetRate:stateRef.current.sampleRate||24000}});
      context.createMediaStreamSource(stream).connect(node);const mute=context.createGain();mute.gain.value=0;node.connect(mute).connect(context.destination);
      if(revision!==armRevision.current){stream.getTracks().forEach(x=>x.stop());await context.close();return;}
      capture.current={stream,context,node};
      node.port.onmessage=event=>{
        if(revision!==armRevision.current)return;
        if(event.data?.type==='level'){const meter=Math.min(1,Math.max(0,event.data.rms*8));setLevel(meter);if(turn.current&&!turn.current.ending)void call('voice:meter',meter).catch(()=>{});return;}
        const current=turn.current;if(!current)return;
        if(event.data?.type==='flushed'){current.flushed?.();return;}
        const upload=call('voice:audio',new Uint8Array(event.data));current.uploads.add(upload);
        void upload.catch(e=>{setError(e.message);stopTurn();void call('voice:cancel').catch(()=>{});}).finally(()=>current.uploads.delete(upload));
      };
      stream.getAudioTracks()[0]?.addEventListener('ended',()=>{if(capture.current?.stream===stream){disarm();setError('Microphone disconnected. Choose an input and prepare it again.');void call('voice:cancel').catch(()=>{});}});
      setMicName(stream.getAudioTracks()[0]?.label||'Default microphone');
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='audioinput'));
      if(revision===armRevision.current){setMicReady(true);try{localStorage.setItem('scenesense-voice-microphone',selected);}catch{}}
    }catch(e){stream?.getTracks().forEach(x=>x.stop());if(context&&context.state!=='closed')await context.close();if(revision===armRevision.current){capture.current=null;setError(e instanceof Error?e.message:'Microphone unavailable.');}}
    finally{if(revision===armRevision.current){preparingRef.current=false;setPreparing(false);}}
  }
  useEffect(()=>{if(!state.configured||!autoPrepare)return;const timer=setTimeout(()=>{if(!capture.current&&!turn.current&&!preparingRef.current)void arm();},250);return()=>clearTimeout(timer);},[state.configured,state.sampleRate,autoPrepare]);
  const latched=useRef(false),lastTap=useRef(0),releaseTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function latch(value:boolean){latched.current=value;void call('voice:latch',value).catch(()=>{});}
  function gestureDown(){const now=Date.now(),double=now-lastTap.current<350;lastTap.current=now;if(releaseTimer.current)clearTimeout(releaseTimer.current);if(double){lastTap.current=0;if(latched.current){latch(false);releaseRef.current('keyboard');}else{latch(true);pressRef.current('keyboard');}return;}if(!latched.current)pressRef.current('keyboard');}
  function gestureUp(){if(!latched.current)releaseTimer.current=setTimeout(()=>releaseRef.current('keyboard'),350);}
  function press(source:string){
    setLastTrigger(source==='keyboard'?'Keyboard shortcut received.':'Speak button pressed.');
    if(turn.current)return;
    if(!stateRef.current.configured){blocked('Voice needs an OpenAI API key. Check your .env file or add the key below.');return;}

    if(['connecting','listening','finishing'].includes(stateRef.current.status)){blocked('The previous voice command is still finishing. Please wait.');return;}
    const current=capture.current;
    if(!current){blocked('Click Prepare microphone once, then hold Ctrl+Shift+Z to speak.');return;}
    if(current.context.state!=='running'){blocked('Microphone paused. Click Prepare microphone to resume.');return;}
    if(completionSound.current)clearTimeout(completionSound.current);pendingChime.current=false;voiceSound('start');
    setError('');setHolding(true);setEnding(false);
    // Start the request and local capture together. The main process buffers PCM
    // during the handshake, preserving the first words instead of dropping them.
    const pending=call('voice:start');
    const next:Turn={start:pending,uploads:new Set(),ending:false,source};turn.current=next;
    current.node.port.postMessage({type:'hold',value:true});
    void pending.catch(e=>{if(turn.current===next){setError(e.message);stopTurn();}});
  }
  async function release(source:string){
    const current=turn.current;if(!current || current.source!==source || current.ending)return;current.ending=true;
    setHolding(false);setEnding(true);
    try{
      const flushed=new Promise<void>((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Microphone did not finish its last audio chunk. Prepare it again.')),1000);
        current.flushed=()=>{clearTimeout(timeout);resolve();};
      });
      capture.current?.node.port.postMessage({type:'hold',value:false});
      await flushed;voiceSound('end');if(pendingChime.current){pendingChime.current=false;voiceSound('done');}await Promise.all([...current.uploads]);await current.start;
      if(turn.current===current)await call('voice:finish');
    }catch(e){setError(e instanceof Error?e.message:'Could not finish voice command.');await call('voice:cancel').catch(()=>{});}
    finally{if(turn.current===current){turn.current=null;setEnding(false);}}
  }
  pressRef.current=press;releaseRef.current=source=>{void release(source);};
  if(controlsRef)controlsRef.current=async(action,text='')=>{if(action==='mic_disable')disarm();else{let selected=deviceId;if(action==='mic_select'){const matches=devices.filter(d=>d.label&&text.toLowerCase().includes(d.label.toLowerCase())).sort((a,b)=>b.label.length-a.label.length);if(!matches.length)throw new Error('Say the microphone name shown in Voice.');selected=matches[0].deviceId;setDeviceId(selected);}await arm(selected);if(!capture.current)throw new Error('Microphone unavailable. Open Voice and select an input.');}};
  useEffect(()=>{
    const bridge=window.scenesense;if(!bridge)return;
    void call('state').then(x=>{stateRef.current=x.voice;setState(x.voice);}).catch(()=>{});
    void call('app:voice-startup:status').then(value=>{if(value.background&&value.enabled)setAutoPrepare(true);}).catch(()=>{});
    void call('voice:catalog').then(setCommands).catch(()=>{});
    const chime=()=>{if(completionSound.current)clearTimeout(completionSound.current);completionSound.current=setTimeout(()=>{if(turn.current&&!turn.current.ending)pendingChime.current=true;else voiceSound('done');},180);};
    const unsubscribe=bridge.subscribe(event=>{
      if(event.kind==='stream-setup'&&event.status==='ready')chime();
      if(event.kind==='sense-reply'&&event.status==='ready')chime();
      if(event.kind==='sense-reply'){setSenseReply(event);if(event.status==='ready'&&event.news)setNewsResult(event);}
      if(event.kind==='voice'){
        const previous=stateRef.current;
        if(event.status==='error'){if(completionSound.current)clearTimeout(completionSound.current);pendingChime.current=false;}
        else if(event.status==='idle'&&event.action&&(previous.status==='finishing'||event.decisionStatus==='App command completed.')&&!(previous.status==='idle'&&previous.action===event.action))chime();
        stateRef.current=event;setState(event);
        if(event.status==='error')feedbackRef.current?.(event.error||'Voice failed. Open Voice for details.');
        else if(event.action)feedbackRef.current?.((event.appAction?'Sense: ':'Applied in OBS: ')+event.action);
        else if(event.transcript)feedbackRef.current?.('Heard: '+event.transcript);
        else if(event.status==='connecting')feedbackRef.current?.('Listening. Capturing speech while transcription prepares…');
        else if(event.status==='listening')feedbackRef.current?.('Listening. Say a webcam instruction.');
        if(['idle','error'].includes(event.status)){if(latched.current)latch(false);stopTurn();}
      }
      if(event.kind==='voice-ui'){if(event.action==='mic_prepare')void arm();if(event.action==='mic_disable')disarm();}
      if(event.kind==='voice-press')gestureDown();
      if(event.kind==='voice-release')gestureUp();
      if(event.kind==='voice-force-finish'){latch(false);releaseRef.current('keyboard');}
    });
    return()=>{if(completionSound.current)clearTimeout(completionSound.current);if(releaseTimer.current)clearTimeout(releaseTimer.current);unsubscribe();disarm();void call('voice:cancel').catch(()=>{});};
  },[]);
  useEffect(()=>{
    let localHeld=false;
    const down=(event:KeyboardEvent)=>{
      if(event.code==='KeyZ'&&event.ctrlKey&&event.shiftKey&&!event.altKey&&!event.metaKey){
        event.preventDefault();if(stateRef.current.globalShortcutReady&&event.isTrusted)return;if(!event.repeat&&!localHeld){localHeld=true;gestureDown();}
      }
    };
    const up=(event:KeyboardEvent)=>{if(localHeld&&['KeyZ','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(event.code)){localHeld=false;event.preventDefault();gestureUp();}};
    const blur=()=>{if(localHeld){localHeld=false;if(!stateRef.current.globalShortcutReady&&!latched.current)releaseRef.current('keyboard');}};
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',blur);};
  },[]);
  async function configure(){
    try{setError('');await call('voice:configure',{openaiKey:key.trim(),provider,sarvamKey:sarvamKey.trim(),language});setKey('');setSarvamKey('');}
    catch(e){setError(e instanceof Error?e.message:'Could not configure voice.');}
  }
  const active=['connecting','listening','finishing'].includes(state.status);
  return <section className="voice-panel" id="voice-control"><div className="section-title"><div><h2><Icon name="mic" size={22}/>Voice control</h2><p>Hold Ctrl+Shift+Z. Release to finish.</p></div><VoiceIndicator state={state.status==='connecting'?'listening':state.status==='listening'?'listening':state.status==='finishing'?'working':'breathing'} paused={!active} label={state.status==='connecting'?(holding?'Listening':'Finishing…'):state.status}/></div>
    {!ready&&<div className="voice-setup-hint"><p>Confirm webcam and game sources for webcam movement.</p>{onSetup&&<button onClick={onSetup}>Choose OBS sources</button>}</div>}
    <p className="description shortcut-feedback" role="status">{state.globalShortcutReady?'Global shortcut ready. ':'Keep SceneSense focused to use the keyboard shortcut. '}{lastTrigger}</p>
    {!state.configured?<>
      <div className="voice-provider"><label>Transcription provider<select aria-label="Transcription provider" value={provider} onChange={e=>setProvider(e.target.value)}><option value="openai">OpenAI, live transcription</option><option value="sarvam">Sarvam, realtime transcription</option></select></label>
        {provider==='sarvam'&&<label>Spoken language<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="en-IN">English (India)</option><option value="auto">Auto-detect languages</option></select></label>}</div>
      <div className="voice-key"><label>OpenAI project API key{provider==='sarvam'?', for understanding commands':''}<input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-…, kept in memory only" autoComplete="off"/></label>
        {provider==='sarvam'&&<label>Sarvam transcription key<input type="password" value={sarvamKey} onChange={e=>setSarvamKey(e.target.value)} placeholder="Sarvam key, kept in memory only" autoComplete="off"/></label>}
        <button disabled={!key || (provider==='sarvam'&&!sarvamKey)} onClick={()=>void configure()}>Use key for this session</button></div></>:<>
      <label className="preset-toggle"><input type="checkbox" checked={autoPrepare} onChange={e=>{setAutoPrepare(e.target.checked);try{localStorage.setItem('scenesense-auto-microphone',String(e.target.checked));}catch{}}}/>Prepare microphone automatically at startup</label><div className="voice-microphone"><label>Voice microphone<select aria-label="Voice microphone" disabled={active||preparing} value={deviceId} onChange={e=>{setDeviceId(e.target.value);void arm(e.target.value);}}><option value="">System default microphone</option>{devices.filter(x=>x.deviceId!=='default').map(x=><option key={x.deviceId} value={x.deviceId}>{x.label||'Microphone'}</option>)}</select></label>
        <button disabled={active||preparing} onClick={()=>void arm()}>{preparing?'Preparing microphone…':micReady?'Recheck microphone':'Prepare microphone'}</button>
        {micReady&&<><span className="mic-ready">Mic ready</span><meter aria-label="Voice microphone level" min="0" max="1" value={level}/><button className="quiet" disabled={active} onClick={disarm}>Disable mic</button></>}
      </div>
      {micReady&&<p className="description">Input: {micName}. Audio uploads only while held.</p>}
      <div className="button-row"><button className="primary hold-to-speak" aria-pressed={holding} disabled={!micReady||ending||state.status==='finishing'}
        onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);press('button');}}
        onPointerUp={()=>void release('button')} onPointerCancel={()=>void release('button')} onLostPointerCapture={()=>void release('button')}
        onKeyDown={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)press('button');}}} onKeyUp={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();void release('button');}}}
        onBlur={()=>void release('button')}>{ending||state.status==='finishing'?'Finishing…':active?'Release to finish':'Hold to speak'} <Icon name="mic" size={18}/></button>
        <kbd>{state.shortcut}</kbd><span>{state.provider==='sarvam'?'Sarvam + OpenAI Decisions':'OpenAI transcription + Decisions'}</span>
        <button className="quiet" title="Clears this session. Keys in .env load again at the next launch." disabled={active||preparing} onClick={()=>{disarm();void call('voice:forget');}}>Forget API key</button></div></>}
    <p className="description">Try “Sense, start watching”, “Sense, check current frame”, or “top right”.</p>
{conversationHost&&createPortal(<section className="sense-conversation"><button className="scene-switch" role="switch" aria-label="Conversational Sense" aria-checked={conversational} onClick={()=>{setConversational(!conversational);if(conversational)setNewsResult(null);setSenseReply({status:'idle',text:''});}}><span/></button><p>Natural text replies to your dictation, including casual chat. Uses your OpenAI API key. Voice commands and startup greetings work when this is off.</p>{conversational&&<><div className="button-row">{['Gaming headlines','Twitch updates','Gaming industry news'].map(topic=><button key={topic} disabled={senseReply.status==='thinking'} onClick={()=>void call('sense:news','Give me the latest '+topic).catch(()=>setSenseReply({status:'error',text:'Could not request news. Check your API configuration.'}))}>{topic}</button>)}</div><p className="control-note">Ask for latest gaming or Twitch news by voice, or pick a topic. Live searches use API credits.</p>{senseReply.status==='thinking'?<SenseThinking label={senseReply.news?'Searching current news…':'Sense is thinking…'}/>:!(senseReply.status==='ready'&&senseReply.news)&&<p role="status">{senseReply.text||(newsResult?'Your last briefing is below.':'Try “Sense, what’s up?”')}</p>}{newsResult&&<NewsReply text={newsResult.text} sources={newsResult.sources||[]} checkedAt={newsResult.checkedAt} openSource={url=>call('news:open',url)}/>}</>}</section>,conversationHost)}
    <VoiceCommandGuide commands={commands}/>
    <div className="voice-mobile-wrap"><VoiceBeam type="mobile" theme="auto" colorVariant="colorful" level={holding?level:0} active={active||holding||ending} paused={!active&&!holding&&!ending} motion={ending||state.status==='finishing'?()=>({gather:1,offset:Math.sin(performance.now()/700)*.65,stretch:.2,heldLevel:.35}):null}><div className={`voice-transcript ${active?'listening':''}`} role="status">{state.transcript||'Your live transcript will appear here.'}{state.action&&<p className="voice-result"><Icon name="check" size={16}/>{state.action}</p>}{!active&&state.transcript&&!state.action&&!state.error&&<p>Heard speech, but no supported layout change was identified. Try a direct webcam instruction.</p>}</div></VoiceBeam></div>
    <details className="voice-diagnostics"><summary>Voice details</summary>
    {state.decisionStatus&&<p className="description" role="status">{state.decisionStatus}{state.audioMs!==undefined?` Audio received: ${(state.audioMs/1000).toFixed(1)} seconds.`:''}</p>}
    {state.firstTranscriptMs!==undefined&&<p className="description">Connection: {state.connectionMs} ms, First text from press: {state.firstTranscriptMs} ms{state.decisionMs!==undefined?`, Latest interpretation: ${state.decisionMs} ms`:''}</p>}
    </details>
    {(error||state.error)&&<p className="inline-error" role="alert">{error||state.error}</p>}
    <div className="footnote">Hold to speak, or double-tap Ctrl+Shift+Z for hands-free listening. Double-tap again or click ✓ Done to finish.</div>
  </section>;
}




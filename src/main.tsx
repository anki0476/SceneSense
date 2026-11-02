import {SourceVisibility} from './SourceVisibility';
import {StreamSupervisor} from './StreamSupervisor';
import {SoundToggle} from './SoundToggle';
import {useButtonSounds} from './useButtonSounds';
import {VoiceStartup} from './VoiceStartup';
import {SenseGamingRoom} from './SenseGamingRoom';
import {StudioSenseActions} from './StudioSenseActions';
import {SenseAvatar} from './SenseAvatar';
import {StartOutputs} from './StartOutputs';
import {ExperimentalSetup} from './ExperimentalSetup';
import {AudioMixer} from './AudioMixer';
import {StreamSetups} from './StreamSetups';
import StatusMark from './components/StatusMark';
import {WorkspaceNav} from './WorkspaceNav';
import {TactileButton} from './TactileButton';
import {WebcamBackground} from './WebcamBackground';
import React, { useEffect, useState,useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './style.css';
import { BrandMark, Icon } from './Icons';
import { useProgramPreview } from './useProgramPreview';
import { useSmoothPreview } from './useSmoothPreview';
import { VoicePanel } from './VoicePanel';
import { UpdateBubble } from './UpdateBubble';
import {LayoutAssist} from './LayoutAssist';
import {spokenSelection} from './voiceSelection';
import {ThemeProvider,useTheme} from './Theme';

import {OfflinePreview} from './OfflinePreview';
import {AppBackground} from './AppBackground';
import {AppSettings} from './AppSettings';
import {SettingsPage} from './SettingsPage';
import {GuidedTour} from './GuidedTour';

type Item = { id: number; name: string; enabled: boolean; kind: string };
type Layout = { positionX: number; positionY: number; width: number; height: number };
type Obs = { status: string; scenes: string[]; items: Item[]; currentScene?: string; selection: { scene: string; webcamId: number; gameId: number } | null; hasRestore: boolean; restorePoint?: Layout | null; lastVerified?: (Layout & { action: string }) | null };
type Report = { id: string; author: string; text: string; at: string };
type Twitch = { status: string; login?: string; code?: string; error?: string; reports: Report[] };
type Bridge = { invoke: (channel: string, payload?: unknown) => Promise<{ ok: boolean; data?: any; error?: string }>; subscribe: (fn: (event: any) => void) => () => void };
declare global { interface Window { scenesense?: Bridge } }
const initialObs: Obs = { status: 'disconnected', scenes: [], items: [], selection: null, hasRestore: false };
const initialTwitch: Twitch = { status: 'disconnected', reports: [] };

function App() {
  useButtonSounds();
  const {theme,setTheme}=useTheme();
  const appActionRef=useRef<(action:string,text?:string)=>Promise<void>>(async()=>{});
  const voiceControls=useRef<((action:string,text?:string)=>Promise<void>)|null>(null);
  const [obs, setObs] = useState(initialObs), [twitch, setTwitch] = useState(initialTwitch);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [port, setPort] = useState('4455'), [password, setPassword] = useState(''), [clientId, setClientId] = useState('');
  const [webcam, setWebcam] = useState(''), [game, setGame] = useState('');
  const [mic, setMic] = useState('Not checked'), [logs, setLogs] = useState<string[]>([]);
  const [preset,setPreset]=useState<{saved:boolean;autoConnect?:boolean;error?:string;selectedId?:string;presets?:{id:string;name:string;port:number;autoConnect:boolean}[]}>({saved:false});
  const [presetId,setPresetId]=useState(''),[presetName,setPresetName]=useState('');
  function applyPreset(data:any){setPreset(data);const selected=data.presets?.find((x:any)=>x.id===data.selectedId);setPresetId(selected?.id||'');setPresetName(selected?.name||'');setAutoConnect(!!selected?.autoConnect);if(selected)setPort(String(selected.port));}
  const [autoConnect,setAutoConnect]=useState(false);
  const [updating,setUpdating]=useState(false);
  const [sourceSuccessHidden,setSourceSuccessHidden]=useState(false),[sourceSuccessFading,setSourceSuccessFading]=useState(false);
  const [sourceResult,setSourceResult]=useState<'pending'|'running'|'done'|'failed'>('pending');
  const [sourceAction,setSourceAction]=useState(''),[sourceStatus,setSourceStatus]=useState('');
  async function loadSources(){
    if(!bridge||obs.status!=='connected'||!obs.currentScene){setSourceResult('pending');setSourceStatus(!bridge?'Open the desktop app and connect OBS to load sources.':'Connect OBS and select an active scene first.');return;}
    setSourceAction('loading');setSourceResult('running');setSourceStatus('Loading sources from OBS…');
    try{const items=await call('obs:items',obs.currentScene);if(!Array.isArray(items))throw Error('Invalid sources response');setWebcam('');setGame('');setSourceResult(items.length?'done':'pending');setSourceStatus(items.length?`${items.length} source${items.length===1?'':'s'} loaded successfully. Choose your webcam and game below.`:'No selectable sources found. Add a webcam and Game Capture to this OBS scene, then load again.');}
    catch(e){setSourceResult('failed');setSourceStatus('Could not load sources. Check the OBS connection and try again.');throw e;}finally{setSourceAction('');}
  }
  async function refreshScenes(){setSourceAction('refreshing');setSourceResult('running');setSourceStatus('Refreshing scenes…');try{setObs(await call('obs:refresh'));setSourceResult('done');setSourceStatus('Scenes refreshed. Load and confirm your sources again.');}catch(e){setSourceResult('failed');setSourceStatus('Could not refresh scenes. Try again.');throw e;}finally{setSourceAction('');}}
  const [updateInfo,setUpdateInfo]=useState<{status:string;message:string;changes?:string[]}|null>(null);
  const [conversationHost,setConversationHost]=useState<HTMLDivElement|null>(null);
  const [voiceFeedback,setVoiceFeedback]=useState('');
  const [voiceFeedbackVersion,setVoiceFeedbackVersion]=useState(0),[voiceFeedbackFading,setVoiceFeedbackFading]=useState(false);
  function showVoiceFeedback(message:string){setVoiceFeedback(message);setVoiceFeedbackVersion(v=>v+1);}
  const [view,setView]=useState<'studio'|'voice'|'connections'|'activity'|'settings'|'scene'>('studio');
  useEffect(()=>{setVoiceFeedbackFading(false);if(!voiceFeedback)return;const fade=setTimeout(()=>setVoiceFeedbackFading(true),4250),clear=setTimeout(()=>setVoiceFeedback(''),4500);return()=>{clearTimeout(fade);clearTimeout(clear);};},[voiceFeedback,voiceFeedbackVersion]);
  useEffect(()=>{setSourceSuccessHidden(false);setSourceSuccessFading(false);if(sourceResult!=='done')return;const fade=setTimeout(()=>setSourceSuccessFading(true),2000),hide=setTimeout(()=>setSourceSuccessHidden(true),2250);return()=>{clearTimeout(fade);clearTimeout(hide);};},[sourceResult,sourceStatus]);
  const bridge = window.scenesense;
  async function call(channel: string, payload?: unknown) {
    if (!bridge) throw new Error('Open the desktop app with npm start. Browser preview cannot control OBS.');
    const result = await bridge.invoke(channel, payload);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  }
  function log(text: string) { setNotice(text); setLogs(prev => [text, ...prev].slice(0, 8)); }
  useEffect(() => {
    if (!bridge) return;
    const unsubscribe = bridge.subscribe(event => {
      if(event.kind==='settings-theme')setTheme(event.theme);
      if(event.kind==='settings-activity')setView('activity');
      if(event.kind==='app-command')void (async()=>{try{await appActionRef.current(event.action,event.text);await call('voice:ui-result',{id:event.id,ok:true});}catch(e){const message=e instanceof Error?e.message:'App command failed.';setError(message);await call('voice:ui-result',{id:event.id,ok:false,error:message.slice(0,500)});}})();
      if (event.kind === 'obs') {setObs(event);if(event.selection){setWebcam(String(event.selection.webcamId));setGame(String(event.selection.gameId));}}
      if (event.kind === 'twitch') setTwitch(event);
    });
    call('state').then(state => { setObs(state.obs); if(state.obs.selection){setWebcam(String(state.obs.selection.webcamId));setGame(String(state.obs.selection.gameId));} setTwitch(state.twitch); setUpdateInfo(state.updateInfo||null); if(state.preset){applyPreset(state.preset);} }).catch(e => setError(e.message));
    return unsubscribe;
  }, []);
  const smooth = useSmoothPreview(obs.status === 'connected', () => call('obs:smooth:prepare'));
  const preview = useProgramPreview(obs.currentScene, obs.status === 'connected' && !smooth.active, () => call('obs:program-preview'));
  async function testMicrophone() {
    setMic('Requesting access…'); let stream: MediaStream | undefined; let context: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      context = new AudioContext(); await context.resume();
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize); let peak = 0;
      for (let i = 0; i < 20; i++) { analyser.getFloatTimeDomainData(data); peak = Math.max(peak, ...data.map(Math.abs)); await new Promise(resolve => setTimeout(resolve, 100)); }
      setMic(peak > 0.005 ? 'Signal detected · microphone released' : 'Access granted · no clear signal detected');
    } catch { setMic('Microphone unavailable or permission denied'); }
    finally { stream?.getTracks().forEach(track => track.stop()); await context?.close(); }
  }
  const ready = obs.status === 'connected';
  const confirmed = ready && !!obs.selection && String(obs.selection.webcamId) === webcam && String(obs.selection.gameId) === game;

  useEffect(()=>{setSourceResult('pending');setSourceStatus('');},[obs.status,obs.currentScene]);
  const [sourceJump,setSourceJump]=useState(0),[sourceHighlighted,setSourceHighlighted]=useState(false);
  const sourceJumpHandled=useRef(0);
  useEffect(()=>{if(view!=='connections'||!sourceJump||sourceJumpHandled.current===sourceJump)return;sourceJumpHandled.current=sourceJump;const tile=document.getElementById('source-selection');if(!tile)return;const frame=requestAnimationFrame(()=>{tile.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});tile.focus({preventScroll:true});setSourceHighlighted(true);});const timer=setTimeout(()=>setSourceHighlighted(false),3000);return()=>{cancelAnimationFrame(frame);clearTimeout(timer);setSourceHighlighted(false);};},[view,sourceJump]);
  const navigate=(next:typeof view)=>{setView(next);window.scrollTo({top:0,behavior:'instant'});};
  appActionRef.current=async(action,text='')=>{
    if(action.startsWith('nav_')){navigate(action.slice(4) as typeof view);return;}
    switch(action){
      case 'theme_dark':setTheme('dark');return;
      case 'theme_light':setTheme('light');return;
      case 'theme_toggle':setTheme(theme==='dark'?'light':'dark');return;
      case 'select_webcam':setWebcam(String(spokenSelection(obs.items,text).id));return;
      case 'select_game':setGame(String(spokenSelection(obs.items,text).id));return;
      case 'select_preset':{const item=spokenSelection(preset.presets||[],text);setPresetId(item.id);setPresetName(item.name);setPort(String(item.port));setAutoConnect(item.autoConnect);setPassword('');return;}
      case 'mic_select':if(!voiceControls.current)throw new Error('Open Voice first.');await voiceControls.current(action,text);return;
      case 'preview_suggestion':{const current=await call('state');if(!current.layout?.recommendation||current.layout.recommendation.expiresAt<=Date.now())throw new Error('Check the current frame first; no fresh suggestion is available.');navigate('studio');window.dispatchEvent(new CustomEvent('sense-guide-command',{detail:action}));return;}case 'dismiss_sense':navigate('studio');window.dispatchEvent(new CustomEvent('sense-guide-command',{detail:action}));return;
      case 'preview_smooth_on':if(!await smooth.start())throw new Error('Smooth preview could not start. Check Studio for details.');return;
      case 'preview_smooth_off':smooth.stop();return;
      case 'preview_refresh':preview.refresh();return;
      case 'obs_connect':if(presetId)setObs(await call('obs:preset:connect',presetId));else setObs(await call('obs:connect',{host:'127.0.0.1',port:Number(port),password}));setPassword('');return;
      case 'obs_disconnect':await call('obs:disconnect');return;
      case 'obs_refresh':await refreshScenes();return;
      case 'load_sources':await loadSources();return;
      case 'confirm_sources':if(webcam===''||game==='')throw new Error('Select webcam and game sources in Connections first.');setObs(await call('obs:select',{scene:obs.currentScene,webcamId:Number(webcam),gameId:Number(game)}));return;
      case 'preset_connect':if(!presetId)throw new Error('Select a saved preset in Connections first.');setObs(await call('obs:preset:connect',presetId));return;
      case 'preset_save':if(!presetName.trim())throw new Error('Enter a preset name in Connections first.');applyPreset(await call('obs:preset:save',{id:presetId||undefined,name:presetName,port:Number(port),password:password||undefined,autoConnect}));setPassword('');return;
      case 'preset_delete':if(!presetId)throw new Error('Select a saved preset first.');applyPreset(await call('obs:preset:remove',presetId));return;
      case 'preset_new':navigate('connections');setPresetId('');setPresetName('');setPassword('');setAutoConnect(false);return;
      case 'twitch_connect':if(!clientId.trim())throw new Error('Enter the Twitch Client ID in Connections first.');await call('twitch:begin',clientId.trim());return;
      case 'twitch_disconnect':await call('twitch:disconnect');return;
      case 'twitch_authorize':await call('twitch:open');return;
      case 'mic_test':await testMicrophone();return;
      case 'mic_prepare':case 'mic_disable':if(!voiceControls.current)throw new Error('Open Voice first.');await voiceControls.current(action);return;
      case 'restart_update':setUpdating(true);try{await call('app:restart-update');}catch(e){setUpdating(false);throw e;}return;
      case 'dismiss_update':setUpdateInfo(null);return;
      case 'voice_help':navigate('voice');{const help=document.querySelector('details.voice-command-help') as HTMLDetailsElement|null;if(help)help.open=true;}setNotice('Hold Ctrl+Shift+Z. Try “Sense, start watching”, “Sense, check current frame”, “Sense, open connections”, or “Sense, stop watching”.');return;
      default:throw new Error('Unsupported app command.');
    }
  };
  return <GuidedTour view={view} onNavigate={navigate}><div className="shell"><AppBackground/>
    <a className="skip-link" href="#workspace" onClick={event=>{event.preventDefault();document.getElementById('workspace')?.focus();}}>Skip to workspace</a>
    <header className="app-header"><div className="header-inner">
      <button className="brand" onClick={()=>navigate('studio')} aria-label="SceneSense studio"><BrandMark/><span>SceneSense</span></button>
      <WorkspaceNav view={view} onNavigate={navigate}/>
      <div className="header-tools"><div className="restart-anchor"><button className={`restart-update ${updating?'is-updating':''}`} aria-busy={updating} disabled={updating||busy||!bridge} onClick={async()=>{setUpdating(true);setError('');try{await call('app:restart-update');}catch(e){setError(e instanceof Error?e.message:'Restart failed.');setUpdating(false);}}}><Icon name="refresh" size={16}/>{updating?'Building update…':'Restart for updates'}</button>{updateInfo&&<UpdateBubble info={updateInfo} onDismiss={()=>setUpdateInfo(null)}/>}</div><AppSettings onOpen={()=>navigate('settings')}/></div>
    </div></header>
    {view==='settings'&&<section className="inline-settings"><button className="settings-back" onClick={()=>navigate('studio')}>← Back to Studio</button><SettingsPage onActivity={()=>navigate('activity')}/></section>}
    <main id="workspace" hidden={view==='settings'} className="workspace" tabIndex={-1}>
      <div className={`page-heading ${view==='scene'?'scene-page-heading':''}`}><div><h1>{view==='studio'?'Your Studio':view==='voice'?'Say it. See it.':view==='connections'?'Connect your studio.':view==='scene'?'Sense':'Session activity.'}</h1><p>{view==='studio'?'Preview and controls':view==='voice'?'Hold to speak.':view==='connections'?'Connect OBS and choose your sources.':view==='scene'?'Your companion, your way.':'Changes this session.'}</p></div><div className="page-actions">{view==='studio'&&<>{ready&&<StartOutputs call={call}/>}<TactileButton onClick={()=>navigate('connections')}><Icon name="settings" size={16}/> Studio settings</TactileButton><TactileButton className="primary" onClick={()=>navigate('voice')}><Icon name="mic" size={16}/> Voice control</TactileButton></>}{view==='scene'&&<><TactileButton onClick={()=>window.dispatchEvent(new Event('sense-tour-start'))}>Take the tour</TactileButton><TactileButton onClick={()=>{navigate('voice');const guide=document.querySelector('details.voice-command-help') as HTMLDetailsElement|null;if(guide)guide.open=true;}}>Voice commands</TactileButton></>}{view==='voice'&&<button onClick={()=>navigate('studio')}><Icon name="studio" size={16}/> Back to studio</button>}</div></div>
      
      {view!=='voice'&&voiceFeedback&&<div className={`banner voice-feedback ${voiceFeedbackFading?'voice-feedback-fading':''}`} role="status"><Icon name="mic" size={18}/><span>{voiceFeedback}</span><button onClick={()=>navigate('voice')}>Open Voice</button><button className="quiet" aria-label="Dismiss voice status" onClick={()=>setVoiceFeedback('')}>Dismiss</button></div>}{error&&<div className="banner error" role="alert"><Icon name="alert"/>{error}</div>}
{notice&&<div className="banner success" role="status"><Icon name="check"/>{notice}</div>}

      <section id="connections-view" hidden={view!=='connections'} aria-label="Studio connections">
        <div className="connection-layout"><section className="connection-form"><div className="connection-heading"><Icon name="studio" size={26}/><div><h2>OBS Studio</h2><p>Local connection</p></div><Status value={obs.status}/></div>
          <p className="description">OBS → Tools → WebSocket Server Settings.</p>
          <div className="form-row"><label className="port">Port<input type="number" value={port} onChange={e => setPort(e.target.value)} min="1024" max="65535" disabled={busy}/></label><label>WebSocket password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="From OBS settings" autoComplete="off" disabled={busy}/></label></div>
          <div className="button-row"><TactileButton className="primary" disabled={busy||!bridge} onClick={() => run(async () => { const state = await call('obs:connect', { host: '127.0.0.1', port: Number(port), password }); setObs(state); setPassword(''); log('OBS connected. Choose your active scene below.'); })}>{busy?'Working…':ready?'Reconnect OBS':'Connect OBS'}</TactileButton>{ready&&<button className="quiet" disabled={busy} onClick={() => run(async () => { await call('obs:disconnect'); log('OBS disconnected.'); })}>Disconnect</button>}</div>
          <div className="preset-controls"><div className="form-row"><label>Saved OBS preset<select aria-label="Saved OBS preset" disabled={busy} value={presetId} onChange={e=>{const id=e.target.value;const item=preset.presets?.find(x=>x.id===id);setPresetId(id);setPresetName(item?.name||'');setAutoConnect(!!item?.autoConnect);setPassword('');if(item)setPort(String(item.port));}}><option value="">New preset</option>{preset.presets?.map(item=><option key={item.id} value={item.id}>{item.name}{item.autoConnect?' (startup)':''}</option>)}</select></label><label>Preset name<input value={presetName} onChange={e=>setPresetName(e.target.value)} maxLength={80} placeholder="e.g. Gaming setup" disabled={busy}/></label></div><label className="preset-toggle"><input type="checkbox" checked={autoConnect} onChange={e=>setAutoConnect(e.target.checked)}/>Reconnect at startup</label><div className="button-row"><TactileButton disabled={busy||!presetName.trim()||(!password&&!presetId)||!bridge} onClick={()=>run(async()=>{applyPreset(await call('obs:preset:save',{id:presetId||undefined,name:presetName,port:Number(port),password:password||undefined,autoConnect}));setPassword('');log('Named OBS preset saved securely.');})}>{presetId?'Update preset':'Save OBS preset'}</TactileButton>{presetId&&<><TactileButton disabled={busy} onClick={()=>run(async()=>{setObs(await call('obs:preset:connect',presetId));log('OBS connected using your saved preset.');})}>Connect saved preset</TactileButton><TactileButton className="quiet" disabled={busy} onClick={()=>run(async()=>{applyPreset(await call('obs:preset:remove',presetId));setPassword('');log('Selected OBS preset removed.');})}>Delete preset</TactileButton></>}</div>{preset.error&&<p className="inline-error">{preset.error}</p>}</div><p className="privacy-note"><Icon name="shield" size={15}/>Saved passwords are encrypted on this device.</p>
        </section><aside className="connection-guide"><span className="guide-icon"><Icon name="plug" size={28}/></span><h3>Quick setup</h3><p>No broadcast needed.</p><ol><li>Enable OBS WebSocket.</li><li>Connect with its password.</li><li>Choose webcam and game.</li></ol></aside></div>
        <section id="source-selection" tabIndex={-1} aria-label="Choose your sources" className={`sources ${sourceHighlighted?'source-selection-highlight':''}`}><div className="section-title"><div><h2>Choose your sources</h2><p>Select your webcam and game capture.</p></div><button disabled={busy||!ready} aria-busy={sourceAction==='refreshing'} className={sourceAction==='refreshing'?'refreshing-scenes':''} onClick={() => run(refreshScenes)}><Icon name="refresh" size={16}/>Refresh scenes</button></div>
          <div className="source-grid"><label>Active program scene<select disabled={busy||!ready} value={obs.currentScene||''} onChange={() => {}}><option value="">Connect OBS first</option>{obs.scenes.map(scene=><option key={scene} disabled={scene!==obs.currentScene}>{scene}</option>)}</select></label><button className="load-button" disabled={busy} aria-busy={sourceAction==='loading'} onClick={() => run(loadSources)}>{sourceAction==='loading'?'Loading sources…':'Load sources'}</button><SourceSelect label="Webcam source" items={obs.items} value={webcam} onChange={setWebcam} disabled={busy||!ready}/><SourceSelect label="Game source" items={obs.items} value={game} onChange={setGame} disabled={busy||!ready}/></div>
          <div hidden={sourceSuccessHidden&&sourceResult==='done'} className={`source-operation-status source-status-${sourceResult} ${sourceSuccessFading?'source-success-fading':''}`} role="status" aria-live="polite"><StatusMark status={sourceResult} label={sourceStatus||(!ready?'Connect OBS to load sources.':'Load sources from your active OBS scene.')} color="var(--color-ink-2)" doneColor="var(--color-success)" errorColor="var(--color-error)" size={20} fontSize={13} strike={false}/></div><div className="source-bottom"><p>Confirm to save a restore point.</p><div className="button-row"><TactileButton className="primary" disabled={busy||!ready||webcam===''||game===''||webcam===game} onClick={() => run(async () => { setObs(await call('obs:select', { scene: obs.currentScene, webcamId: Number(webcam), gameId: Number(game) })); preview.refresh(); log('Sources confirmed. Original webcam layout saved for this session.'); })}>Confirm sources</TactileButton>{confirmed&&<button onClick={()=>navigate('studio')}>Open studio<Icon name="arrow" size={16}/></button>}</div></div>
        </section>
        <section className="twitch-connection"><div className="connection-heading"><Icon name="chat" size={24}/><div><h2>Twitch</h2><p>Optional community reports.</p></div><Status value={twitch.status}/></div>
          <div className="twitch-form"><div><p className="description">Use a Public app Client ID from Twitch Developers.</p><label>Application Client ID<input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Your public Twitch Client ID" disabled={busy}/></label><div className="button-row"><TactileButton disabled={busy||!clientId||!bridge} onClick={() => run(async () => { await call('twitch:begin', clientId.trim()); log('Authorization ready. Open Twitch to approve the connection.'); })}>Connect Twitch</TactileButton>{twitch.status!=='disconnected'&&<button className="quiet" disabled={busy} onClick={() => run(async () => { await call('twitch:disconnect'); })}>Disconnect</button>}</div></div><p className="privacy-note"><Icon name="shield" size={18}/>Read-only chat. Reports cannot move your webcam.</p></div>
          {twitch.code&&<div className="authorization">Code <strong>{twitch.code}</strong><button disabled={busy} onClick={() => run(async () => { await call('twitch:open'); })}>Open Twitch authorization</button></div>}{twitch.login&&<p className="connected-account">Connected as @{twitch.login}, own-channel chat.</p>}{twitch.error&&<p className="inline-error" role="alert">{twitch.error}</p>}
        </section>
      </section>

      <section id="studio-view" hidden={view!=='studio'} aria-label="Live studio">

        <div className="studio-layout"><section className="stage"><div className="stage-toolbar"><div><h2>Program preview</h2><span>{ready?obs.currentScene:'Waiting for OBS'}</span></div><button disabled={!ready||smooth.starting} onClick={() => smooth.active ? smooth.stop() : void smooth.start()}>{smooth.starting?'Starting video…':smooth.active?'Use lightweight preview':'Enable smooth video'}</button></div>
          <div className="preview"><video ref={smooth.video} hidden={!smooth.active} autoPlay playsInline muted poster={preview.frame?.image} aria-label="Smooth OBS video preview"/>{!smooth.active&&(preview.frame?<img src={preview.frame.image} alt="Live OBS scene preview" data-captured-at={preview.frame.capturedAt}/>:!ready?<OfflinePreview onConnect={()=>navigate('connections')}/>:<div className="preview-empty"><Icon name="studio" size={44}/><h3>{ready?'Loading your scene…':'Your stream belongs here.'}</h3><p>{ready?'Reading the active OBS scene.':'Connect OBS to see your game, webcam and overlays.'}</p>{!ready&&<button className="primary" onClick={()=>navigate('connections')}>Connect your studio<Icon name="arrow" size={16}/></button>}</div>)}</div>
          <div className="preview-caption"><span><Icon name={smooth.active?'camera':'studio'} size={15}/>{smooth.active?'OBS Virtual Camera':preview.error?'Preview interrupted, retrying':preview.frame?'OBS scene preview':'Local preview'}</span><span>{smooth.active?'Local video, no audio capture':preview.frame?'Up to 4 updates per second':'No broadcast required'}</span></div>
          {smooth.error&&<p className="inline-error" role="status">{smooth.error}</p>}{!smooth.active&&preview.error&&<p className="inline-error" role="status">{preview.error}</p>}
          <details className="preview-details"><summary>About this preview</summary><p>{smooth.active?'Local video from OBS Virtual Camera. Use Program output in its OBS settings to follow your broadcast.':'Lightweight preview updates a few times a second. Enable smooth video for fluid motion; this starts OBS Virtual Camera locally.'}</p></details>
        </section><aside className="inspector"><section className="webcam-controls"><div className="section-title"><h2><Icon name="camera" size={19}/>Webcam</h2><span className="small-label">{confirmed?'Ready to move':'Select sources first'}</span></div><p></p>
          <SourceVisibility ready={ready} call={call}/>
          <div className="corner-controls">{[['top-left','Top left'],['top-right','Top right'],['bottom-left','Bottom left'],['bottom-right','Bottom right']].map(([action,label])=><button key={action} aria-label={action} title={label} disabled={busy||!confirmed} onClick={() => run(async () => { await call('obs:act', action); preview.refresh(); log(`Verified in OBS: ${action}.`); })}><span className={`corner-glyph ${action}`} aria-hidden="true"><i/></span>{label}</button>)}</div>
          <div className="size-controls"><span>Size</span>{[['smaller','Smaller'],['larger','Larger']].map(([action,label])=><button key={action} title={label} aria-label={action} disabled={busy||!confirmed} onClick={() => run(async () => { await call('obs:act', action); preview.refresh(); log(`Verified in OBS: ${action}.`); })}><Icon name={action==='smaller'?'minus':'plus'} size={16}/>{label}</button>)}</div>
          <button className="restore-button" aria-label="restore" disabled={busy||!confirmed} onClick={()=>run(async()=>{await call('obs:act','restore');preview.refresh();log('Verified in OBS: restore.');})}><Icon name="restore" size={16}/>Restore saved layout</button>
          <p className="control-note">Returns to your confirmed layout.</p>
          {!confirmed&&<TactileButton className="text-button" onClick={()=>{navigate('connections');setSourceJump(x=>x+1);}}>Choose webcam and game<Icon name="arrow" size={15}/></TactileButton>}
          <WebcamBackground context={confirmed?JSON.stringify(obs.selection):''} source={obs.items.find(x=>x.id===obs.selection?.webcamId)?.name} invoke={call} onChanged={()=>preview.refresh()}/>
          {confirmed&&obs.restorePoint&&<details className="layout-proof"><summary>{obs.lastVerified?.action==='restore'?'Restore verified against OBS':'Saved webcam layout'}</summary><p><strong>Saved restore point</strong><br/><LayoutText value={obs.restorePoint}/></p>{obs.lastVerified&&<p role="status"><strong>{obs.lastVerified.action==='restore'?'Restore verified against OBS':'Last action verified against OBS'}</strong><br/><LayoutText value={obs.lastVerified}/></p>}<p>Values are broadcast-canvas pixels. Reconfirming sources replaces the saved restore point.</p></details>}
        </section></aside></div>
        <div className="studio-setup-row"><div className="studio-companion-stack"><section className="scene-studio-link"><SenseAvatar/><h2>Sense</h2><p>Scene awareness, conversation and computer setup.</p><StudioSenseActions call={call} ready={ready} confirmed={confirmed} onOpen={()=>navigate('scene')} onCheck={()=>run(async()=>{await call('layout:check');navigate('scene');})}/></section><section className="community-region"><div><h2><Icon name="chat" size={20}/>Community signals<span className="count">{twitch.reports.length}</span></h2><p>Viewers can type <code>!blocked</code> in your chat. Reports never control OBS.</p></div>{twitch.reports.length?<div className="report-list">{twitch.reports.map(r=><div className="report" key={r.id}><strong>{r.author}</strong><time>{new Date(r.at).toLocaleTimeString()}</time><p>{r.text}</p></div>)}</div>:<div className="community-empty"><p>{twitch.status==='connected'?'No reports yet. Listening to your channel.':'Connect Twitch to hear from your community.'}</p>{twitch.status!=='connected'&&<TactileButton onClick={()=>navigate('connections')}>Connect Twitch</TactileButton>}</div>}</section></div><AudioMixer ready={ready} call={call}/></div>
        <div className="studio-support studio-setup-row"><StreamSetups scene={obs.currentScene} selection={obs.selection} ready={confirmed} onLoad={async setup=>{setBusy(true);setError('');try{const state=await call('obs:setup:load',setup);setObs(state);setWebcam(String(setup.webcamId));setGame(String(setup.gameId));preview.refresh();log('Loaded setup: '+setup.name);}catch(e){setError(e instanceof Error?e.message:'Could not load setup.');throw e;}finally{setBusy(false);}}}/><section className="voice-launcher"><Icon name="mic" size={24}/><h3>Hands on the game.</h3><p>Hold <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Z</kbd> and tell your webcam where to go.</p><TactileButton onClick={()=>navigate('voice')}>Set up voice control<Icon name="arrow" size={16}/></TactileButton></section></div>

      </section>

      <section id="voice-view" hidden={view!=='voice'} aria-label="Voice workspace"><VoicePanel conversationHost={conversationHost} controlsRef={voiceControls} call={call} ready={confirmed} onFeedback={showVoiceFeedback} onSetup={()=>navigate('connections')}/><section className="mic-check"><div><h2><Icon name="headphones" size={20}/>Check your microphone</h2><p>Two-second local test.</p></div><div><button disabled={busy||!bridge} onClick={() => run(testMicrophone)}>Test microphone</button><p className="mic-status" role="status">{mic}</p></div></section></section>
      <section id="scene-view" hidden={view!=='scene'} aria-label="Sense workspace">
        <SenseGamingRoom/>
        <div className="scene-awareness-primary"><LayoutAssist call={call} ready={confirmed} onFeedback={log}/></div><div className="scene-grid"><StreamSupervisor call={call}/><div className="scene-conversation-card"><h2>Conversation &amp; news</h2><div ref={setConversationHost}/></div></div>
        <section className="scene-computer-card"><SoundToggle group="notch"/></section><VoiceStartup call={call}/><section className="scene-computer-card"><h2>Computer use functionality</h2><ExperimentalSetup call={call}/></section>
        
      </section>
      <section id="activity-view" hidden={view!=='activity'} aria-label="Session activity"><div className="activity-heading"><h2>Studio changes</h2><p>This session only.</p></div>{logs.length?<ol className="activity-list">{logs.map((text,i)=><li key={i}><Icon name="check" size={18}/><span>{text}</span>{i===0&&<span className="small-label">Latest</span>}</li>)}</ol>:<div className="activity-empty"><Icon name="activity" size={32}/><h3>No changes yet.</h3><p>Your changes appear here.</p><button onClick={()=>navigate('studio')}>Open studio</button></div>}</section>
      <footer><span><Icon name="shield" size={14}/>Local OBS connection.</span><span>Voice and manual controls take priority.</span></footer>
    </main>
  </div></GuidedTour>;
}
function Status({value}:{value:string}){return <span className={`status ${value==='connected'?'online':''}`}><Icon name={value==='connected'?'check':'plug'} size={14}/>{value}</span>;}
function LayoutText({value}:{value:Layout}){return <span>X {value.positionX.toFixed(1)}, Y {value.positionY.toFixed(1)}<br/>{value.width.toFixed(1)} × {value.height.toFixed(1)} px</span>;}
function SourceSelect({label,items,value,onChange,disabled}:{label:string;items:Item[];value:string;onChange:(x:string)=>void;disabled:boolean}){return <label>{label}<select disabled={disabled} value={value} onChange={e => onChange(e.target.value)}><option value="">Select source</option>{items.map(item=><option key={item.id} value={item.id} disabled={!item.enabled}>{item.name}{!item.enabled?' (hidden)':''}</option>)}</select></label>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ThemeProvider><App/></ThemeProvider></React.StrictMode>);












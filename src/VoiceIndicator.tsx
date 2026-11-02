import {ThinkingOrb} from 'thinking-orbs';
export function VoiceIndicator({state,label,dark,paused=false}:{state:'listening'|'connecting'|'working'|'breathing'|'searching';label:string;dark?:boolean;paused?:boolean}){
  return <span className="voice-indicator" role="status" aria-live="polite"><ThinkingOrb state={state} size={20} theme={dark===undefined?'auto':dark?'dark':'light'} paused={paused}/><span>{label}</span></span>;
}

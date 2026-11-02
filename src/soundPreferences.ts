import {useSyncExternalStore} from 'react';
export type SoundGroup='notch'|'buttons';
const eventName='scenesense-sound-preference';
const key=(group:SoundGroup)=>`scenesense-sounds-${group}`;
export function soundEnabled(group:SoundGroup){try{return localStorage.getItem(key(group))!=='false';}catch{return true;}}
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(eventName,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(eventName,callback);};}
export function useSoundPreference(group:SoundGroup){const enabled=useSyncExternalStore(subscribe,()=>soundEnabled(group),()=>true);return [enabled,(value:boolean)=>{localStorage.setItem(key(group),String(value));window.dispatchEvent(new Event(eventName));}] as const;}

import {useMemo,useSyncExternalStore} from 'react';
export const backgroundAnimations=[['topographic','Topographic Flow'],['aero','Aero Shards'],['waves','Gradient Waves'],['rings','Magic Rings'],['ascii','Gradient ASCII'],['topography','Topography']] as const;
export type AnimationName=typeof backgroundAnimations[number][0];
type Preference={mode:'flow'|'plain'|'image';image?:string;animation?:AnimationName};
const key='scenesense-background-v1',eventName='scenesense-background-change';
// Migrate the previous default once; later explicit choices stay untouched.
function migrateDefault(){try{const raw=localStorage.getItem(key);const pref=raw?JSON.parse(raw):{mode:'flow'};if(pref.defaultVersion===2)return;if(pref.mode==='flow'&&(!pref.animation||pref.animation==='topographic'))pref.animation='waves';pref.defaultVersion=2;localStorage.setItem(key,JSON.stringify(pref));}catch{}}
migrateDefault();
function read(){try{return localStorage.getItem(key)||'';}catch{return '';}}
function subscribe(fn:()=>void){window.addEventListener(eventName,fn);window.addEventListener('storage',fn);return()=>{window.removeEventListener(eventName,fn);window.removeEventListener('storage',fn);};}
export function useBackgroundPreference(){const raw=useSyncExternalStore(subscribe,read,()=> '');return useMemo<Preference>(()=>{try{const p=JSON.parse(raw);if(['flow','plain','image'].includes(p.mode)&&(!p.image||/^data:image\/jpeg;base64,/.test(p.image)))return p;}catch{}return {mode:'flow',animation:'waves'};},[raw]);}
export function saveBackgroundPreference(value:Preference){localStorage.setItem(key,JSON.stringify({...value,defaultVersion:2}));window.dispatchEvent(new Event(eventName));}


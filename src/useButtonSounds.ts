import {useEffect} from 'react';
import {voiceSound} from './voiceSounds';
export function useButtonSounds(){
 useEffect(()=>{
  const tap=(event:MouseEvent)=>{
   if(!event.isTrusted||!(event.target instanceof Element))return;
   const button=event.target.closest('button,[role="button"],summary');
   if(!button||button.matches(':disabled,[aria-disabled="true"]'))return;
   voiceSound('tap');
  };
  document.addEventListener('click',tap,true);
  return()=>document.removeEventListener('click',tap,true);
 },[]);
}

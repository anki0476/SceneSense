import {createContext,useContext,useState,useEffect} from 'react';
import type {ReactNode} from 'react';
type Theme='dark'|'light';
const ThemeContext=createContext<{theme:Theme;setTheme:(theme:Theme)=>void}>({theme:'dark',setTheme:()=>{}});
export function ThemeProvider({children}:{children:ReactNode}){
  const [theme,setValue]=useState<Theme>(document.documentElement.dataset.theme==='light'?'light':'dark');
  useEffect(()=>{void window.scenesense?.invoke('app:appearance',theme).catch(()=>{});},[theme]);
  useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key==='scenesense-theme'&&(event.newValue==='dark'||event.newValue==='light')){document.documentElement.dataset.theme=event.newValue;document.documentElement.style.colorScheme=event.newValue;setValue(event.newValue);}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  function setTheme(value:Theme){document.documentElement.dataset.theme=value;document.documentElement.style.colorScheme=value;try{localStorage.setItem('scenesense-theme',value);}catch{}setValue(value);}
  return <ThemeContext.Provider value={{theme,setTheme}}>{children}</ThemeContext.Provider>;
}
export const useTheme=()=>useContext(ThemeContext);

import {useMemo,type ReactNode,type Ref} from 'react';
import {ShowcasePointer,type CursorConfig,type CursorTarget,type ShowcasePointerHandle} from './components/showcase-pointer';
import {useTheme} from './Theme';

/** Sense's shared visual pointing gesture. It deliberately exposes no activation actions. */
export function SensePointer({children,target,from,active=true,id='sense-pointer',className='',controllerRef}:{
  children:ReactNode;target?:CursorTarget;from?:CursorTarget;active?:boolean;id?:string;className?:string;controllerRef?:Ref<ShowcasePointerHandle>;
}){
  const {theme}=useTheme();
  const cursors=useMemo<CursorConfig[]>(()=>active&&target?[{
    id,name:'Sense',color:theme==='dark'?'#a46bff':'#9147ff',start:from??target,
    script:[{action:'hover',target,duration:600}],
  }]:[],[active,target,from,id,theme]);
  return <ShowcasePointer ref={controllerRef} className={className} cursors={cursors} playing={active&&!!target} loop={false} idleDrift={0.4}>
    {children}
  </ShowcasePointer>;
}

import {useState} from 'react';
import {useSoundPreference,type SoundGroup} from './soundPreferences';
export function SoundToggle({group}:{group:SoundGroup}){
 const [enabled,setEnabled]=useSoundPreference(group),[error,setError]=useState('');
 const title=group==='notch'?'Notch sound effects':'Button sound effects';
 const description=group==='notch'?'Play the pop, tick and success blip for dictation and completed tasks.':'Play a soft tap when you use buttons throughout the app.';
 return <div className="sound-preference"><div><strong>{title}</strong><p>{description}</p>{error&&<p role="alert">{error}</p>}</div><button className="sound-preference-switch" role="switch" aria-label={title} aria-checked={enabled} onClick={()=>{try{setEnabled(!enabled);setError('');}catch{setError('Could not save sound preference.');}}}><span/></button></div>;
}

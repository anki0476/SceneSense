import {Icon} from './Icons';
export function AppSettings({onOpen}:{onOpen:()=>void}){return <div className="app-settings"><button aria-label="Settings" onClick={onOpen}><Icon name="settings" size={18}/><span>Settings</span></button></div>;}

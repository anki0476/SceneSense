import {BotAvatar} from 'bot-avatars';

export function SenseAvatar({working=false,paused=false,theme='auto'}:{working?:boolean;paused?:boolean;theme?:'auto'|'light'|'dark'}){
  return <span aria-label="Sense" className="sense-avatar"><BotAvatar type="mech" size={32} state={working?'working':'default'} paused={paused} theme={theme} interactive={false}/></span>;
}

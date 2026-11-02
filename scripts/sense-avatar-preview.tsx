import React from 'react';
import {createRoot} from 'react-dom/client';
import {BotAvatar} from 'bot-avatars';
createRoot(document.getElementById('root')!).render(<BotAvatar type="mech" size={128} state="default" paused theme="dark" interactive={false}/>);

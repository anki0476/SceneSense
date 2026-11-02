const { contextBridge, ipcRenderer } = require('electron');
// Sense can only undo its own verified placement through the bounded adapter.
const channels = new Set(['obs:visibility:read','obs:visibility:set','supervisor:video','supervisor:cancel','supervisor:check','supervisor:repair','supervisor:microphone','layout:preferences','layout:keep','layout:undo','layout:check','layout:start','layout:stop','layout:apply','state','setup:status','setup:profiles','setup:profile:save','setup:enable','setup:start','setup:stop','obs:outputs:status','obs:outputs:set','obs:connect','obs:disconnect','obs:refresh','obs:items','obs:select','obs:setup:load','obs:setup:capture','obs:audio:list','obs:audio:set','obs:act','obs:preview','obs:program-preview','obs:smooth:prepare','twitch:begin','twitch:open','twitch:disconnect']);
for(const channel of ['obs:background:status','obs:background:set','obs:background:setup'])channels.add(channel);
for(const channel of ['app:voice-startup:status','app:voice-startup:set','app:appearance','annotations:copy','sense:news','news:open','sense:conversation','voice:meter','voice:latch','app:restart-update','obs:preset:save','obs:preset:remove','obs:preset:connect','voice:ui-result','voice:catalog','voice:configure','voice:forget','voice:start','voice:audio','voice:finish','voice:cancel'])channels.add(channel);
contextBridge.exposeInMainWorld('scenesense', {
  invoke: (channel, payload) => { if (!channels.has(channel)) return Promise.reject(new Error('Unknown operation.')); return ipcRenderer.invoke(channel, payload); },
  subscribe: callback => { const listener = (_, event) => callback(event); ipcRenderer.on('state:update', listener); return () => ipcRenderer.removeListener('state:update', listener); }
});



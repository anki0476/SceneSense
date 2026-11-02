const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('voiceOverlay',{
  subscribe:callback=>{const listener=(_,state)=>callback(state);ipcRenderer.on('voice:indicator',listener);return()=>ipcRenderer.removeListener('voice:indicator',listener);},
  subscribeLevel:callback=>{const listener=(_,level)=>callback(level);ipcRenderer.on('voice:meter',listener);return()=>ipcRenderer.removeListener('voice:meter',listener);},
  openVoice:()=>ipcRenderer.send('voice:open-results'),
  finish:()=>ipcRenderer.send('voice:indicator-finish'),ready:()=>ipcRenderer.send('voice:indicator-ready')
});

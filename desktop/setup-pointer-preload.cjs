const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('setupPointer',{listen:callback=>{const handler=(_,value)=>callback(value);ipcRenderer.on('setup-pointer:play',handler);ipcRenderer.send('setup-pointer:ready');return ()=>ipcRenderer.removeListener('setup-pointer:play',handler);},done:id=>ipcRenderer.send('setup-pointer:done',id)});

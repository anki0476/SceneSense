const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('startup',{theme:process.argv.includes('--startup-theme=light')?'light':'dark',canAnimate:process.argv.includes('--startup-graphics=1'),done:()=>ipcRenderer.send('startup:done')});

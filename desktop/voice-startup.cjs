function createVoiceStartup(app,{executable=process.execPath,name='SceneSense Voice'}={}){
 // Electron quotes individual arguments when writing the Run command.
 const args=[...(!app.isPackaged?[app.getAppPath()]:[]),'--voice-background'];
 const options={path:executable,args,name};
 return {
  status(){const value=app.getLoginItemSettings(options);const own=value.launchItems?.find(item=>item.name===options.name);return {enabled:own?own.enabled===true:!!value.openAtLogin,available:process.platform==='win32'||process.platform==='darwin'};},
  repair(){const value=app.getLoginItemSettings(options);const own=value.launchItems?.find(item=>item.name===options.name);if(own?.enabled&&own.args?.some(arg=>arg.startsWith('"')))app.setLoginItemSettings({...options,openAtLogin:true});},
  set(enabled){if(typeof enabled!=='boolean')throw Error('Invalid startup preference.');if(!['win32','darwin'].includes(process.platform))throw Error('Launch at startup is not supported on this device.');app.setLoginItemSettings({...options,openAtLogin:enabled});return this.status();}
 };
}
module.exports={createVoiceStartup};

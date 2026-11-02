const {app}=require('electron');
app.whenReady().then(()=>{
 const startup=require('../desktop/voice-startup.cjs').createVoiceStartup({isPackaged:false,getAppPath:()=>require('node:path').resolve(__dirname,'..'),getLoginItemSettings:options=>app.getLoginItemSettings(options),setLoginItemSettings:options=>app.setLoginItemSettings(options)},{name:'SceneSense Startup Diagnostic'});
 try{const enabled=startup.set(true);if(!enabled.enabled)throw Error('Startup enable did not persist');console.log('Windows startup enable readback passed.');const disabled=startup.set(false);if(disabled.enabled)throw Error('Startup disable did not persist');console.log('Windows startup disable readback passed.');}catch(error){console.error(error);process.exitCode=1;}finally{startup.set(false);app.quit();}
});
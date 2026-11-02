// Observe only the configured chord. No typed text or keyboard history is stored.
class HoldShortcut {
  constructor(publish){this.publish=publish;this.held=false;}
  down(event){if(!this.held && event.keycode===this.keys.Z && event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey){this.held=true;this.publish({kind:'voice-press'});}}
  up(event){if(this.held && [this.keys.Z,this.keys.Ctrl,this.keys.CtrlRight,this.keys.Shift,this.keys.ShiftRight].includes(event.keycode))this.release();}
  release(){if(this.held){this.held=false;this.publish({kind:'voice-release'});}}
  start(){
    if(this.hook)return;
    const {uIOhook,UiohookKey}=require('uiohook-napi');this.keys=UiohookKey;
    this.onDown=event=>this.down(event);this.onUp=event=>this.up(event);
    uIOhook.on('keydown',this.onDown);uIOhook.on('keyup',this.onUp);
    try{uIOhook.start();this.hook=uIOhook;}catch(error){uIOhook.off('keydown',this.onDown);uIOhook.off('keyup',this.onUp);throw error;}
  }
  stop(){this.release();if(this.hook){this.hook.off('keydown',this.onDown);this.hook.off('keyup',this.onUp);this.hook.stop();this.hook=null;}}
}
module.exports={HoldShortcut};

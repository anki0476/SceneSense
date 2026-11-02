// Resolve only the known setup controls. This reads layout; it never activates UI.
async function resolveSetupTarget(window,screen,{app,value}){
 if(app!=='scenesense'||!value||!window||window.isDestroyed())return null;
 const names=['Connect OBS','Load sources','Webcam source','Game source','Confirm sources','Open studio'];if(!names.includes(value))return null;
 window.show();window.focus();
 const request=JSON.stringify(value);
 const rect=await window.webContents.executeJavaScript(`(async()=>{const name=${request};for(let attempt=0;attempt<20;attempt++){let target;if(name==='Webcam source'||name==='Game source'){const label=[...document.querySelectorAll('label')].find(x=>x.firstChild?.textContent?.trim()===name&&x.querySelector('select'));target=label?.querySelector('select');}else{target=[...document.querySelectorAll('button')].find(x=>(x.textContent.trim()===name||(name==='Connect OBS'&&x.textContent.trim()==='Reconnect OBS'))&&x.getClientRects().length);}if(target&&!target.disabled){target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});await new Promise(requestAnimationFrame);const r=target.getBoundingClientRect();if(r.width>0&&r.height>0)return {x:r.x,y:r.y,width:r.width,height:r.height};}await new Promise(r=>setTimeout(r,40));}return null;})()`,true);
 if(!rect)return null;
 const bounds=window.getContentBounds(),zoom=window.webContents.getZoomFactor();const dip={x:Math.round(bounds.x+rect.x*zoom),y:Math.round(bounds.y+rect.y*zoom),width:Math.round(rect.width*zoom),height:Math.round(rect.height*zoom)};
 return {...screen.dipToScreenRect(window,dip),name:value};
}
module.exports={resolveSetupTarget};

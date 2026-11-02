const anchors={'top-left':[0,0],'top-right':[1,0],'bottom-left':[0,1],'bottom-right':[1,1]};
for(let row=0;row<5;row++)for(let col=0;col<5;col++){if((row===0||row===4)&&(col===0||col===4))continue;anchors['screen-'+row+'-'+col]=[col/4,row/4];}
function placements(camera,video){
 const result={};for(const scale of [1,.75,.6]){const width=camera.width*scale,height=camera.height*scale;if(scale!==1&&(width<160||height<90))continue;if(width>video.baseWidth-32||height>video.baseHeight-32)continue;
 for(const [name,[x,y]] of Object.entries(anchors)){const id=scale===1?name:name+'-'+Math.round(scale*100);result[id]={label:name.startsWith('screen-')?'Screen position '+Math.round((16+x*(video.baseWidth-width-32))/video.baseWidth*100)+'%, '+Math.round((16+y*(video.baseHeight-height-32))/video.baseHeight*100)+'%':name.replaceAll('-',' '),positionX:16+x*(video.baseWidth-width-32),positionY:16+y*(video.baseHeight-height-32),width,height,scaleX:camera.scaleX*scale,scaleY:camera.scaleY*scale,scale};}}
 return result;
}
module.exports={placements};

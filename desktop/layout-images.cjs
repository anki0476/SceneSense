function imageRegion(rect,width,height){
  if(![rect.x,rect.y,rect.width,rect.height,width,height].every(Number.isFinite)||width<1||height<1||rect.width<=0||rect.height<=0)throw new Error('Invalid image region.');
  const x=Math.max(0,Math.floor(rect.x*width)),y=Math.max(0,Math.floor(rect.y*height));
  const right=Math.min(width,Math.ceil((rect.x+rect.width)*width)),bottom=Math.min(height,Math.ceil((rect.y+rect.height)*height));
  return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
function cropEvidence(nativeImage,image,rects){
  const source=nativeImage.createFromDataURL(image);if(source.isEmpty())throw new Error('OBS game snapshot could not be decoded.');
  const {width,height}=source.getSize();
  return Object.fromEntries(Object.entries({current:rects.current,...rects.candidates}).map(([name,rect])=>{const region=imageRegion(rect,width,height);return [name,region?source.crop(region).toDataURL():null];}));
}
module.exports={imageRegion,cropEvidence};

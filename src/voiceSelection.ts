export function spokenSelection<T extends {name:string}>(items:T[],text:string):T{
  const normalize=(s:string)=>' '+s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';
  const spoken=normalize(text);
  const matches=items.filter(item=>spoken.includes(normalize(item.name))).sort((a,b)=>b.name.length-a.name.length);
  if(!matches.length||(matches.length>1&&matches[0].name.length===matches[1].name.length))throw new Error('Say the exact name shown in the selector.');
  return matches[0];
}

import {useState} from 'react';
export type NewsSource={url:string;title:string;start:number;end:number};
export function NewsReply({text,sources,checkedAt,openSource}:{text:string;sources:NewsSource[];checkedAt?:string;openSource:(url:string)=>Promise<unknown>}){
 const [error,setError]=useState('');const open=async(url:string)=>{try{setError('');await openSource(url);}catch{setError('Could not open that source.');}};
 const parts:React.ReactNode[]=[];let cursor=0;
 const clean=(value:string)=>value.replace(/cite.*?/g,'').replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g,'$1');
 const ordered=[...sources].sort((a,b)=>a.end-b.end);
 ordered.forEach((source,index)=>{if(source.end<cursor||source.end>text.length)return;parts.push(clean(text.slice(cursor,source.end)));parts.push(<button className="news-citation" key={index} title={source.title} onClick={()=>void open(source.url)} aria-label={'Read source: '+source.title}>[{index+1}]</button>);cursor=source.end;});parts.push(clean(text.slice(cursor)));
 const unique=sources.filter((source,index)=>sources.findIndex(x=>x.url===source.url)===index);
 return <section className="sense-news" aria-label="Gaming news briefing"><h3>News briefing</h3>{checkedAt&&<p className="news-time">Checked {new Date(checkedAt).toLocaleString()}</p>}<p className="news-copy">{parts}</p><details open><summary>Sources</summary><ul>{unique.map(source=><li key={source.url}><button className="news-source" onClick={()=>void open(source.url)}>{source.title}</button></li>)}</ul></details>{error&&<p role="alert">{error}</p>}</section>;
}

function bubbleSummary(text,news=false){
 const clean=value=>value.replace(/cite.*?/g,'').replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
 const full=clean(text);if(!news&&full.length<=160)return full;
 let summary=clean(text.match(/^Quick take:\s*(.+)$/im)?.[1]||text.split(/\n\s*\n/)[0]);
 if(summary.length>125){const sentence=summary.match(/^.{20,125}?[.!?](?=\s|$)/)?.[0];summary=sentence||summary.slice(0,122).replace(/\s+\S*$/,'')+'…';}
 return summary+(news?'\n\nFull briefing & sources: Voice.':'\n\nFull reply: Voice.');
}
module.exports={bubbleSummary};

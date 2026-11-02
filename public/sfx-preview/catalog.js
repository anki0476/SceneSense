const sounds=[
 ['Pop','Current · dictation starts',[[520,780,0,.075,.44]]],
 ['Tick','Current · dictation ends',[[420,300,0,.045,.44]]],
 ['Success blip — louder','Current · task completes',[[660,660,0,.09,.30],[880,880,.10,.12,.30],[1100,1100,.23,.18,.30]]],
 ['Soft chime','Alternative · gentle completion','soft-chime.wav'],
 ['Warm bell','Alternative · mellow notification','warm-bell.wav'],
 ['Success blip — original preview','Alternative · softer version','success-blip.wav'],
 ['Glass drop','Alternative · crisp notification','glass-drop.wav'],
 ['Retro coin','Alternative · playful completion','retro-coin.wav'],
 ['Original ting','Previous completion sound',[[1047,1047,0,.17,.07],[1568,1568,.085,.22,.07]]],
 ['Soft tap','New option · button clicks',[[250,180,0,.045,.25]]],
 ['Bubble pop','New option · opening a panel',[[350,950,0,.10,.26]]],
 ['Gentle notice','New option · notifications',[[740,740,0,.16,.23],[988,988,.19,.23,.23]]],
 ['Low double knock','New option · error or attention',[[220,180,0,.10,.26],[220,180,.15,.10,.26]]],
 ['Soft swoop','New option · dismissal',[[640,220,0,.19,.22]]],
];
function wav(notes){
 const rate=44100,length=Math.ceil((Math.max(...notes.map(n=>n[2]+n[3]))+.1)*rate),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);
 const text=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
 text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
 for(let i=0;i<length;i++){let value=0;for(const [from,to,start,duration,peak] of notes){const age=i/rate-start;if(age<0||age>=duration)continue;const k=Math.log(to/from)/duration,phase=2*Math.PI*(Math.abs(k)<1e-8?from*age:from*Math.expm1(k*age)/k);const gain=age<.006?.0001*Math.pow(peak/.0001,age/.006):peak*Math.pow(.0001/peak,(age-.006)/(duration-.006));value+=Math.sin(phase)*gain;}view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,value))*32767),true);}
 return URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
}
const list=document.querySelector('#sound-list');
sounds.forEach(([name,description,source],i)=>{const article=document.createElement('article'),title=document.createElement('h2'),copy=document.createElement('p'),audio=document.createElement('audio');title.textContent=`${i+1}. ${name}`;copy.textContent=description;audio.controls=true;audio.preload='metadata';audio.src=typeof source==='string'?source:wav(source);audio.setAttribute('aria-label',name);audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()}));article.append(title,copy,audio);list.append(article);});

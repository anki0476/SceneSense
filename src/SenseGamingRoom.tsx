import {useState} from 'react';
import {BotAvatar} from 'bot-avatars';
import './sense-gaming-room.css';
export function SenseGamingRoom(){
 const [lights,setLights]=useState(true),[screen,setScreen]=useState(true);
 return <section className={`sense-gaming-room ${lights?'room-lit':''}`} aria-label="Sense’s interactive gaming room">
 <svg viewBox="0 0 900 530" aria-hidden="true">
  <defs>
   <linearGradient id="room-plinth" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#9e9ebc"/><stop offset=".15" stopColor="#656b8d"/><stop offset=".75" stopColor="#242b46"/><stop offset="1" stopColor="#12182c"/></linearGradient>
   <linearGradient id="room-left-wall" x1="0" y1="0" x2="1" y2=".5"><stop stopColor="#8586a7"/><stop offset=".3" stopColor="#555b7c"/><stop offset="1" stopColor="#292e4a"/></linearGradient>
   <linearGradient id="room-bevel"><stop stopColor="#ddd7f1"/><stop offset=".45" stopColor="#9b9db9"/><stop offset="1" stopColor="#424b6b"/></linearGradient>
   <linearGradient id="room-edge" x2="0" y2="1"><stop stopColor="#9d9cb9"/><stop offset=".3" stopColor="#5b617e"/><stop offset="1" stopColor="#252c46"/></linearGradient>
   <linearGradient id="room-chair" x1="0" y1="0" x2="1" y2=".8"><stop stopColor="#a5a9d3"/><stop offset=".18" stopColor="#757da8"/><stop offset=".6" stopColor="#404a77"/><stop offset="1" stopColor="#222c51"/></linearGradient>
   <linearGradient id="room-metal"><stop stopColor="#171e32"/><stop offset=".4" stopColor="#6a7895"/><stop offset=".6" stopColor="#3d4966"/><stop offset="1" stopColor="#151c30"/></linearGradient>
   <radialGradient id="room-floor-light" cx=".38" cy=".28" r=".8"><stop stopColor="#d4cce6"/><stop offset=".45" stopColor="#85829f"/><stop offset="1" stopColor="#3b415e"/></radialGradient>
   <radialGradient id="room-wheel" cx=".3" cy=".2"><stop stopColor="#8b96b2"/><stop offset=".35" stopColor="#414d6a"/><stop offset="1" stopColor="#11182d"/></radialGradient>
   <filter id="room-soft-shadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
   <filter id="room-contact" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="2.5"/></filter>
   <linearGradient id="room-wall" x2="1" y2="1"><stop stopColor="#31334e"/><stop offset="1" stopColor="#171c31"/></linearGradient>
   <linearGradient id="room-floor" x2="0" y2="1"><stop stopColor="#9996b9"/><stop offset="1" stopColor="#42425f"/></linearGradient>
   <linearGradient id="room-desk"><stop stopColor="#ece8ff"/><stop offset="1" stopColor="#9494ba"/></linearGradient>
   <linearGradient id="room-screen" x2="1" y2="1"><stop stopColor="#321b74"/><stop offset=".6" stopColor="#7758d1"/><stop offset="1" stopColor="#3bc6d7"/></linearGradient>
   <radialGradient id="room-glow"><stop stopColor="#a98aff" stopOpacity=".4"/><stop offset="1" stopColor="#a98aff" stopOpacity="0"/></radialGradient>
  </defs>
  <ellipse cx="458" cy="451" rx="335" ry="53" fill="#080b19" opacity=".65" filter="url(#room-soft-shadow)"/>
  <path d="M110 360Q450 205 790 360V393A340 125 0 0 1 110 393Z" fill="url(#room-plinth)"/>
  <ellipse cx="450" cy="360" rx="340" ry="125" fill="url(#room-floor-light)" stroke="#c1b8db" strokeOpacity=".3" strokeWidth="2"/>
  <path d="M115 379A340 125 0 0 0 785 379" stroke="#a89aca" strokeWidth="2" fill="none" opacity=".4"/>
  <path d="M157 349L157 109L365 31L750 139L741 145L366 40L164 115V345Z" fill="url(#room-bevel)"/>
  <path d="M741 145L750 139V366L741 368Z" fill="#10172c"/>
  <path d="M164 345V115L366 40V271Z" fill="url(#room-left-wall)"/>
  <path d="M366 40L741 145V368L366 271Z" fill="url(#room-wall)"/>
  <path d="M366 43V269L740 368" fill="none" stroke="#080d20" strokeWidth="7" opacity=".35"/>
  <path d="M367 44V267" stroke="#ddd5f2" strokeWidth="2" opacity=".3"/>
  <path className="room-led" d="M164 115L366 40L741 145" fill="none" stroke="#d9ceff" strokeWidth="7"/>
  <path d="M182 135L340 78V260L182 324Z" fill="#191f34" stroke="#777b98" strokeWidth="9"/>
  <path d="M190 140L334 88V259L190 316" fill="none" stroke="#070e23" strokeWidth="8" opacity=".7"/>
  <path d="M184 200L340 144L340 153L184 209Z M184 261L340 203L340 212L184 270Z" fill="#151c31"/>
  <path d="M184 199L340 143M184 260L340 202M235 116V301M289 97V279" stroke="#86849e" strokeWidth="7"/>
  <g fill="#7c9c80"><path d="M194 173l18-6 3 22-18 6Z"/><path d="M301 124l18-6 3 22-18 6Z"/></g>
  <g stroke="#68bb88" strokeWidth="5" strokeLinecap="round"><path d="M204 170v-17m0 11-9-8m9 4 8-11M310 122v-19m0 12-9-8m9 2 8-7"/></g>
  <path d="M187 328L339 269V336L187 397Z" fill="url(#room-bevel)"/>
  <path d="M187 328L176 321V390L187 397Z" fill="#525b7a"/>
  <path d="M190 351L338 295M190 375L338 320" stroke="#66677f" strokeWidth="2"/>
  <path d="M250 337l20-8m-20 32 20-8" stroke="#e4dff3" strokeWidth="4"/>
  <ellipse className="room-light-pool" cx="515" cy="290" rx="230" ry="165" fill="url(#room-glow)"/>
  <path d="M342 327L566 394L709 382L531 313Z" fill="#090f25" opacity=".38" filter="url(#room-soft-shadow)"/>
  <ellipse cx="689" cy="432" rx="28" ry="9" fill="#11162b" opacity=".6" filter="url(#room-contact)"/>
  <path d="M357 277V385M680 342V438M696 291V416M454 251V358" stroke="#252b3d" strokeWidth="12"/>
  <path d="M357 385L454 358M680 438L696 416" stroke="#333b50" strokeWidth="10"/>
  <path d="M330 261L458 216L718 287L589 341Z" fill="url(#room-desk)"/>
  <path d="M330 261V278L589 358L718 305V287L589 341Z" fill="url(#room-edge)"/>
  <path d="M331 262L589 341L717 288" stroke="#f1e7ff" strokeOpacity=".7" strokeWidth="2" fill="none"/>
  <path d="M461 247L586 282L613 272L489 235Z" fill="#11152b" opacity=".4" filter="url(#room-contact)"/>
  <path d="M522 257v-36m-28 42 54 15 24-10-51-14" stroke="#262d40" strokeWidth="6" fill="#262d40"/>
  <path d="M460 133L615 176V272L460 229Z" fill="#11182b" stroke="#80849b" strokeWidth="5"/>
  <path d="M615 176L623 171V266L615 272Z" fill="#090f23"/><path d="M460 133L468 129L623 171L615 176Z" fill="#a4a9be"/>
  <path d="M466 141L608 180V260L466 222Z" fill={screen?'url(#room-screen)':'#141a29'}/>
  {screen&&<g fill="none" stroke="#e9dbff" opacity=".6"><path d="M471 205q35-65 69 0t65 7M471 214q35-55 69 0t65 7"/><path d="M484 165l34 9" strokeWidth="3"/></g>}
  <path d="M437 268L491 248L575 272L524 295Z" fill="#36394c" stroke="#d2cce7" strokeWidth="2"/>
  <path d="M451 268l70 20m-57-26 70 20m-57-25 69 20" stroke="#9590b0" strokeWidth="3" strokeDasharray="5 3"/>
  <ellipse cx="610" cy="300" rx="21" ry="10" fill="#42346d"/><ellipse cx="610" cy="297" rx="10" ry="6" fill="#b9acfa"/>
  <g><path d="M410 244v-35m260 96v-40" stroke="#a79570" strokeWidth="7"/><ellipse cx="410" cy="245" rx="16" ry="6" fill="#84725c"/><ellipse cx="670" cy="306" rx="16" ry="6" fill="#84725c"/><path className="room-lamps" d="M399 211l-5-30 31 8-5 27Z M659 270l-6-33 33 9-6 30Z" fill="#6fe3e8"/><path d="M393 181l32 8m228 48 33 9" stroke="#e5ffff" strokeWidth="5"/></g>
  <ellipse cx="419" cy="416" rx="78" ry="24" fill="#11172d" opacity=".65" filter="url(#room-soft-shadow)"/>
  <path d="M380 326l68 18-8 35-63-17Z" fill="#202c50"/>
  <path d="M390 319l56 16q8 3 5 11l-11 23-62-17Z" fill="url(#room-chair)" stroke="#9aa3c5" strokeWidth="2"/>
  <path d="M412 362v39m0-2-45 17m45-17 43 18m-43-18 7 33" stroke="url(#room-metal)" strokeWidth="9" strokeLinecap="round"/>
  {[ [366,419],[455,419],[420,433] ].map(([x,y])=><ellipse key={x} cx={x} cy={y} rx="8" ry="6" fill="url(#room-wheel)"/>)}
  <path d="M368 317l-9-64q-1-15 17-11l72 20q13 4 12 16l-6 61Z" fill="url(#room-chair)" stroke="#9ba4cd" strokeWidth="3"/>
  <path d="M372 309l-7-53q0-7 8-5l70 19q8 2 7 9l-4 46Z" fill="#27345a" stroke="#8995bd" strokeOpacity=".35"/>
  <path d="M373 267l63 18" stroke="#a2aed0" strokeOpacity=".25" strokeWidth="2"/>
  <path d="M360 328v-24l-17-5m103 55 19-9v-26l-22-7" stroke="url(#room-metal)" strokeWidth="7" fill="none" strokeLinecap="round"/>
 </svg>
 <div className="gaming-sense"><BotAvatar type="mech" size={260} interactive state="default" theme="dark"/></div>
 <div className="room-controls"><span>Sense’s room</span><button aria-pressed={lights} onClick={()=>setLights(x=>!x)}>{lights?'Lights on':'Lights off'}</button><button aria-pressed={screen} onClick={()=>setScreen(x=>!x)}>Monitor {screen?'on':'off'}</button></div>
 </section>;
}

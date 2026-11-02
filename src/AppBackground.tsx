import {TopographicFlow} from './components/topographic-flow';
import {useTheme} from './Theme';
import {useBackgroundPreference} from './backgroundPreference';
import {AnimatedBackground} from './AnimatedBackground';

const noGradient = [] as const;

export function AppBackground(){
  const {theme}=useTheme();
  const pref=useBackgroundPreference();
  const ink=theme==='dark'?'#ffffff':'#000000';
  return <div className="app-background" aria-hidden="true">
    {pref.mode==='image'&&pref.image?<img className="custom-app-background" src={pref.image} alt=""/>:pref.mode==='flow'&&pref.animation&&pref.animation!=='topographic'?<AnimatedBackground key={pref.animation} name={pref.animation} theme={theme}/>:pref.mode==='flow'?<TopographicFlow
      animateEntrance={true} scale={480} density={5} speed={1.5}
      distortion={2.4} lineWidth={1} opacity={1} dashLength={7} dashGap={8}
      seed={42} gradientDiffusion={0} paused={false} hover={0}
      hoverRadius={200} hoverFollow={0.16} hoverFade={0.8} hoverEffect="rings"
      backgroundColor={theme==='dark'?'#101014':'#ffffff'} backgroundImage="none"
      gradientColors={noGradient} grain={0} lineColor={ink} accentColor={ink} lineStyle="solid"
    />:null}
  </div>;
}

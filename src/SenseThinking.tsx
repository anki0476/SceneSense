import ThoughtLine from './components/ThoughtLine';
export function SenseThinking({label='Sense is thinking…'}:{label?:string}){
 return <div className="sense-thinking" role="status"><ThoughtLine working label={label.trim()||'Sense is thinking…'} color="var(--sense-thought-ink, #d1cfda)" glyph="sparkle" fontSize={13} breathPeriod={1.6} breathDepth={.45} settleDuration={350} settleBlur={2} collapsible={false} showTimer={false}/></div>;
}

import { useEffect, useRef, useState } from 'react';
type Frame = { image: string; scene: string; capturedAt: number };
export function useProgramPreview(scene: string | undefined, connected: boolean, load: () => Promise<Frame>) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [error, setError] = useState('');
  const loader = useRef(load); loader.current = load;
  const refresh = useRef(() => {});
  useEffect(() => {
    let disposed = false, running = false, again = false;
    let timer: ReturnType<typeof setTimeout>;
    setFrame(null); setError('');
    if (!connected || !scene) { refresh.current = () => {}; return; }
    async function tick() {
      if (disposed) return;
      if (running) { again = true; return; }
      clearTimeout(timer);
      if (document.hidden) { timer = setTimeout(tick, 1000); return; }
      running = true; let failed = false;
      try {
        const next = await loader.current();
        if (!disposed && next.scene === scene) { setFrame(next); setError(''); }
      } catch (e) {
        failed = true;
        if (!disposed) setError(e instanceof Error ? e.message : 'Preview unavailable.');
      } finally {
        running = false;
        if (!disposed) { timer = setTimeout(tick, failed ? 1500 : again ? 0 : 250); again = false; }
      }
    }
    refresh.current = () => { void tick(); };
    const visible = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', visible);
    void tick();
    return () => { disposed = true; clearTimeout(timer); refresh.current = () => {}; document.removeEventListener('visibilitychange', visible); };
  }, [scene, connected]);
  return { frame, error, refresh: () => refresh.current() };
}

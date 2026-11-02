import { useEffect, useRef, useState } from 'react';
export function useSmoothPreview(connected: boolean, prepare: () => Promise<unknown>) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const revision = useRef(0);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  function stop() {
    revision.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false); setStarting(false);
  }
  useEffect(() => { if (!connected) stop(); }, [connected]);
  useEffect(() => () => { revision.current++; stream.current?.getTracks().forEach(track => track.stop()); }, []);
  async function start() {
    stop(); setError(''); setStarting(true);
    const id = revision.current;
    let candidate: MediaStream | undefined;
    try {
      await prepare();
      if (id !== revision.current) return;
      let devices = await navigator.mediaDevices.enumerateDevices();
      // Never open the default/physical webcam just to discover device labels.
      let device = devices.find(x => x.kind === 'videoinput' && /obs.*virtual/i.test(x.label));
      if (!device) {
        await new Promise(resolve => setTimeout(resolve, 700));
        devices = await navigator.mediaDevices.enumerateDevices();
        device = devices.find(x => x.kind === 'videoinput' && /obs.*virtual/i.test(x.label));
      }
      if (id !== revision.current) return;
      if (!device) throw new Error('OBS Virtual Camera is not available to SceneSense. Check that the OBS virtual camera driver is installed, then restart SceneSense.');
      candidate = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: device.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
      if (id !== revision.current) { candidate.getTracks().forEach(x => x.stop()); return; }
      stream.current = candidate;
      if (!video.current) throw new Error('Video preview is unavailable.');
      video.current.srcObject = candidate;
      await video.current.play();
      if (id !== revision.current) return;
      candidate.getVideoTracks()[0].addEventListener('ended', () => { if (id === revision.current) { stop(); setError('Video feed ended. Lightweight preview resumed; enable smooth video to retry.'); } });
      setActive(true);
      return true;
    } catch (e) {
      candidate?.getTracks().forEach(x => x.stop());
      if (id === revision.current) { stop(); setError(e instanceof Error ? e.message : 'Could not open OBS Virtual Camera. Check Windows camera permissions.'); }
      return false;
    } finally { if (id === revision.current) setStarting(false); }
  }
  return { video, active, starting, error, start, stop };
}

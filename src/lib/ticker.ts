// Calls `onTick` about `fps` times a second, even when the window is hidden.
// requestAnimationFrame stops and timers are throttled in background windows, which
// would freeze the recording. Audio keeps running, so each tick is a silent
// oscillator scheduled to end one frame later.
export function startTicker(onTick: () => void, fps: number): () => void {
  const context = new AudioContext();
  const silence = context.createGain();
  silence.gain.value = 0;
  silence.connect(context.destination);
  const frame = 1 / fps;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const oscillator = context.createOscillator();
    oscillator.onended = tick;
    oscillator.connect(silence);
    oscillator.start();
    oscillator.stop(context.currentTime + frame);
    onTick();
  };
  void context.resume().then(tick);

  return () => {
    stopped = true;
    void context.close();
  };
}

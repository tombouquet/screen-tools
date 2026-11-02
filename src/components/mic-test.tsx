import { Check, Loader2, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { captureMicrophone } from '@/lib/capture';
import { cn } from '@/lib/utils';

const HEARD_LEVEL = 0.5;
/** Where the meter turns amber and red, as a share of its length. */
const AMBER_AT = 0.7;
const RED_AT = 0.9;
/** How long the peak marker holds before it falls, in ms. */
const PEAK_HOLD_MS = 1200;

/**
 * A live input meter for the chosen microphone. It only listens while switched on,
 * and lets go of the microphone when switched off or when the page closes.
 */
export function MicTest({ deviceId, onHeard }: { deviceId: string; onHeard?: () => void }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string>();
  const [live, setLive] = useState(false);
  const [level, setLevel] = useState(0);
  const [peakHold, setPeakHold] = useState(0);
  const [heardYou, setHeardYou] = useState(false);
  const peak = useRef(0);
  // Kept in a ref so a new callback doesn't restart the microphone.
  const heard = useRef(onHeard);
  heard.current = onHeard;

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let frame = 0;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let hold = { level: 0, at: 0 };
    setError(undefined);
    setHeardYou(false);

    captureMicrophone(deviceId).then(
      (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        setLive(true);
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(s).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += v * v;
          const rms = Math.sqrt(sum / samples.length);
          // Map -60 dB..0 dB onto 0..1 so speech fills most of the meter.
          const db = 20 * Math.log10(rms || 1e-8);
          const target = Math.min(1, Math.max(0, (db + 60) / 60));
          // Rise fast, fall slowly, so the meter reads smoothly.
          peak.current = target > peak.current ? target : peak.current * 0.92 + target * 0.08;
          setLevel(peak.current);
          // The marker jumps to each new high, holds a moment, then falls.
          const now = performance.now();
          if (peak.current >= hold.level) hold = { level: peak.current, at: now };
          else if (now - hold.at > PEAK_HOLD_MS) hold = { level: Math.max(peak.current, hold.level - 0.01), at: hold.at };
          setPeakHold(hold.level);
          // Above about -30 dB: something more than room noise, so the microphone works.
          if (target > HEARD_LEVEL) {
            setHeardYou(true);
            heard.current?.();
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setOn(false);
      },
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close();
      peak.current = 0;
      setLive(false);
      setLevel(0);
      setPeakHold(0);
    };
  }, [on, deviceId]);

  const starting = on && !live;
  const status = error
    ? `Couldn't open the microphone: ${error}`
    : !on
      ? 'Off. Only listens while the test is on.'
      : starting
        ? 'Starting…'
        : heardYou
          ? 'Sounds good. Keep it out of the red.'
          : 'Listening. Say a few words…';

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        aria-pressed={on}
        aria-label={on ? 'Stop microphone test' : 'Start microphone test'}
        className={cn(
          'focus-visible:ring-ring/50 relative flex size-12 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3',
          on ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {/* A halo that grows with your voice. */}
        {live && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full bg-red-500/30 transition-transform duration-75"
            style={{ transform: `scale(${1 + level * 0.6})` }}
          />
        )}
        <span className="relative">
          {starting ? <Loader2 className="size-5 animate-spin" /> : on ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
        </span>
      </button>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{on ? 'Testing microphone' : 'Test microphone'}</span>
          <span className="text-muted-foreground tabular-nums">{live ? `${Math.round(level * 100)}%` : ''}</span>
        </div>
        <div
          className="bg-muted relative h-3 overflow-hidden rounded-full"
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
        >
          {/* The full green-to-red scale, uncovered up to the current level. */}
          <div
            className="absolute inset-0 rounded-full transition-[clip-path] duration-75"
            style={{
              background: `linear-gradient(to right, #22c55e 0%, #22c55e ${AMBER_AT * 100 - 10}%, #f59e0b ${AMBER_AT * 100}%, #f59e0b ${RED_AT * 100 - 4}%, #ef4444 ${RED_AT * 100}%)`,
              clipPath: `inset(0 ${(1 - level) * 100}% 0 0 round 9999px)`,
            }}
          />
          {live && peakHold > 0.02 && (
            <div className="bg-foreground/70 absolute inset-y-0 w-0.5 rounded-full" style={{ left: `calc(${peakHold * 100}% - 1px)` }} />
          )}
          {/* Faint marks where amber and red start. */}
          {[AMBER_AT, RED_AT].map((at) => (
            <div key={at} className="bg-background/60 absolute inset-y-0 w-px" style={{ left: `${at * 100}%` }} />
          ))}
        </div>
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            error ? 'text-destructive' : heardYou && on ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
          )}
        >
          {heardYou && on && !error && <Check className="size-3.5" />}
          {status}
        </p>
      </div>
    </div>
  );
}

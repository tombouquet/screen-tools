import {
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/formats';
import { cn } from '@/lib/utils';

const SKIP_SECONDS = 5;
const SPEEDS = [1, 1.25, 1.5, 2, 0.5] as const;
/** Controls hide after this long without the pointer moving, while playing. */
const IDLE_MS = 2500;

const formatTime = (seconds: number) => formatDuration(seconds * 1000);

/**
 * Plays a recording with our own controls instead of the browser's: play, skip, a
 * scrubber, volume, speed, picture in picture and full screen. The controls hide
 * while it plays and come back when the pointer moves.
 *
 * Keys, unless focus is in a form field: space or K plays and pauses, ←/→ skip, M
 * mutes, F goes full screen.
 *
 * `durationMs` is the length the recorder measured. A WebM straight from MediaRecorder
 * has no duration in its header until it's made seekable, so it's shown until the
 * browser works the real one out.
 */
/** With `fill`, it takes its parent's height and letterboxes the video, instead of a 16:9 box. */
export function RecordedVideo({ blob, durationMs, fill }: { blob: Blob; durationMs?: number; fill?: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [active, setActive] = useState(true);
  const idleTimer = useRef<number>(undefined);
  // True while the length of a header-less WebM is being found; its seeks aren't real.
  const findingDuration = useRef(false);
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;

  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    setTime(0);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  // Smooth progress while playing; timeupdate only fires a few times a second.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      if (video.current && !findingDuration.current) setTime(video.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const togglePlay = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = video.current;
    if (!el) return;
    const end = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.min(end, Math.max(0, seconds));
    setTime(el.currentTime);
  }, []);

  const skip = useCallback((seconds: number) => seek((video.current?.currentTime ?? 0) + seconds), [seek]);

  const toggleMute = useCallback(() => {
    const el = video.current;
    if (!el) return;
    // Unmuting at zero volume would still be silent, so bring it back up.
    if (el.muted || el.volume === 0) {
      el.muted = false;
      if (el.volume === 0) el.volume = 0.5;
    } else {
      el.muted = true;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen();
  }, []);

  const togglePip = () => {
    const el = video.current;
    if (!el) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else void el.requestPictureInPicture();
  };

  const nextSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    if (video.current) video.current.playbackRate = next;
    setSpeed(next);
  };

  /** Shows the controls, and hides them again after a while if it's playing. */
  const wake = useCallback(() => {
    setActive(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setActive(false), IDLE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, [role="slider"], [contenteditable="true"]')) return;
      // Leave keys alone while a dialog (e.g. the save dialog) is open over the player.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'k') togglePlay();
      else if (key === 'arrowleft') skip(-SKIP_SECONDS);
      else if (key === 'arrowright') skip(SKIP_SECONDS);
      else if (key === 'm') toggleMute();
      else if (key === 'f') toggleFullscreen();
      else return;
      event.preventDefault();
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, skip, toggleMute, toggleFullscreen, wake]);

  const onLoadedMetadata = () => {
    const el = video.current;
    if (!el) return;
    if (Number.isFinite(el.duration)) {
      setDuration(el.duration);
      return;
    }
    // Seeking far past the end makes Chrome read the whole file and report the real length.
    findingDuration.current = true;
    el.currentTime = Number.MAX_SAFE_INTEGER;
  };

  const onDurationChange = () => {
    const el = video.current;
    if (!el || !Number.isFinite(el.duration)) return;
    setDuration(el.duration);
    if (findingDuration.current) {
      findingDuration.current = false;
      el.currentTime = 0;
      setTime(0);
    }
  };

  const onProgress = () => {
    const el = video.current;
    if (!el || !el.buffered.length) return;
    setBuffered(el.buffered.end(el.buffered.length - 1));
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const showControls = !playing || active;

  return (
    <div
      ref={frame}
      className={cn(
        'group/player relative w-full overflow-hidden bg-black select-none',
        fullscreen ? 'h-full' : fill ? 'h-full rounded-lg' : 'aspect-video rounded-lg',
        !showControls && 'cursor-none',
      )}
      onPointerMove={wake}
      onPointerLeave={() => playing && setActive(false)}
      onFocus={wake}
    >
      <video
        ref={video}
        src={url}
        playsInline
        className="size-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          wake();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onDurationChange}
        onTimeUpdate={() => !findingDuration.current && video.current && setTime(video.current.currentTime)}
        onProgress={onProgress}
        onVolumeChange={() => {
          if (!video.current) return;
          setVolume(video.current.volume);
          setMuted(video.current.muted);
        }}
      />

      {!playing && (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlay}
          className="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
        >
          <Play className="ml-1 size-7 fill-current" />
        </button>
      )}

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/40 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-200',
          showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <Track
          label="Seek"
          value={time}
          max={duration}
          buffered={buffered}
          step={SKIP_SECONDS}
          format={formatTime}
          onChange={seek}
        />
        <div className="mt-1.5 flex items-center gap-1">
          <ControlButton label={playing ? 'Pause (K)' : 'Play (K)'} icon={playing ? Pause : Play} onClick={togglePlay} filled />
          <ControlButton label={`Back ${SKIP_SECONDS} seconds (←)`} icon={RotateCcw} onClick={() => skip(-SKIP_SECONDS)} />
          <ControlButton label={`Forward ${SKIP_SECONDS} seconds (→)`} icon={RotateCw} onClick={() => skip(SKIP_SECONDS)} />
          <div className="group/volume flex items-center">
            <ControlButton label={muted ? 'Unmute (M)' : 'Mute (M)'} icon={VolumeIcon} onClick={toggleMute} />
            <div className="w-0 overflow-hidden transition-[width] duration-200 group-focus-within/volume:w-20 group-hover/volume:w-20">
              <div className="w-20 px-2">
                <Track
                  label="Volume"
                  value={muted ? 0 : volume}
                  max={1}
                  step={0.1}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => {
                    if (!video.current) return;
                    video.current.volume = v;
                    video.current.muted = v === 0;
                  }}
                />
              </div>
            </div>
          </div>
          <span className="ml-1 text-xs tabular-nums text-white/90">
            {formatTime(time)} / {duration ? formatTime(duration) : '–:––'}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Playback speed"
                    onClick={nextSpeed}
                    className="h-8 min-w-11 rounded-md px-2 text-xs font-semibold tabular-nums hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                  />
                }
              >
                {speed}×
              </TooltipTrigger>
              <TooltipContent>Playback speed</TooltipContent>
            </Tooltip>
            {pipSupported && <ControlButton label="Picture in picture" icon={PictureInPicture2} onClick={togglePip} />}
            <ControlButton
              label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
              icon={fullscreen ? Minimize : Maximize}
              onClick={toggleFullscreen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  icon: Icon,
  onClick,
  filled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  filled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex size-8 items-center justify-center rounded-md hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          />
        }
      >
        <Icon className={cn('size-[18px]', filled && 'fill-current')} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A slider for the dark control bar: drag or click to set, arrow keys to step, and a
 * label over the pointer while hovering. Used for both seeking and volume.
 */
function Track({
  label,
  value,
  max,
  buffered = 0,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  buffered?: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number>();
  const [dragging, setDragging] = useState(false);
  const fraction = (v: number) => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0);

  const valueAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * max;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!max) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onChange(valueAt(event.clientX));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!max) return;
    const at = valueAt(event.clientX);
    setHover(at);
    if (dragging) onChange(at);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? value - step
        : event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? value + step
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? max
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onChange(Math.min(max, Math.max(0, next)));
  };

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      className="group/track relative flex h-4 cursor-pointer touch-none items-center rounded-full focus-visible:outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() => setHover(undefined)}
      onKeyDown={onKeyDown}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/track:h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${fraction(buffered) * 100}%` }} />
        {hover !== undefined && (
          <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${fraction(hover) * 100}%` }} />
        )}
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: `${fraction(value) * 100}%` }} />
      </div>
      <div
        className={cn(
          'absolute size-3 -translate-x-1/2 rounded-full bg-white shadow transition-transform group-focus-visible/track:scale-100 group-focus-visible/track:ring-2 group-focus-visible/track:ring-white/60 group-hover/track:scale-100',
          dragging ? 'scale-100' : 'scale-0',
        )}
        style={{ left: `${fraction(value) * 100}%` }}
      />
      {hover !== undefined && (
        <div
          className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
          style={{ left: `${fraction(hover) * 100}%` }}
        >
          {format(hover)}
        </div>
      )}
    </div>
  );
}

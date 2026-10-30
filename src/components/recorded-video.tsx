import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const SKIP_SECONDS = 5;

/**
 * Plays a recorded blob with native controls plus skip buttons. Space toggles play,
 * ←/→ skip, unless focus is in a form field.
 */
export function RecordedVideo({ blob }: { blob: Blob }) {
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string>();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  const skip = (seconds: number) => {
    const el = video.current;
    if (!el) return;
    const end = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.min(end, Math.max(0, el.currentTime + seconds));
  };
  const togglePlay = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, [role="slider"], video')) return;
      if (event.key === ' ') togglePlay();
      else if (event.key === 'ArrowLeft') skip(-SKIP_SECONDS);
      else if (event.key === 'ArrowRight') skip(SKIP_SECONDS);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-3">
      <video
        ref={video}
        src={url}
        controls
        className="aspect-video w-full rounded-lg bg-black"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="flex items-center justify-center gap-2">
        <IconButton label={`Back ${SKIP_SECONDS} seconds (←)`} onClick={() => skip(-SKIP_SECONDS)}>
          <RotateCcw />
        </IconButton>
        <IconButton label={playing ? 'Pause (space)' : 'Play (space)'} onClick={togglePlay}>
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton label={`Forward ${SKIP_SECONDS} seconds (→)`} onClick={() => skip(SKIP_SECONDS)}>
          <RotateCw />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" size="icon" onClick={onClick} aria-label={label} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Animated help scenes: a made-up browser window acting out each task, built from
// themed HTML so it follows light and dark mode. Sizes are in container units (cqw),
// so a scene scales to any width. The keyframes are in help-graphics.css.
//
// A scene shows one still frame until it's hovered, focused or tapped, then plays from
// the start, so a page of them stays calm. With reduced motion it never plays.
import {
  Camera,
  Check,
  Circle,
  Crop,
  Eye,
  Grid3x3,
  Loader2,
  Lock,
  Mic,
  Monitor,
  MoveUpRight,
  Pencil,
  Pin,
  Play,
  Puzzle,
  ScrollText,
  Square,
  SquareDashedMousePointer,
  Type,
  Unplug,
  type LucideIcon,
} from 'lucide-react';
import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { MonitorCamera } from '@/components/icons';
import { cn } from '@/lib/utils';
import './help-graphics.css';

/** An animation on the scene's shared loop. */
const loop = (name: string) => `hg-${name} var(--hg-dur) ease-in-out infinite`;

/** Where the extension's icon sits in the made-up toolbar, in % of the scene. */
const ICON = { x: 76, y: 14 };

const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeReduced = (listener: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const useReducedMotion = () => useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches);

function Scene({
  label,
  seconds,
  still,
  className,
  children,
}: {
  /** What the scene shows, for screen readers. */
  label: string;
  /** Length of one loop. */
  seconds: number;
  /** The moment, in seconds, shown as a still picture with reduced motion. */
  still: number;
  className?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  // Bumped on each play, so the scene remounts and starts from the beginning.
  const [run, setRun] = useState(0);
  const play = () => {
    if (reduced || playing) return;
    setPlaying(true);
    setRun((n) => n + 1);
  };
  const stop = () => setPlaying(false);

  return (
    <div
      role="img"
      aria-label={label}
      tabIndex={reduced ? undefined : 0}
      data-playing={playing || undefined}
      onPointerEnter={(event) => event.pointerType === 'mouse' && play()}
      onPointerLeave={(event) => event.pointerType === 'mouse' && stop()}
      // Touch and pen have no hover, so a tap plays and pauses.
      onPointerDown={(event) => event.pointerType !== 'mouse' && (playing ? stop() : play())}
      onFocus={play}
      onBlur={stop}
      className={cn(
        'hg @container bg-background focus-visible:ring-ring/50 relative aspect-[16/10] overflow-hidden rounded-xl border outline-none select-none focus-visible:ring-3',
        className,
      )}
      style={{ '--hg-dur': `${seconds}s`, '--hg-still': `${still}s` } as CSSProperties}
    >
      <div key={run} aria-hidden="true" className="absolute inset-0">
        {children}
      </div>
      {!reduced && !playing && (
        <span
          aria-hidden="true"
          className="bg-background/90 text-muted-foreground absolute right-[2.5%] bottom-[3.5%] z-40 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur"
        >
          <Play className="size-3 fill-current" /> Hover to play
        </span>
      )}
    </div>
  );
}

/** Tab strip and toolbar, with the extension's icon pinned unless `pinned` is false. */
function BrowserChrome({ pinned = true }: { pinned?: boolean }) {
  return (
    <>
      <div className="bg-muted absolute inset-x-0 top-0 h-[9%]">
        <div className="absolute top-1/2 left-[2%] flex -translate-y-1/2 gap-[0.7cqw]">
          {['bg-red-400', 'bg-amber-400', 'bg-green-400'].map((colour) => (
            <span key={colour} className={cn('size-[1.1cqw] rounded-full', colour)} />
          ))}
        </div>
        <div className="bg-background absolute bottom-0 left-[9%] flex h-[75%] w-[22%] items-center rounded-t-[0.8cqw] px-[1cqw]">
          <span className="bg-muted-foreground/40 h-[0.8cqw] w-3/4 rounded-full" />
        </div>
      </div>
      <div className="bg-background absolute inset-x-0 top-[9%] h-[10%] border-b" />
      <div className="bg-muted absolute top-[11.2%] left-[3%] flex h-[5.6%] w-[62%] items-center gap-[0.8cqw] rounded-full px-[1.2cqw]">
        <Lock className="text-muted-foreground size-[1.3cqw]" />
        <span className="bg-muted-foreground/30 h-[0.8cqw] w-2/5 rounded-full" />
      </div>
      {pinned && <AppIcon className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${ICON.x}%`, top: `${ICON.y}%` }} />}
      <Puzzle
        className="text-muted-foreground absolute size-[2.2cqw] -translate-x-1/2 -translate-y-1/2"
        style={{ left: '83.5%', top: '14%' }}
      />
      <span
        className="absolute size-[2.4cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500"
        style={{ left: '91%', top: '14%' }}
      />
    </>
  );
}

function AppIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return <img src="/icon/48.png" alt="" draggable={false} className={cn('size-[3cqw] rounded-[0.6cqw]', className)} style={style} />;
}

/** A made-up web page under the toolbar: a heading, some text, stat cards and a chart. */
function FakePage() {
  return (
    <div className="absolute inset-x-0 top-[19%] bottom-0 flex flex-col gap-[1.6cqw] px-[5cqw] py-[3cqw]">
      <span className="bg-foreground/80 h-[2.2cqw] w-[30%] rounded-[0.5cqw]" />
      <span className="bg-muted-foreground/25 h-[1cqw] w-[55%] rounded-full" />
      <div className="grid grid-cols-3 gap-[1.6cqw]">
        {['bg-indigo-500/15', 'bg-emerald-500/15', 'bg-amber-500/15'].map((colour) => (
          <div key={colour} className={cn('flex h-[7cqw] flex-col justify-center gap-[0.8cqw] rounded-[0.8cqw] px-[1.4cqw]', colour)}>
            <span className="bg-muted-foreground/40 h-[0.8cqw] w-2/5 rounded-full" />
            <span className="bg-foreground/70 h-[1.6cqw] w-3/5 rounded-[0.4cqw]" />
          </div>
        ))}
      </div>
      <div className="bg-muted/60 flex flex-1 items-end gap-[1.4cqw] rounded-[0.8cqw] px-[2cqw] pb-[1.6cqw]">
        {[45, 70, 55, 85, 60, 95, 75].map((height, i) => (
          <span key={i} className={cn('flex-1 rounded-t-[0.5cqw]', i === 5 ? 'bg-indigo-500' : 'bg-indigo-300/70')} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

/** The mouse pointer, moved by a scene's `<name>-cursor` keyframes. Its tip is the point. */
function Cursor({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute z-30 h-[3.2cqw] w-[3.2cqw] drop-shadow-md"
      style={{ animation: loop(`${name}-cursor`), marginLeft: '-0.67cqw', marginTop: '-0.4cqw' }}
    >
      <path d="M5 3l14 7.5-6.2 1.6L10 18z" fill="#0a0a0a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** A ripple where the pointer clicks, `at` a fraction of the way through the loop. */
function Click({ x, y, at }: { x: number; y: number; at: number }) {
  return (
    <span
      className="hg-transient bg-foreground/40 absolute z-20 size-[4.5cqw] rounded-full opacity-0"
      style={{ left: `${x}%`, top: `${y}%`, animation: `hg-click var(--hg-dur) calc(var(--hg-dur) * ${at}) infinite` }}
    />
  );
}

/** A dark pill near the bottom, like the app's toasts. */
function Toast({ animation, children }: { animation: string; children: ReactNode }) {
  return (
    <div
      className="bg-foreground text-background absolute bottom-[6%] left-1/2 z-20 flex items-center gap-[0.8cqw] rounded-full px-[1.8cqw] py-[0.9cqw] text-[1.6cqw] font-medium whitespace-nowrap shadow-lg"
      style={{ animation: loop(animation) }}
    >
      {children}
    </div>
  );
}

/** The recording state: a red frame around the page, REC on the icon and a running timer. */
function Recording({ animation }: { animation: string }) {
  return (
    <div className="absolute inset-0" style={{ animation: loop(animation) }}>
      <div className="border-record absolute inset-x-0 top-[19%] bottom-0 border-[0.45cqw]" />
      <span
        className="bg-record absolute -translate-x-1/2 -translate-y-1/2 rounded-[0.4cqw] px-[0.5cqw] text-[1.1cqw] leading-[1.6cqw] font-bold text-white"
        style={{ left: `${ICON.x}%`, top: `${ICON.y + 4}%` }}
      >
        <span style={{ animation: 'hg-blink 1.2s ease-in-out infinite' }}>REC</span>
      </span>
      <div className="bg-foreground text-background absolute bottom-[5%] left-[3%] flex items-center gap-[0.6cqw] rounded-full px-[1.2cqw] py-[0.6cqw] text-[1.4cqw] font-medium tabular-nums">
        <span className="bg-record size-[1cqw] rounded-full" style={{ animation: 'hg-blink 1.2s ease-in-out infinite' }} />
        0:04
      </div>
    </div>
  );
}

const POPUP_ROWS: { label: string; icon: LucideIcon; top: number; dark?: boolean; toggle?: boolean }[] = [
  { label: 'Screen', icon: Monitor, top: 4.4 },
  { label: 'Camera', icon: Camera, top: 8.2 },
  { label: 'Screen + camera', icon: MonitorCamera, top: 12 },
  { label: 'Microphone', icon: Mic, top: 15.8, toggle: true },
  { label: 'Selected area', icon: SquareDashedMousePointer, top: 20.4, dark: true },
  { label: 'Visible area', icon: Eye, top: 24.2, dark: true },
  { label: 'Full page', icon: ScrollText, top: 28, dark: true },
];

/**
 * The toolbar popup, under the icon. Row tops are in cqw from the popup's top, so the
 * cursor keyframes can aim at them: row 0 (Screen) is at 29.4% and row 4 (Selected
 * area) at 55% of the scene's height.
 */
function Popup({ animation, hover }: { animation: string; hover: { row: number; animation: string } }) {
  const row = POPUP_ROWS[hover.row]!;
  return (
    <div
      className="bg-popover absolute top-[20%] left-[58%] z-10 h-[32.2cqw] w-[34cqw] origin-top-right rounded-[1.2cqw] border shadow-xl"
      style={{ animation: loop(animation) }}
    >
      <div className="absolute top-[1.2cqw] left-[1.2cqw] flex items-center gap-[0.6cqw] text-[1.5cqw] font-semibold">
        <AppIcon className="size-[2.2cqw]" />
        Screen Tools
      </div>
      <span className="bg-border absolute top-[19.6cqw] right-[1.2cqw] left-[1.2cqw] h-px" />
      {POPUP_ROWS.map(({ label, icon: Icon, top, dark, toggle }) => (
        <div
          key={label}
          className={cn(
            'absolute right-[1.2cqw] left-[1.2cqw] flex h-[3cqw] items-center gap-[0.8cqw] rounded-[0.8cqw] px-[1cqw] text-[1.4cqw]',
            dark ? 'bg-foreground text-background' : 'border',
          )}
          style={{ top: `${top}cqw` }}
        >
          <Icon className="size-[1.6cqw]" />
          {label}
          {toggle && (
            <span className="bg-foreground ml-auto flex h-[1.6cqw] w-[2.8cqw] items-center justify-end rounded-full p-[0.25cqw]">
              <span className="bg-background size-[1.1cqw] rounded-full" />
            </span>
          )}
        </div>
      ))}
      <div
        className={cn(
          'absolute right-[1.2cqw] left-[1.2cqw] h-[3cqw] rounded-[0.8cqw] ring-[0.3cqw]',
          row.dark ? 'ring-record bg-white/15' : 'ring-foreground/30 bg-accent/60',
        )}
        style={{ top: `${row.top}cqw`, animation: loop(hover.animation) }}
      />
    </div>
  );
}

export function PinScene({ className }: { className?: string }) {
  return (
    <Scene label="Opening the extensions menu and pinning Screen Tools to the toolbar" seconds={8} still={3.7} className={className}>
      <BrowserChrome pinned={false} />
      <FakePage />
      <AppIcon className="absolute" style={{ left: `${ICON.x}%`, top: `${ICON.y}%`, animation: loop('pin-icon') }} />
      <div
        className="bg-foreground text-background absolute top-[20%] z-10 rounded-[0.6cqw] px-[1cqw] py-[0.5cqw] text-[1.3cqw] font-medium whitespace-nowrap"
        style={{ left: `${ICON.x}%`, animation: loop('pin-tip') }}
      >
        Screen Tools
      </div>
      <div
        className="bg-popover absolute top-[19%] left-[62%] z-10 h-[13.2cqw] w-[32cqw] rounded-[1.2cqw] border shadow-xl"
        style={{ animation: loop('pin-menu') }}
      >
        <div className="absolute top-[1.2cqw] left-[1.4cqw] text-[1.4cqw] font-semibold">Extensions</div>
        <div className="absolute top-[4.6cqw] right-[1.2cqw] left-[1.2cqw] flex h-[3.4cqw] items-center gap-[0.8cqw] text-[1.4cqw]">
          <AppIcon className="size-[2.2cqw]" />
          Screen Tools
          <span className="relative ml-auto size-[1.8cqw]">
            <Pin className="text-muted-foreground absolute inset-0 size-full" />
            <Pin className="text-foreground absolute inset-0 size-full fill-current" style={{ animation: loop('pin-fill') }} />
          </span>
        </div>
        <div className="text-muted-foreground absolute top-[8.6cqw] right-[1.2cqw] left-[1.2cqw] flex h-[3.4cqw] items-center gap-[0.8cqw] text-[1.4cqw]">
          <span className="bg-muted size-[2.2cqw] rounded-[0.5cqw]" />
          <span className="bg-muted-foreground/30 h-[0.9cqw] w-2/5 rounded-full" />
          <Pin className="ml-auto size-[1.8cqw]" />
        </div>
      </div>
      <Click x={83.5} y={14} at={0.19} />
      <Click x={91} y={29} at={0.39} />
      <Cursor name="pin" />
    </Scene>
  );
}

export function RecordScene({ className }: { className?: string }) {
  return (
    <Scene label="Clicking the toolbar icon, picking Screen, a 3-second countdown, then recording" seconds={9} still={7.5} className={className}>
      <BrowserChrome />
      <FakePage />
      <Popup animation="rec-popup" hover={{ row: 0, animation: 'rec-hover' }} />
      <div className="absolute inset-x-0 top-[19%] bottom-0 z-10 bg-black/45" style={{ animation: loop('rec-dim') }}>
        {(['3', '2', '1'] as const).map((digit) => (
          <span
            key={digit}
            className="absolute inset-0 grid place-items-center text-[14cqw] font-bold text-white drop-shadow-lg"
            style={{ animation: loop(`rec-${digit}`) }}
          >
            {digit}
          </span>
        ))}
      </div>
      <Recording animation="rec-on" />
      <Click x={ICON.x} y={ICON.y} at={0.16} />
      <Click x={68} y={29.4} at={0.3} />
      <Cursor name="rec" />
    </Scene>
  );
}

export function StopScene({ className }: { className?: string }) {
  return (
    <Scene label="Clicking the toolbar icon to stop, then saving the recording" seconds={9} still={6.8} className={className}>
      <BrowserChrome />
      <FakePage />
      <Recording animation="stop-rec" />
      <div
        className="bg-card absolute top-[26%] left-[18%] z-10 h-[66%] w-[64%] overflow-hidden rounded-[1.2cqw] border shadow-xl"
        style={{ animation: loop('stop-card') }}
      >
        <div className="relative grid h-[72%] place-items-center bg-gradient-to-br from-indigo-900 via-violet-700 to-orange-500">
          <span className="grid size-[5cqw] place-items-center rounded-full bg-white/90 text-black">
            <Play className="ml-[0.3cqw] size-[2.4cqw] fill-current" />
          </span>
          <span className="absolute right-[1cqw] bottom-[1cqw] rounded-[0.4cqw] bg-black/70 px-[0.6cqw] text-[1.2cqw] text-white tabular-nums">0:42</span>
        </div>
        <div className="flex h-[28%] items-center gap-[0.8cqw] px-[1.6cqw]">
          <div className="space-y-[0.4cqw]">
            <div className="text-[1.5cqw] font-semibold">Screen recording</div>
            <div className="text-muted-foreground text-[1.2cqw]">0:42 · MP4</div>
          </div>
          <span className="ml-auto flex h-[3.2cqw] w-[10cqw] items-center justify-center rounded-[0.7cqw] border text-[1.3cqw]">Share link</span>
          <span className="bg-foreground text-background relative flex h-[3.2cqw] w-[11cqw] items-center justify-center rounded-[0.7cqw] text-[1.3cqw] font-medium">
            <span className="absolute" style={{ animation: loop('stop-save') }}>
              Download
            </span>
            <span className="absolute flex items-center gap-[0.4cqw]" style={{ animation: loop('stop-saved') }}>
              <Check className="size-[1.5cqw]" /> Saved
            </span>
          </span>
        </div>
      </div>
      <Click x={ICON.x} y={ICON.y} at={0.18} />
      <Click x={75} y={83} at={0.5} />
      <Cursor name="stop" />
    </Scene>
  );
}

export function ScreenshotScene({ className }: { className?: string }) {
  return (
    <Scene label="Clicking Capture selected area in the popup and dragging over part of the page" seconds={9} still={5.7} className={className}>
      <BrowserChrome />
      <FakePage />
      <Popup animation="shot-popup" hover={{ row: 4, animation: 'shot-hover' }} />
      <div className="absolute inset-x-0 top-[19%] bottom-0 z-10 bg-black/40" style={{ animation: loop('shot-dim') }} />
      <div
        className="absolute top-[36%] left-[22%] z-10 border-[0.3cqw] border-dashed border-white bg-white/20"
        style={{ animation: loop('shot-rect') }}
      />
      <div className="absolute inset-x-0 top-[19%] bottom-0 z-10 bg-white" style={{ animation: loop('shot-flash') }} />
      <Toast animation="shot-toast">
        <Check className="size-[1.6cqw]" /> Opens in the editor
      </Toast>
      <Click x={ICON.x} y={ICON.y} at={0.15} />
      <Click x={70} y={55} at={0.28} />
      <Click x={22} y={36} at={0.4} />
      <Cursor name="shot" />
    </Scene>
  );
}

const TOOLS: { icon: LucideIcon; animation?: string }[] = [
  { icon: Square, animation: 'ann-tool-rect' },
  { icon: MoveUpRight, animation: 'ann-tool-arrow' },
  { icon: Circle },
  { icon: Pencil },
  { icon: Type, animation: 'ann-tool-text' },
  { icon: Grid3x3 },
  { icon: Crop },
];

export function AnnotateScene({ className }: { className?: string }) {
  return (
    <Scene label="Drawing a box, an arrow and a note on a screenshot, then clicking Share link" seconds={10} still={8} className={className}>
      <BrowserChrome />
      {/* Editor toolbar */}
      <div className="bg-card absolute top-[22%] right-[3%] left-[3%] flex h-[8%] items-center gap-[0.4cqw] rounded-[1cqw] border px-[1cqw]">
        {TOOLS.map(({ icon: Icon, animation }, i) => (
          <span key={i} className="relative grid size-[2.8cqw] place-items-center rounded-[0.6cqw]">
            {animation && <span className="bg-accent ring-foreground/20 absolute inset-0 rounded-[0.6cqw] ring-1" style={{ animation: loop(animation) }} />}
            <Icon className="relative size-[1.6cqw]" />
          </span>
        ))}
        <span className="bg-border mx-[0.6cqw] h-[55%] w-px" />
        {['bg-red-500', 'bg-amber-500', 'bg-green-500', 'bg-blue-500'].map((colour, i) => (
          <span key={colour} className={cn('size-[1.8cqw] rounded-full', colour, i === 0 && 'ring-foreground/40 ring-[0.25cqw] ring-offset-1')} />
        ))}
      </div>
      {/* Share link: 77.2% to 88.2% across, so 82.5% is its middle */}
      <span
        className="bg-foreground text-background absolute top-[23.2%] z-10 flex h-[5.6%] w-[11cqw] items-center justify-center rounded-[0.7cqw] text-[1.3cqw] font-medium"
        style={{ left: '77.2%' }}
      >
        <span className="absolute" style={{ animation: loop('ann-share') }}>
          Share link
        </span>
        <span className="absolute flex items-center gap-[0.4cqw]" style={{ animation: loop('ann-uploading') }}>
          <Loader2 className="size-[1.4cqw]" style={{ animation: 'hg-spin 0.9s linear infinite' }} /> Uploading
        </span>
        <span className="absolute flex items-center gap-[0.4cqw]" style={{ animation: loop('ann-copied') }}>
          <Check className="size-[1.4cqw]" /> Copied
        </span>
      </span>
      <span className="absolute top-[23.2%] left-[89%] flex h-[5.6%] w-[7cqw] items-center justify-center rounded-[0.7cqw] border text-[1.3cqw]">
        Copy
      </span>
      {/* The screenshot being marked up */}
      <div className="bg-muted/50 absolute top-[33%] right-[3%] bottom-[4%] left-[3%] rounded-[1cqw] border" />
      {[9, 37, 65].map((left, i) => (
        <div
          key={left}
          className={cn(
            'absolute top-[38%] flex h-[14%] w-[25%] flex-col justify-center gap-[0.6cqw] rounded-[0.8cqw] px-[1.4cqw]',
            ['bg-indigo-500/15', 'bg-emerald-500/15', 'bg-amber-500/15'][i],
          )}
          style={{ left: `${left}%` }}
        >
          <span className="bg-muted-foreground/40 h-[0.8cqw] w-2/5 rounded-full" />
          <span className="bg-foreground/70 h-[1.6cqw] w-3/5 rounded-[0.4cqw]" />
        </div>
      ))}
      {[14, 20, 17, 22, 28, 24, 18].map((height, i) => (
        <span
          key={i}
          className={cn('absolute bottom-[8%] w-[7%] rounded-t-[0.5cqw]', i === 4 ? 'bg-indigo-500' : 'bg-indigo-300/70')}
          style={{ left: `${12 + i * 11}%`, height: `${height}%` }}
        />
      ))}
      {/* Annotations */}
      <div
        className="absolute top-[37%] left-[8%] h-[16%] w-[27%] origin-top-left rounded-[0.4cqw] border-[0.4cqw] border-red-500"
        style={{ animation: loop('ann-rect') }}
      />
      <svg viewBox="0 0 160 100" className="absolute inset-0 size-full overflow-visible">
        <path
          d="M48 66 L90 63"
          pathLength={100}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="100"
          style={{ animation: loop('ann-arrow') }}
        />
        <path
          d="M86.6 60.6 L90 63 L86.9 65.8"
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ animation: loop('ann-head') }}
        />
      </svg>
      <span
        className="absolute top-[60%] left-[12%] origin-left text-[2.6cqw] font-bold whitespace-nowrap text-red-500"
        style={{ animation: loop('ann-text') }}
      >
        Busiest day
      </span>
      <Toast animation="ann-toast">
        <Check className="size-[1.6cqw]" /> Link copied, ready to paste
      </Toast>
      <Click x={8} y={37} at={0.1} />
      <Click x={30} y={66} at={0.3} />
      <Click x={14} y={62} at={0.47} />
      <Click x={82.5} y={26} at={0.63} />
      <Cursor name="ann" />
    </Scene>
  );
}

export function RecoveryScene({ className }: { className?: string }) {
  return (
    <Scene label="A recording saved every few seconds, the browser closing, and the recording recovered in Videos" seconds={10} still={7.8} className={className}>
      <BrowserChrome />
      <FakePage />
      <div className="absolute inset-0">
        <Recording animation="recov-rec" />
        {[0.06, 0.17, 0.28].map((at) => (
          <div
            key={at}
            className="hg-transient bg-background absolute right-[3%] bottom-[5%] flex items-center gap-[0.5cqw] rounded-full border px-[1.2cqw] py-[0.6cqw] text-[1.3cqw] font-medium opacity-0 shadow"
            style={{ animation: `hg-tick var(--hg-dur) calc(var(--hg-dur) * ${at}) infinite` }}
          >
            <Check className="size-[1.4cqw] text-green-600" /> Saved to disk
          </div>
        ))}
      </div>
      <div className="bg-muted text-muted-foreground absolute inset-0 z-10 grid place-items-center" style={{ animation: loop('recov-crash') }}>
        <div className="flex flex-col items-center gap-[1cqw] text-[1.8cqw] font-medium">
          <Unplug className="size-[5cqw]" />
          The browser closed
        </div>
      </div>
      <div
        className="bg-background absolute inset-x-0 top-[19%] bottom-0 z-10 space-y-[1.2cqw] px-[5cqw] py-[3cqw]"
        style={{ animation: loop('recov-list') }}
      >
        <div className="text-[2.2cqw] font-semibold">Videos</div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn('flex items-center gap-[1.4cqw] rounded-[1cqw] border p-[1cqw]', i === 0 && 'border-record')}
            style={i === 0 ? { animation: 'hg-pulse 1.6s ease-out infinite' } : undefined}
          >
            <span className="h-[5cqw] w-[8cqw] shrink-0 rounded-[0.6cqw] bg-gradient-to-br from-indigo-900 via-violet-700 to-orange-500" />
            <div className="flex-1 space-y-[0.6cqw]">
              <span className="bg-foreground/70 block h-[1.3cqw] w-2/5 rounded-[0.4cqw]" />
              <span className="bg-muted-foreground/30 block h-[0.9cqw] w-1/4 rounded-full" />
            </div>
            {i === 0 ? (
              <>
                <span className="rounded-full border px-[1cqw] py-[0.3cqw] text-[1.2cqw]">Interrupted</span>
                <span className="bg-record/15 text-record rounded-full px-[1cqw] py-[0.3cqw] text-[1.2cqw] font-medium">Recovered</span>
              </>
            ) : (
              <span className="bg-muted rounded-full px-[1cqw] py-[0.3cqw] text-[1.2cqw]">Saved</span>
            )}
          </div>
        ))}
      </div>
    </Scene>
  );
}

const DESTINATIONS = [
  { label: 'Google Drive', colour: 'bg-gradient-to-br from-green-500 via-yellow-400 to-blue-500' },
  { label: 'Dropbox', colour: 'bg-blue-600' },
  { label: 'Your server', colour: 'bg-foreground' },
];

export function UploadScene({ className }: { className?: string }) {
  return (
    <Scene label="A screenshot uploading to Google Drive, then its share link copied" seconds={8} still={6.4} className={cn('bg-muted/40', className)}>
      {/* The file */}
      <div className="bg-card absolute top-[34%] left-[7%] w-[32%] space-y-[1cqw] rounded-[1.2cqw] border p-[1.2cqw] shadow-lg">
        <div className="bg-muted/60 flex h-[12cqw] flex-col gap-[0.8cqw] rounded-[0.7cqw] p-[1cqw]">
          <span className="bg-foreground/70 h-[1.2cqw] w-1/2 rounded-[0.3cqw]" />
          <div className="flex flex-1 items-end gap-[0.6cqw]">
            {[40, 65, 50, 90, 70].map((height, i) => (
              <span key={i} className={cn('flex-1 rounded-t-[0.3cqw]', i === 3 ? 'bg-indigo-500' : 'bg-indigo-300/70')} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="text-[1.4cqw] font-medium">Screenshot.png</div>
        <div className="bg-muted h-[0.9cqw] overflow-hidden rounded-full">
          <div className="bg-foreground h-full rounded-full" style={{ animation: loop('up-progress') }} />
        </div>
      </div>
      {/* The flow between them */}
      <div
        className="absolute top-[50%] left-[42%] h-[0.5cqw] w-[14%] rounded-full"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, var(--foreground) 0 1.2cqw, transparent 1.2cqw 2.4cqw)',
          animation: `hg-dash 0.6s linear infinite, ${loop('up-flow')}`,
        }}
      />
      {/* Where it goes */}
      <div className="absolute top-[33.5%] left-[59%] w-[34%] space-y-[1.2cqw]">
        {DESTINATIONS.map(({ label, colour }, i) => (
          <div key={label} className="bg-card relative flex h-[6cqw] items-center gap-[1cqw] rounded-[1cqw] border px-[1.2cqw] text-[1.5cqw] font-medium">
            {i === 0 && <span className="ring-foreground absolute -inset-px rounded-[1cqw] ring-[0.3cqw]" style={{ animation: loop('up-target') }} />}
            <span className={cn('size-[2.6cqw] rounded-[0.6cqw]', colour)} />
            {label}
            {i === 0 && (
              <span className="ml-auto grid size-[2.4cqw] place-items-center rounded-full bg-green-600 text-white" style={{ animation: loop('up-check') }}>
                <Check className="size-[1.5cqw]" />
              </span>
            )}
          </div>
        ))}
      </div>
      <div
        className="bg-foreground text-background absolute bottom-[9%] left-1/2 flex items-center gap-[0.8cqw] rounded-full px-[1.8cqw] py-[0.9cqw] text-[1.5cqw] font-medium whitespace-nowrap shadow-lg"
        style={{ animation: loop('up-link') }}
      >
        <Check className="size-[1.6cqw]" /> Share link copied
        <span className="opacity-60">drive.google.com/file/d/…</span>
      </div>
    </Scene>
  );
}

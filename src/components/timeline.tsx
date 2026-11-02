import { GripVertical } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clipLength, clipStarts, editLength, placeSegments, type Edit, type Range } from '@/lib/edit/model';
import type { EditSource, Loudness, Thumbnail } from '@/lib/edit/source';
import { cn } from '@/lib/utils';

export type Selection = { kind: 'range'; start: number; end: number } | { kind: 'clip'; id: string };

const RULER_H = 22;
const TRACK_H = 84;
const WAVE_H = 26;
const THUMB_H = TRACK_H - WAVE_H;
/** Pointer movement before a press on the track becomes a range selection instead of a click. */
const DRAG_PX = 4;
/** Zoomed all the way in, a second is this wide. */
export const MAX_PX_PER_S = 200;
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export interface TimelineProps {
  edit: Edit;
  sources: Map<string, EditSource>;
  thumbnails: Map<string, Thumbnail[]>;
  loudness: Map<string, Loudness>;
  /** Quiet stretches, in the result's time. */
  silences: Range[];
  time: number;
  playing: boolean;
  onSeek: (time: number) => void;
  selection: Selection | undefined;
  onSelect: (selection: Selection | undefined) => void;
  /** 1 fits the whole edit; higher zooms in. */
  zoom: number;
  onZoom: (zoom: number) => void;
  onTrimStart: () => void;
  onTrim: (clipId: string, edge: 'start' | 'end', sourceTime: number) => void;
  onMoveClip: (clipId: string, toIndex: number) => void;
}

/**
 * The edit as a strip: a ruler, then the clips with a frame strip and the sound's
 * waveform, sped-up parts striped, and quiet stretches marked. Click to move the
 * playhead, drag across to select a range, drag a clip's edge to trim it, and drag a
 * clip by its name to move it. The frames and waveform are drawn on one canvas the size
 * of the visible part, so a long, zoomed-in recording stays light.
 */
export function Timeline(props: TimelineProps) {
  const { edit, sources, time, zoom, selection } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ left: 0, width: 0 });
  const total = useMemo(() => editLength(edit), [edit]);
  const placed = useMemo(() => placeSegments(edit), [edit]);
  const starts = useMemo(() => clipStarts(edit), [edit]);
  const pxPerS = total > 0 && view.width > 0 ? (view.width / total) * zoom : 1;
  const width = Math.max(view.width, total * pxPerS);
  const toTime = (clientX: number) => {
    const rect = scroller.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, (clientX - rect.left + scroller.current!.scrollLeft) / pxPerS));
  };

  useLayoutEffect(() => {
    const el = scroller.current!;
    const update = () => setView({ left: el.scrollLeft, width: el.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  // Keep the playhead in view while playing and after zooming.
  const lastZoom = useRef(zoom);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !view.width) return;
    const x = time * pxPerS;
    const zoomed = lastZoom.current !== zoom;
    lastZoom.current = zoom;
    if (zoomed) el.scrollLeft = x - view.width / 2;
    else if (props.playing && (x > el.scrollLeft + view.width * 0.95 || x < el.scrollLeft)) el.scrollLeft = x - view.width * 0.1;
  }, [time, zoom, pxPerS, view.width, props.playing]);

  // Ctrl or ⌘ + wheel zooms. React's wheel listener is passive, so this one is added by hand.
  const onZoom = useRef(props.onZoom);
  onZoom.current = props.onZoom;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scroller.current!;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoom.current(zoomRef.current * Math.exp(-event.deltaY / 300));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Frames and waveform for the visible part.
  useEffect(() => {
    const node = canvas.current;
    if (!node || !view.width) return;
    const ratio = window.devicePixelRatio || 1;
    node.width = Math.round(view.width * ratio);
    node.height = Math.round(TRACK_H * ratio);
    const ctx = node.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, view.width, TRACK_H);
    const waveColor = getComputedStyle(node).color;
    for (const p of placed) {
      const x0 = p.at * pxPerS - view.left;
      const x1 = (p.at + p.length) * pxPerS - view.left;
      if (x1 < 0 || x0 > view.width) continue;
      const source = sources.get(p.clip.sourceId);
      if (!source) continue;
      const { start, end, speed } = p.segment;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, x1 - x0, TRACK_H);
      ctx.clip();

      const thumbs = props.thumbnails.get(source.id);
      if (thumbs?.length) {
        const tile = Math.max(16, (THUMB_H * source.width) / source.height);
        const firstTile = Math.max(0, Math.floor(-x0 / tile));
        for (let k = firstTile, x = x0 + firstTile * tile; x < Math.min(x1, view.width); k++, x += tile) {
          const sourceTime = Math.min(end, start + (((k + 0.5) * tile) / pxPerS) * speed);
          const thumb = nearest(thumbs, sourceTime);
          ctx.drawImage(thumb.image, x, 0, tile, THUMB_H);
        }
      } else {
        ctx.fillStyle = 'rgba(127,127,127,0.15)';
        ctx.fillRect(x0, 0, x1 - x0, THUMB_H);
      }

      const loud = props.loudness.get(source.id);
      if (loud) {
        ctx.fillStyle = waveColor;
        const mid = THUMB_H + WAVE_H / 2;
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(view.width, x1); x++) {
          const s0 = start + ((x - x0) / pxPerS) * speed;
          const s1 = start + ((x + 1 - x0) / pxPerS) * speed;
          let level = 0;
          const w1 = Math.min(loud.peak.length, Math.ceil(s1 / loud.windowS));
          for (let w = Math.max(0, Math.floor(s0 / loud.windowS)); w < w1; w++) level = Math.max(level, loud.peak[w]!);
          const h = Math.max(1, Math.min(1, level) * (WAVE_H - 4));
          ctx.fillRect(x, mid - h / 2, 1, h);
        }
      }
      ctx.restore();
    }
  }, [placed, sources, props.thumbnails, props.loudness, pxPerS, view]);

  // A press on the track: a click moves the playhead and selects the clip, a drag selects a range.
  const onTrackDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const x0 = event.clientX;
    const t0 = toTime(event.clientX);
    let dragging = false;
    const move = (e: PointerEvent) => {
      if (!dragging && Math.abs(e.clientX - x0) < DRAG_PX) return;
      dragging = true;
      const t1 = toTime(e.clientX);
      props.onSelect({ kind: 'range', start: Math.min(t0, t1), end: Math.max(t0, t1) });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (dragging) return;
      props.onSeek(t0);
      const index = starts.findIndex((s, i) => t0 >= s && t0 <= s + clipLength(edit[i]!));
      props.onSelect(index >= 0 ? { kind: 'clip', id: edit[index]!.id } : undefined);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onRulerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    props.onSeek(toTime(event.clientX));
    const move = (e: PointerEvent) => props.onSeek(toTime(e.clientX));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const onHandleDown = (event: ReactPointerEvent, clipIndex: number, edge: 'start' | 'end') => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const clip = edit[clipIndex]!;
    const segment = edge === 'start' ? clip.segments[0]! : clip.segments.at(-1)!;
    const from = edge === 'start' ? segment.start : segment.end;
    const x0 = event.clientX;
    props.onTrimStart();
    props.onSelect({ kind: 'clip', id: clip.id });
    const move = (e: PointerEvent) => props.onTrim(clip.id, edge, from + ((e.clientX - x0) / pxPerS) * segment.speed);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const drop = (clipIndex: number, event: React.DragEvent) => {
    const id = event.dataTransfer.getData('application/x-screen-tools-clip');
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    let to = clipIndex + (event.clientX > rect.left + rect.width / 2 ? 1 : 0);
    const from = edit.findIndex((c) => c.id === id);
    if (from < to) to--;
    if (from !== to) props.onMoveClip(id, to);
  };

  const step = TICK_STEPS.find((s) => s * pxPerS >= 70) ?? 3600;
  const firstTick = Math.floor(view.left / pxPerS / step) * step;
  const ticks: number[] = [];
  for (let t = firstTick; t <= Math.min(total, (view.left + view.width) / pxPerS); t += step) ticks.push(t);
  const multi = edit.length > 1;

  return (
    <div
      ref={scroller}
      className="bg-muted/30 relative overflow-x-auto overflow-y-hidden rounded-lg border select-none"
      aria-label="Timeline"
    >
      <div className="relative" style={{ width, height: RULER_H + TRACK_H + 8 }}>
        <div className="text-muted-foreground absolute inset-x-0 top-0 cursor-pointer border-b text-[10px]" style={{ height: RULER_H }} onPointerDown={onRulerDown}>
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 h-full border-l pl-1 leading-[22px] tabular-nums" style={{ left: t * pxPerS }}>
              {tickLabel(t, step)}
            </span>
          ))}
        </div>

        <div className="absolute inset-x-0 cursor-text" style={{ top: RULER_H + 4, height: TRACK_H }} onPointerDown={onTrackDown}>
          <canvas
            ref={canvas}
            className="text-primary pointer-events-none absolute top-0"
            style={{ left: view.left, width: view.width, height: TRACK_H }}
          />
          {placed.map((p) =>
            p.segment.speed !== 1 ? (
              <div
                key={`${p.clip.id}-${p.segmentIndex}`}
                className="pointer-events-none absolute top-0 flex items-start justify-center overflow-hidden text-[10px] font-semibold text-white"
                style={{
                  left: p.at * pxPerS,
                  width: p.length * pxPerS,
                  height: TRACK_H,
                  background: 'repeating-linear-gradient(135deg, rgba(0,0,0,0.45) 0 6px, rgba(0,0,0,0.25) 6px 12px)',
                }}
              >
                {p.length * pxPerS > 24 && <span className="mt-4 rounded bg-black/60 px-1">{p.segment.speed}×</span>}
              </div>
            ) : (
              p.segmentIndex > 0 && (
                <div
                  key={`${p.clip.id}-${p.segmentIndex}`}
                  className="pointer-events-none absolute top-0 border-l-2 border-dashed border-white/80"
                  style={{ left: p.at * pxPerS, height: TRACK_H }}
                  title="Cut"
                />
              )
            ),
          )}
          {edit.map((clip, i) => {
            const left = starts[i]! * pxPerS;
            const w = clipLength(clip) * pxPerS;
            const selected = selection?.kind === 'clip' && selection.id === clip.id;
            return (
              <div
                key={clip.id}
                className={cn(
                  'absolute top-0 rounded-md border-2',
                  selected ? 'border-primary' : 'border-foreground/25',
                )}
                style={{ left, width: w, height: TRACK_H }}
                onDragOver={(event) => event.dataTransfer.types.includes('application/x-screen-tools-clip') && event.preventDefault()}
                onDrop={(event) => drop(i, event)}
              >
                {multi && w > 40 && (
                  <span
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/x-screen-tools-clip', clip.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    title="Drag to move this clip"
                    className="absolute top-1 left-3 flex max-w-[calc(100%-1.5rem)] cursor-grab items-center gap-0.5 rounded bg-black/65 py-0.5 pr-1.5 pl-0.5 text-[10px] text-white"
                  >
                    <GripVertical className="size-3 shrink-0" />
                    <span className="truncate">{sources.get(clip.sourceId)?.name}</span>
                  </span>
                )}
                <TrimHandle side="start" label="Drag to trim the start" onPointerDown={(e) => onHandleDown(e, i, 'start')} />
                <TrimHandle side="end" label="Drag to trim the end" onPointerDown={(e) => onHandleDown(e, i, 'end')} />
              </div>
            );
          })}
          {props.silences.map((range) => (
            <button
              key={`${range.start}`}
              type="button"
              title={`Quiet for ${(range.end - range.start).toFixed(1)} s. Click to select it.`}
              aria-label={`Quiet part at ${tickLabel(range.start, 1)}`}
              className="absolute bottom-0 border-x border-amber-500 bg-amber-400/35 hover:bg-amber-400/60"
              style={{ left: range.start * pxPerS, width: Math.max(2, (range.end - range.start) * pxPerS), height: WAVE_H }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                props.onSelect({ kind: 'range', start: range.start, end: range.end });
                props.onSeek(range.start);
              }}
            />
          ))}
        </div>

        {selection?.kind === 'range' && (
          <div
            className="border-primary bg-primary/20 pointer-events-none absolute border-x-2"
            style={{ left: selection.start * pxPerS, width: (selection.end - selection.start) * pxPerS, top: 0, height: RULER_H + TRACK_H + 4 }}
          />
        )}
        <div
          className="pointer-events-none absolute top-0 w-0.5 bg-red-500"
          style={{ left: time * pxPerS - 1, height: RULER_H + TRACK_H + 8 }}
        >
          <span className="absolute -top-px -left-1 size-2.5 rotate-45 bg-red-500" />
        </div>
      </div>
    </div>
  );
}

function TrimHandle({ side, label, onPointerDown }: { side: 'start' | 'end'; label: string; onPointerDown: (event: ReactPointerEvent) => void }) {
  return (
    <span
      role="slider"
      aria-label={label}
      aria-valuenow={0}
      title={label}
      onPointerDown={onPointerDown}
      className={cn(
        'bg-primary/90 hover:bg-primary absolute top-0 flex h-full w-2.5 cursor-ew-resize items-center justify-center',
        side === 'start' ? '-left-0.5 rounded-l-md' : '-right-0.5 rounded-r-md',
      )}
    >
      <span className="bg-primary-foreground h-6 w-0.5 rounded-full" />
    </span>
  );
}

function nearest(thumbs: Thumbnail[], time: number): Thumbnail {
  let lo = 0;
  let hi = thumbs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (thumbs[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  const prev = thumbs[Math.max(0, lo - 1)]!;
  return Math.abs(prev.time - time) < Math.abs(thumbs[lo]!.time - time) ? prev : thumbs[lo]!;
}

function tickLabel(seconds: number, step: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const s = seconds - m * 60;
  const ss = step < 1 ? s.toFixed(step < 0.5 ? 2 : 1).padStart(step < 0.5 ? 5 : 4, '0') : String(Math.round(s)).padStart(2, '0');
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

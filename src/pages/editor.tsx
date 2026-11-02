import {
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
  Download,
  FileVideo,
  Film,
  Loader2,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  ZoomIn,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useEditPreview } from '@/components/edit-preview';
import { ExportDialog } from '@/components/edit-export';
import { useSaveVideo } from '@/components/save-video';
import { MAX_PX_PER_S, Timeline, type Selection } from '@/components/timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBeforeUnload } from '@/hooks/use-before-unload';
import { navigate } from '@/hooks/use-route';
import { getRecording, getRecordingBlob, listRecordings, liveRecordingIds, type Recording } from '@/lib/db';
import { pendingEditorFile } from '@/lib/edit/handoff';
import {
  changeSourceRanges,
  clipLength,
  clipStarts,
  cutRange,
  editLength,
  moveClip,
  newClip,
  removeClip,
  setSpeed,
  splitClipAt,
  trimClip,
  visibleRanges,
  type Edit,
  type Range,
} from '@/lib/edit/model';
import type { RenderResult } from '@/lib/edit/render';
import { findSilences, loadSource, makeThumbnails, measureLoudness, type EditSource, type Loudness, type Thumbnail } from '@/lib/edit/source';
import { useHistory } from '@/lib/edit/use-history';
import { fileExtension, formatBytes, formatDuration, isWebm, splitFileName } from '@/lib/formats';
import { cn } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const recordingName = (r: Recording) => r.name ?? dateFormat.format(new Date(r.date));
const SPEEDS = [2, 4, 8] as const;
const MAX_ZOOM = 400;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

async function loadRecording(id: number): Promise<EditSource> {
  const [recording, blob, live] = await Promise.all([getRecording(id), getRecordingBlob(id), liveRecordingIds()]);
  if (live.has(id)) throw new Error("It's still being recorded in another window. Stop it there first.");
  if (!recording || !blob) throw new Error('It may have been deleted, or replaced by newer recordings.');
  return loadSource(blob, recordingName(recording), {
    recordingId: id,
    seekable: !isWebm(recording.mimeType) || recording.seekable,
  });
}

/** `/editor/:id` edits a stored recording; `/editor` edits the file the Player handed over. */
export function EditorPage({ recordingId }: { recordingId?: number }) {
  const [first, setFirst] = useState<EditSource | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stale = false;
    const file = recordingId === undefined ? pendingEditorFile() : undefined;
    if (recordingId === undefined && !file) {
      setFirst(null);
      return;
    }
    const loading = recordingId !== undefined ? loadRecording(recordingId) : loadSource(file!, file!.name);
    loading.then(
      (source) => !stale && setFirst(source),
      (reason: unknown) => {
        if (stale) return;
        console.error(reason);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      stale = true;
    };
  }, [recordingId]);

  const back = () => navigate(recordingId !== undefined ? `/videos/${recordingId}` : '/player');

  if (error) {
    return (
      <Card className="mx-auto my-auto w-full max-w-xl">
        <CardHeader>
          <CardTitle>Can't open this video</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="ghost" onClick={back}>
            <ArrowLeft /> Back
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (first === null) return <PickVideo />;
  if (!first) {
    return (
      <p className="text-muted-foreground my-auto flex items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Opening the video…
      </p>
    );
  }
  return <Editor first={first} onBack={back} />;
}

/** Shown at `/editor` with nothing to edit, e.g. after a reload. */
function PickVideo() {
  const [file, setFile] = useState<EditSource>();
  const [opening, setOpening] = useState(false);
  if (file) return <Editor first={file} onBack={() => navigate('/player')} />;
  const open = (picked: File) => {
    setOpening(true);
    loadSource(picked, picked.name).then(setFile, (reason: unknown) => {
      setOpening(false);
      toast.error("Can't open this video", { description: reason instanceof Error ? reason.message : String(reason) });
    });
  };
  return (
    <Card className="mx-auto my-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Video editor</CardTitle>
        <CardDescription>Trim, cut, join and speed up quiet parts. Pick a recording or a video file to start.</CardDescription>
      </CardHeader>
      <CardContent>
        {opening ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Opening the video…
          </p>
        ) : (
          <VideoPicker onRecording={(id) => navigate(`/editor/${id}`)} onFile={open} />
        )}
      </CardContent>
    </Card>
  );
}

function Editor({ first, onBack }: { first: EditSource; onBack: () => void }) {
  const [sources, setSources] = useState(() => new Map([[first.id, first]]));
  const history = useHistory<Edit>([newClip(first.id, first.durationS)]);
  const edit = history.value;
  const [selection, setSelection] = useState<Selection>();
  const [zoom, setZoom] = useState(1);
  const [thumbnails, setThumbnails] = useState(new Map<string, Thumbnail[]>());
  const [loudness, setLoudness] = useState(new Map<string, Loudness>());
  const [measuring, setMeasuring] = useState<number>();
  const [thresholdDb, setThresholdDb] = useState(-45);
  const [minQuietS, setMinQuietS] = useState(2);
  const [quietSpeed, setQuietSpeed] = useState<number>(4);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ result: RenderResult; edit: Edit }>();
  const { save: saveVideo, dialog: saveDialog } = useSaveVideo();
  const preview = useEditPreview(edit, sources);
  const { time, total } = preview;
  useBeforeUnload(history.canUndo);

  // Frame strips and loudness, made in the background for each new source.
  const started = useRef(new Set<string>());
  const aborts = useRef<AbortController[]>([]);
  useEffect(() => {
    for (const source of sources.values()) {
      if (started.current.has(source.id)) continue;
      started.current.add(source.id);
      const abort = new AbortController();
      aborts.current.push(abort);
      void makeThumbnails(source, abort.signal)
        .then((list) => !abort.signal.aborted && setThumbnails((m) => new Map(m).set(source.id, list)))
        .catch((reason: unknown) => console.warn("Couldn't make the frame strip", reason));
      if (source.hasAudio) {
        setMeasuring(0);
        void measureLoudness(source, abort.signal, setMeasuring)
          .then((level) => level && !abort.signal.aborted && setLoudness((m) => new Map(m).set(source.id, level)))
          .catch((reason: unknown) => console.warn("Couldn't measure the sound", reason))
          .finally(() => setMeasuring(undefined));
      }
    }
  }, [sources]);
  useEffect(
    () => () => {
      aborts.current.forEach((a) => a.abort());
    },
    [],
  );
  const thumbsRef = useRef(thumbnails);
  thumbsRef.current = thumbnails;
  useEffect(() => () => thumbsRef.current.forEach((list) => list.forEach((t) => t.image.close())), []);

  // Quiet stretches still in the edit at normal speed, per source and on the timeline.
  const quietBySource = useMemo(() => {
    const map = new Map<string, Range[]>();
    for (const [id, level] of loudness) map.set(id, findSilences(level, thresholdDb, minQuietS, sources.get(id)!.durationS));
    return map;
  }, [loudness, thresholdDb, minQuietS, sources]);
  const quietOnTimeline = useMemo(
    () =>
      [...quietBySource]
        .flatMap(([id, ranges]) => ranges.flatMap((r) => visibleRanges(edit, id, r)))
        .sort((a, b) => a.start - b.start),
    [quietBySource, edit],
  );
  const quietTotal = quietOnTimeline.reduce((sum, r) => sum + r.end - r.start, 0);
  const hasAudio = [...sources.values()].some((s) => edit.some((c) => c.sourceId === s.id) && s.hasAudio);

  const change = useCallback(
    (next: (edit: Edit) => Edit) => {
      history.set(next);
      setSelection(undefined);
    },
    [history],
  );

  const changeQuiet = (speed: number | null) =>
    change((current) => [...quietBySource].reduce((acc, [id, ranges]) => changeSourceRanges(acc, id, ranges, speed), current));

  const clipAt = (t: number) => {
    const starts = clipStarts(edit);
    const index = edit.findIndex((c, i) => t >= starts[i]! && t <= starts[i]! + clipLength(c));
    return index < 0 ? undefined : { index, start: starts[index]!, end: starts[index]! + clipLength(edit[index]!) };
  };

  const actions = {
    split: () => change((e) => splitClipAt(e, time)),
    trimStart: () => {
      const clip = clipAt(time);
      if (clip && time > clip.start) change((e) => cutRange(e, { start: clip.start, end: time }));
      if (clip) preview.seek(clip.start);
    },
    trimEnd: () => {
      const clip = clipAt(time);
      if (clip && time < clip.end) change((e) => cutRange(e, { start: time, end: clip.end }));
    },
    remove: () => {
      if (selection?.kind === 'range') change((e) => cutRange(e, selection));
      else if (selection?.kind === 'clip') change((e) => removeClip(e, selection.id));
    },
    speed: (speed: number) => {
      if (selection?.kind !== 'range') return;
      history.set((e) => setSpeed(e, selection, speed));
      setSelection(undefined);
    },
    move: (by: number) => {
      if (selection?.kind !== 'clip') return;
      const index = edit.findIndex((c) => c.id === selection.id);
      history.set((e) => moveClip(e, selection.id, index + by));
    },
  };

  const addSource = (source: EditSource) => {
    setSources((m) => new Map(m).set(source.id, source));
    history.set((e) => [...e, newClip(source.id, source.durationS)]);
    setAdding(false);
    toast.success(`Added ${source.name}`, { description: 'It’s at the end of the timeline.' });
  };
  const addFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Unsupported file type', { description: 'Pick a video file, such as WebM or MP4.' });
      return;
    }
    const id = toast.loading(`Opening ${file.name}…`);
    loadSource(file, file.name).then(
      (source) => {
        toast.dismiss(id);
        addSource(source);
      },
      (reason: unknown) => toast.error("Can't open this video", { id, description: reason instanceof Error ? reason.message : String(reason) }),
    );
  };
  const addRecording = (recordingId: number) => {
    const id = toast.loading('Opening the recording…');
    loadRecording(recordingId).then(
      (source) => {
        toast.dismiss(id);
        addSource(source);
      },
      (reason: unknown) => toast.error("Can't open this recording", { id, description: reason instanceof Error ? reason.message : String(reason) }),
    );
  };

  const save = (result: RenderResult) => {
    const base = splitFileName(first.name).base;
    void saveVideo(result.blob, result.mimeType, `${base} (edited).${fileExtension(result.mimeType)}`);
  };
  const onExported = (result: RenderResult) => {
    setExporting(false);
    setExported({ result, edit });
    toast.success('Edit exported', {
      description: `${fileExtension(result.mimeType).toUpperCase()}, ${formatDuration(result.durationS * 1000)}, ${formatBytes(result.blob.size)}.`,
    });
    save(result);
  };
  const ready = exported?.edit === edit ? exported.result : undefined;

  // Keys, unless typing or a dialog is open.
  const keys = useRef({ actions, preview, history, total });
  keys.current = { actions, preview, history, total };
  const dialogOpen = adding || exporting || Boolean(saveDialog);
  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const { actions: a, preview: p, history: h } = keys.current;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') h[event.shiftKey ? 'redo' : 'undo']();
      else if (mod && key === 'y') h.redo();
      else if (mod) return;
      else if (key === ' ' || key === 'k') p[p.playing ? 'pause' : 'play']();
      else if (key === 's') a.split();
      else if (key === '[') a.trimStart();
      else if (key === ']') a.trimEnd();
      else if (key === 'delete' || key === 'backspace') a.remove();
      else if (key === 'escape') setSelection(undefined);
      else if (key === 'arrowleft' || key === 'arrowright') {
        const step = (event.shiftKey ? 5 : 1) * (key === 'arrowleft' ? -1 : 1);
        p.seek(p.time + step, p.playing);
      } else if (key === 'home') p.seek(0);
      else if (key === 'end') p.seek(keys.current.total);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen]);

  const rangeSelected = selection?.kind === 'range' && selection.end - selection.start > 0.05;
  const clipIndex = selection?.kind === 'clip' ? edit.findIndex((c) => c.id === selection.id) : -1;
  const maxZoom = Math.max(1, Math.min(MAX_ZOOM, (total * MAX_PX_PER_S) / 1000));

  return (
    <div
      className="flex flex-col gap-3"
      onDragOver={(event) => event.dataTransfer.types.includes('Files') && event.preventDefault()}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0];
        if (!file) return;
        event.preventDefault();
        addFile(file);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{first.name}</h2>
          <p className="text-muted-foreground text-xs">
            Edited: {formatDuration(total * 1000)} of {formatDuration(editSourceLength(edit, sources) * 1000)}
            {edit.length > 1 && ` · ${edit.length} clips`}. The original stays as it is.
          </p>
        </div>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus /> Add video
        </Button>
        {ready ? (
          <Button onClick={() => save(ready)}>
            <Download /> Save
          </Button>
        ) : (
          <Button disabled={!total} onClick={() => setExporting(true)}>
            <Download /> Export
          </Button>
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl">{preview.element}</div>

      <div className="bg-card flex flex-wrap items-center gap-1 rounded-lg border p-1.5">
        <IconButton label={preview.playing ? 'Pause (space)' : 'Play (space)'} onClick={preview.playing ? preview.pause : preview.play} disabled={!total}>
          {preview.playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton label={preview.muted ? 'Unmute' : 'Mute'} onClick={() => preview.setMuted(!preview.muted)}>
          {preview.muted ? <VolumeX /> : <Volume2 />}
        </IconButton>
        <span className="text-muted-foreground px-1 text-xs tabular-nums">
          {formatClock(time)} / {formatClock(total)}
        </span>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <IconButton label="Split at playhead (S)" onClick={actions.split} disabled={!clipAt(time)}>
          <Scissors />
        </IconButton>
        <IconButton label="Trim start to playhead ([)" onClick={actions.trimStart} disabled={!total}>
          <ArrowLeftToLine />
        </IconButton>
        <IconButton label="Trim end to playhead (])" onClick={actions.trimEnd} disabled={!total}>
          <ArrowRightToLine />
        </IconButton>
        <IconButton
          label={selection?.kind === 'clip' ? 'Delete clip (Delete)' : 'Delete selection (Delete)'}
          onClick={actions.remove}
          disabled={!rangeSelected && clipIndex < 0}
        >
          <Trash2 />
        </IconButton>
        {rangeSelected && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <span className="text-muted-foreground px-1 text-xs">Speed</span>
            {[1, ...SPEEDS].map((speed) => (
              <Button key={speed} variant="ghost" size="sm" onClick={() => actions.speed(speed)}>
                {speed}×
              </Button>
            ))}
          </>
        )}
        {clipIndex >= 0 && edit.length > 1 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <IconButton label="Move clip earlier" onClick={() => actions.move(-1)} disabled={clipIndex === 0}>
              <ChevronLeft />
            </IconButton>
            <IconButton label="Move clip later" onClick={() => actions.move(1)} disabled={clipIndex === edit.length - 1}>
              <ChevronRight />
            </IconButton>
          </>
        )}
        <Separator orientation="vertical" className="mx-1 h-6" />
        <IconButton label="Undo (⌘Z)" onClick={history.undo} disabled={!history.canUndo}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" onClick={history.redo} disabled={!history.canRedo}>
          <Redo2 />
        </IconButton>
        <div className="ml-auto flex w-40 items-center gap-2 px-2">
          <ZoomIn className="text-muted-foreground size-4 shrink-0" />
          <Slider
            aria-label="Zoom"
            min={0}
            max={1}
            step={0.01}
            value={Math.log(zoom) / Math.log(maxZoom) || 0}
            onValueChange={(v) => setZoom(Math.pow(maxZoom, typeof v === 'number' ? v : v[0]!))}
          />
        </div>
      </div>

      <Timeline
        edit={edit}
        sources={sources}
        thumbnails={thumbnails}
        loudness={loudness}
        silences={quietOnTimeline}
        time={time}
        playing={preview.playing}
        onSeek={(t) => preview.seek(t, preview.playing)}
        selection={selection}
        onSelect={setSelection}
        zoom={zoom}
        onZoom={(z) => setZoom(Math.max(1, Math.min(maxZoom, z)))}
        onTrimStart={history.checkpoint}
        onTrim={(clipId, edge, sourceTime) => {
          const clip = edit.find((c) => c.id === clipId);
          const source = clip && sources.get(clip.sourceId);
          if (!source) return;
          const next = trimClip(edit, clipId, edge, sourceTime, source.durationS);
          history.set(next, { replace: true });
          // Show the frame at the new edge.
          const index = next.findIndex((c) => c.id === clipId);
          const start = clipStarts(next)[index]!;
          preview.seek(edge === 'start' ? start : start + clipLength(next[index]!) - 0.05);
        }}
        onMoveClip={(clipId, to) => history.set((e) => moveClip(e, clipId, to))}
      />
      <p className="text-muted-foreground text-xs">
        Click to move the playhead, drag across the timeline to select a part, and drag a clip's edges to trim it. S splits,
        Delete removes the selection, ⌘Z undoes. Hold ⌘ or Ctrl and scroll to zoom. Drop a video here to add it.
      </p>

      {hasAudio && (
        <div className="bg-card space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Quiet parts</h3>
              <p className="text-muted-foreground text-xs">
                {measuring !== undefined
                  ? `Listening for quiet parts… ${Math.round(measuring * 100)}%`
                  : quietOnTimeline.length
                    ? `${quietOnTimeline.length} quiet ${quietOnTimeline.length === 1 ? 'part' : 'parts'}, ${formatClock(quietTotal)} in total, marked in yellow. Click one to select it, or change them all here. Sped-up parts are muted.`
                    : 'No quiet parts left at these settings.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-md border" role="radiogroup" aria-label="Speed for quiet parts">
                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    role="radio"
                    aria-checked={quietSpeed === speed}
                    onClick={() => setQuietSpeed(speed)}
                    className={cn('px-2 py-1 text-xs', quietSpeed === speed ? 'bg-accent font-medium' : 'text-muted-foreground')}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" disabled={!quietOnTimeline.length} onClick={() => changeQuiet(quietSpeed)}>
                Speed up all
              </Button>
              <Button size="sm" variant="outline" disabled={!quietOnTimeline.length} onClick={() => changeQuiet(null)}>
                Cut all
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="flex justify-between text-xs font-normal">
                Quieter than <span className="tabular-nums">{thresholdDb} dB</span>
              </Label>
              <Slider aria-label="Quieter than" min={-70} max={-20} step={1} value={thresholdDb} onValueChange={(v) => setThresholdDb(typeof v === 'number' ? v : v[0]!)} />
            </div>
            <div className="grid gap-2">
              <Label className="flex justify-between text-xs font-normal">
                For at least <span className="tabular-nums">{minQuietS.toFixed(1)} s</span>
              </Label>
              <Slider aria-label="For at least" min={0.5} max={10} step={0.5} value={minQuietS} onValueChange={(v) => setMinQuietS(typeof v === 'number' ? v : v[0]!)} />
            </div>
          </div>
        </div>
      )}

      {adding && (
        <Dialog open onOpenChange={(open) => !open && setAdding(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a video</DialogTitle>
              <DialogDescription>It's added at the end. Drag it by its name on the timeline to move it.</DialogDescription>
            </DialogHeader>
            <VideoPicker onRecording={addRecording} onFile={addFile} />
          </DialogContent>
        </Dialog>
      )}
      {exporting && <ExportDialog edit={edit} sources={sources} onDone={onExported} onClose={() => setExporting(false)} />}
      {saveDialog}
    </div>
  );
}

/** The length of everything the clips come from, before edits. */
function editSourceLength(edit: Edit, sources: Map<string, EditSource>): number {
  return edit.reduce((sum, c, i) => {
    const seen = edit.slice(0, i).some((o) => o.sourceId === c.sourceId);
    return seen ? sum : sum + (sources.get(c.sourceId)?.durationS ?? 0);
  }, 0);
}

const formatClock = (seconds: number) => {
  const tenths = Math.floor((seconds % 1) * 10);
  return `${formatDuration(seconds * 1000)}.${tenths}`;
};

/** Stored recordings to pick from, and a file picker. */
function VideoPicker({ onRecording, onFile }: { onRecording: (id: number) => void; onFile: (file: File) => void }) {
  const [recordings, setRecordings] = useState<Recording[]>();
  const [live, setLive] = useState(new Set<number>());
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const thumbs = useMemo(() => new Map(recordings?.flatMap((r) => (r.thumbnail ? [[r.id, URL.createObjectURL(r.thumbnail)] as const] : []))), [recordings]);
  useEffect(() => () => thumbs.forEach((url) => URL.revokeObjectURL(url)), [thumbs]);
  useEffect(() => {
    void listRecordings().then(setRecordings);
    void liveRecordingIds().then(setLive);
  }, []);

  return (
    <div className="space-y-3">
      {recordings && recordings.length > 0 && (
        <ul className="max-h-72 divide-y overflow-y-auto">
          {recordings.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={live.has(r.id)}
                onClick={() => onRecording(r.id)}
                className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2 text-left disabled:opacity-50"
              >
                <span className="bg-muted flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded border">
                  {thumbs.get(r.id) ? <img src={thumbs.get(r.id)} alt="" className="size-full object-cover" /> : <Film className="text-muted-foreground size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{recordingName(r)}</span>
                  <span className="text-muted-foreground text-xs">
                    {r.durationMs !== undefined ? formatDuration(r.durationMs) : 'Recovered'} · {fileExtension(r.mimeType).toUpperCase()}
                  </span>
                </span>
                {live.has(r.id) && <Badge variant="destructive">Recording</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          'text-muted-foreground flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-sm transition-colors',
          dragging ? 'border-primary bg-primary/5 text-foreground' : 'hover:bg-accent',
        )}
      >
        {dragging ? <FileVideo className="size-8" /> : <Upload className="size-8" />}
        <span className="text-foreground font-medium">{dragging ? 'Drop here' : 'Drop a video file here'}</span>
        <span>or click to pick one (MP4 or WebM)</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={disabled} onClick={onClick} aria-label={label} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

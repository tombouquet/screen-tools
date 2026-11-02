import {
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronLeft,
  ChevronRight,
  Download,
  FileVideo,
  Film,
  Lightbulb,
  Loader2,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
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
  clipLength,
  clipStarts,
  cutRange,
  cutSourceRanges,
  editLength,
  moveClip,
  newClip,
  removeClip,
  snapCutEnd,
  splitClipAt,
  trimClip,
  visibleRanges,
  type Edit,
  type Range,
  type Snap,
} from '@/lib/edit/model';
import type { RenderResult } from '@/lib/edit/render';
import {
  findSilences,
  keyframeBefore,
  loadSource,
  makeThumbnails,
  measureLoudness,
  NotEditable,
  type EditSource,
  type Loudness,
  type Thumbnail,
} from '@/lib/edit/source';
import { useHistory } from '@/lib/edit/use-history';
import { useObjectUrls } from '@/lib/edit/use-object-urls';
import { fileExtension, formatBytes, formatDuration, splitFileName } from '@/lib/formats';
import { cn } from '@/lib/utils';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const recordingName = (r: Recording) => r.name ?? dateFormat.format(new Date(r.date));
const MAX_ZOOM = 400;
/** Set once the editor's first-use tip is closed. */
const TIPS_KEY = 'editor-tips-hidden';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

async function loadRecording(id: number, joinTo?: EditSource): Promise<EditSource> {
  const [recording, blob, live] = await Promise.all([getRecording(id), getRecordingBlob(id), liveRecordingIds()]);
  if (live.has(id)) throw new Error("It's still being recorded in another window. Stop it there first.");
  if (!recording || !blob) throw new Error('It may have been deleted, or replaced by newer recordings.');
  return loadSource(blob, recordingName(recording), { recordingId: id, joinTo });
}

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

/** Says why a video can't be added to the edit, and what to do about it. */
function refuseJoin(name: string, reason: unknown, toastId?: string | number) {
  if (!(reason instanceof NotEditable)) {
    toast.error(`Can't open ${name}`, { id: toastId, description: message(reason) });
    return;
  }
  toast.error(`Can't add ${name}`, {
    id: toastId,
    duration: 12_000,
    description: `${message(reason)} Videos can only be joined when they're the same size and format. Record them with the same recorder settings and try again.`,
  });
}

/** `/editor/:id` edits a stored recording; `/editor` edits the file the Player handed over. */
export function EditorPage({ recordingId }: { recordingId?: number }) {
  const [first, setFirst] = useState<EditSource | null>();
  const [error, setError] = useState<{ text: string; editable: boolean }>();

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
        setError({ text: message(reason), editable: !(reason instanceof NotEditable) });
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
          <CardTitle>{error.editable ? "Can't open this video" : "Can't edit this video"}</CardTitle>
          <CardDescription>{error.text}</CardDescription>
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
      toast.error(reason instanceof NotEditable ? "Can't edit this video" : "Can't open this video", { description: message(reason) });
    });
  };
  return (
    <Card className="mx-auto my-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle>Video editor</CardTitle>
        <CardDescription>Trim, cut, join videos and remove pauses. Pick a recording or a video file to start.</CardDescription>
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
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [tipsHidden, setTipsHidden] = useState(() => localStorage.getItem(TIPS_KEY) === '1');
  const hideTips = () => {
    localStorage.setItem(TIPS_KEY, '1');
    setTipsHidden(true);
  };
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ result: RenderResult; edit: Edit }>();
  const { save: saveVideo, dialog: saveDialog } = useSaveVideo();
  const preview = useEditPreview(edit, sources);
  const { time, total } = preview;

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

  /** Every cut resumes on a keyframe; see model.ts. */
  const snap: Snap = useCallback((id, t) => {
    const source = sources.get(id);
    return source ? keyframeBefore(source, t) : t;
  }, [sources]);

  // Quiet stretches, per source and on the timeline. Each ends at the keyframe before the
  // sound comes back, since that's where a cut can end; a stretch with no keyframe inside
  // can't be cut and is left out (and counted).
  const { quietBySource, uncuttable } = useMemo(() => {
    const map = new Map<string, Range[]>();
    let skipped = 0;
    for (const [id, level] of loudness) {
      const source = sources.get(id)!;
      const ranges = findSilences(level, thresholdDb, minQuietS, source.durationS).flatMap((r) => {
        const end = r.end >= source.durationS - 0.1 ? r.end : keyframeBefore(source, r.end);
        if (end - r.start >= 0.1) return [{ start: r.start, end }];
        skipped++;
        return [];
      });
      map.set(id, ranges);
    }
    return { quietBySource: map, uncuttable: skipped };
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

  const cutQuiet = () => change((current) => [...quietBySource].reduce((acc, [id, ranges]) => cutSourceRanges(acc, id, ranges, snap), current));

  /** Applies a cut, or says why it can't be made. */
  const cut = (next: Edit) => {
    if (editLength(next) < editLength(edit) - 1e-6 || next.length !== edit.length) change(() => next);
    else toast.info('This part is too short to cut', { description: 'Pick a slightly longer part. A cut ends at a ▼ mark on the timeline, so the video stays sharp.' });
  };

  const clipAt = (t: number) => {
    const starts = clipStarts(edit);
    const index = edit.findIndex((c, i) => t >= starts[i]! && t <= starts[i]! + clipLength(c));
    return index < 0 ? undefined : { index, start: starts[index]!, end: starts[index]! + clipLength(edit[index]!) };
  };

  const actions = {
    split: () => {
      const next = splitClipAt(edit, time, snap);
      if (next !== edit) change(() => next);
      else {
        toast.info("Can't split here", {
          description: 'Move the playhead past the next ▼ mark on the timeline. A clip can only start at one, so the video stays sharp.',
        });
      }
    },
    trimStart: () => {
      const clip = clipAt(time);
      if (clip && time > clip.start) cut(cutRange(edit, { start: clip.start, end: time }, snap));
      if (clip) preview.seek(clip.start);
    },
    trimEnd: () => {
      const clip = clipAt(time);
      if (clip && time < clip.end) cut(cutRange(edit, { start: time, end: clip.end }, snap));
    },
    remove: () => {
      if (selection?.kind === 'range') cut(cutRange(edit, selection, snap));
      else if (selection?.kind === 'clip') change((e) => removeClip(e, selection.id));
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
  // New clips must copy into the same file as the ones in the edit (they all match each other).
  const joinTo = edit[0] && sources.get(edit[0].sourceId);
  const addFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Unsupported file type', { description: 'Pick a video file, such as WebM or MP4.' });
      return;
    }
    const id = toast.loading(`Opening ${file.name}…`);
    loadSource(file, file.name, { joinTo }).then(
      (source) => {
        toast.dismiss(id);
        addSource(source);
      },
      (reason: unknown) => refuseJoin(file.name, reason, id),
    );
  };
  const addRecording = (recordingId: number, name: string) => {
    const id = toast.loading('Opening the recording…');
    loadRecording(recordingId, joinTo).then(
      (source) => {
        toast.dismiss(id);
        addSource(source);
      },
      (reason: unknown) => refuseJoin(name, reason, id),
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
  useBeforeUnload(history.canUndo && !ready);

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

  const unsaved = history.canUndo && !ready;
  const selectionNote =
    selection?.kind !== 'range'
      ? undefined
      : !rangeSelected
        ? 'This part is too short to cut. Drag a little further to the right.'
        : selection.requestedEnd - selection.end > 0.01
          ? `${formatSeconds(selection.end - selection.start)} selected. The striped bit stays: a cut ends at the nearest ▼ mark, so the video stays sharp.`
          : `${formatSeconds(selection.end - selection.start)} selected.`;

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
        <Button variant="ghost" onClick={() => (unsaved ? setLeaving(true) : onBack())}>
          <ArrowLeft /> Back
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{first.name}</h2>
          <p className="text-muted-foreground text-xs">
            Edited: {formatDuration(total * 1000)} of {formatDuration(editSourceLength(edit, sources) * 1000)}
            {edit.length > 1 && ` · ${edit.length} clips`}. The original stays as it is.
          </p>
        </div>
        <ToolButton label="Undo" shortcut="⌘Z" onClick={history.undo} disabled={!history.canUndo}>
          <Undo2 />
        </ToolButton>
        <ToolButton label="Redo" shortcut="⇧⌘Z" onClick={history.redo} disabled={!history.canRedo}>
          <Redo2 />
        </ToolButton>
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
        <ToolButton label="Split here" shortcut="S" onClick={actions.split} disabled={!clipAt(time)}>
          <Scissors />
        </ToolButton>
        <ToolButton label="Trim start here" shortcut="[" onClick={actions.trimStart} disabled={!total}>
          <ArrowLeftToLine />
        </ToolButton>
        <ToolButton label="Trim end here" shortcut="]" onClick={actions.trimEnd} disabled={!total}>
          <ArrowRightToLine />
        </ToolButton>
        <ToolButton
          label={selection?.kind === 'clip' ? 'Delete clip' : 'Delete selection'}
          shortcut="Delete"
          onClick={actions.remove}
          disabled={!rangeSelected && clipIndex < 0}
        >
          <Trash2 />
        </ToolButton>
        {clipIndex >= 0 && edit.length > 1 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <ToolButton label="Move earlier" onClick={() => actions.move(-1)} disabled={clipIndex === 0}>
              <ChevronLeft />
            </ToolButton>
            <ToolButton label="Move later" onClick={() => actions.move(1)} disabled={clipIndex === edit.length - 1}>
              <ChevronRight />
            </ToolButton>
          </>
        )}
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
          const next = trimClip(edit, clipId, edge, sourceTime, source.durationS, snap);
          history.set(next, { replace: true });
          // Show the frame at the new edge.
          const index = next.findIndex((c) => c.id === clipId);
          const start = clipStarts(next)[index]!;
          preview.seek(edge === 'start' ? start : start + clipLength(next[index]!) - 0.05);
        }}
        onMoveClip={(clipId, to) => history.set((e) => moveClip(e, clipId, to))}
        snapCutEnd={(t) => snapCutEnd(edit, t, snap)}
      />
      {selectionNote ? (
        <p className="text-muted-foreground text-xs">{selectionNote}</p>
      ) : (
        !tipsHidden && (
          <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
            <p className="flex-1">
              Click the timeline to move the playhead, or drag across it to pick a part, then press <b>Delete selection</b>.
              Drag a clip's edges to trim it. Hover a button to see its keyboard shortcut.
            </p>
            <button type="button" aria-label="Hide tip" className="hover:text-foreground -m-1 p-1" onClick={hideTips}>
              <X className="size-3.5" />
            </button>
          </div>
        )
      )}

      {hasAudio && (
        <div className="bg-card space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Pauses</h3>
              <p className="text-muted-foreground text-xs">
                {measuring !== undefined
                  ? `Looking for pauses… ${Math.round(measuring * 100)}%`
                  : quietOnTimeline.length
                    ? `Found ${quietOnTimeline.length} ${quietOnTimeline.length === 1 ? 'pause' : 'pauses'}, ${quietTotal < 60 ? formatSeconds(quietTotal) : formatDuration(quietTotal * 1000)} in total, marked in yellow. Click one to pick it, or remove them all.`
                    : 'No pauses found.'}
                {measuring === undefined &&
                  uncuttable > 0 &&
                  ` ${uncuttable} short ${uncuttable === 1 ? "pause can't" : "pauses can't"} be removed without making the video blurry, so ${uncuttable === 1 ? "it's" : "they're"} left in.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" aria-expanded={adjusting} onClick={() => setAdjusting(!adjusting)}>
                <SlidersHorizontal /> Adjust
              </Button>
              <Button size="sm" variant="outline" disabled={!quietOnTimeline.length} onClick={cutQuiet}>
                <Scissors /> Remove pauses
              </Button>
            </div>
          </div>
          {adjusting && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-xs font-normal">How quiet</Label>
                <Slider aria-label="How quiet" min={-70} max={-20} step={1} value={thresholdDb} onValueChange={(v) => setThresholdDb(typeof v === 'number' ? v : v[0]!)} />
                <span className="text-muted-foreground flex justify-between text-[11px]">
                  <span>Silence only</span>
                  <span>Soft sounds too</span>
                </span>
              </div>
              <div className="grid gap-2">
                <Label className="flex justify-between text-xs font-normal">
                  Shortest pause <span className="tabular-nums">{formatSeconds(minQuietS)}</span>
                </Label>
                <Slider aria-label="Shortest pause" min={0.5} max={10} step={0.5} value={minQuietS} onValueChange={(v) => setMinQuietS(typeof v === 'number' ? v : v[0]!)} />
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDeleteDialog
        open={leaving}
        onOpenChange={setLeaving}
        onConfirm={onBack}
        title="Leave without saving?"
        description="Your edits haven't been exported, so they'll be lost. The original video stays as it is."
        confirmLabel="Leave"
      />
      {adding && (
        <Dialog open onOpenChange={(open) => !open && setAdding(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a video</DialogTitle>
              <DialogDescription>
                It's added at the end; drag it by its name on the timeline to move it. It needs the same size and format as this
                video, such as a recording made with the same settings.
              </DialogDescription>
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

const formatSeconds = (seconds: number) => `${seconds.toFixed(1)} s`;

const formatClock = (seconds: number) => {
  const tenths = Math.floor((seconds % 1) * 10);
  return `${formatDuration(seconds * 1000)}.${tenths}`;
};

/** Stored recordings to pick from, and a file picker. */
function VideoPicker({ onRecording, onFile }: { onRecording: (id: number, name: string) => void; onFile: (file: File) => void }) {
  const [recordings, setRecordings] = useState<Recording[]>();
  const [live, setLive] = useState(new Set<number>());
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const thumbs = useObjectUrls(
    useMemo(() => new Map(recordings?.flatMap((r) => (r.thumbnail ? [[r.id, r.thumbnail] as const] : []))), [recordings]),
  );
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
                onClick={() => onRecording(r.id, recordingName(r))}
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

/** A labelled toolbar button; the tooltip shows its keyboard shortcut. */
function ToolButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const button = <Button variant="ghost" size="sm" disabled={disabled} onClick={onClick} />;
  if (!shortcut) {
    return (
      <Button variant="ghost" size="sm" disabled={disabled} onClick={onClick}>
        {children} {label}
      </Button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger render={button}>
        {children} {label}
      </TooltipTrigger>
      <TooltipContent>Shortcut: {shortcut}</TooltipContent>
    </Tooltip>
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

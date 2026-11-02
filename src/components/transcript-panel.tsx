import { Captions, Copy, Download, Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useBeforeUnload } from '@/hooks/use-before-unload';
import { useSettings } from '@/hooks/use-settings';
import { getTranscript, saveTranscript } from '@/lib/db';
import { downloadBlob } from '@/lib/download';
import { formatBytes, formatDuration } from '@/lib/formats';
import {
  NoAudioError,
  TranscriptionCancelled,
  hasModelPermission,
  cachedDevice,
  pickDevice,
  requestModelPermission,
  transcribe,
  type TranscribeJob,
} from '@/lib/transcribe/client';
import { MODELS, type TranscriptionDevice } from '@/lib/transcribe/models';
import { segmentAt, toSrt, toText, toVtt, type Transcript, type TranscriptSegment } from '@/lib/transcribe/transcript';
import { cn } from '@/lib/utils';

type Status =
  | { step: 'idle' }
  /** `fromCache` when the model is already here and only being read in. */
  | { step: 'downloading'; loaded: number; total: number; fromCache: boolean }
  | { step: 'transcribing'; seconds: number; duration: number; device?: TranscriptionDevice };

const deviceName = (device: TranscriptionDevice) => (device === 'webgpu' ? 'graphics card' : 'processor');

/**
 * Transcribes a video on this computer and keeps the result: in IndexedDB with the
 * recording when there's a `recordingId`, otherwise (a file opened in the player) only
 * while the page is open. Returns the transcript so far, the Transcribe button, the
 * first-download dialog and the panel.
 */
export function useTranscription({
  blob,
  recordingId,
  durationMs,
}: {
  blob: Blob;
  recordingId?: number;
  durationMs?: number;
}) {
  const settings = useSettings();
  const [transcript, setTranscript] = useState<Transcript>();
  const [live, setLive] = useState<TranscriptSegment[]>();
  const [status, setStatus] = useState<Status>({ step: 'idle' });
  const [askDownload, setAskDownload] = useState(false);
  /** The device this computer would use, which decides the download. */
  const [device, setDevice] = useState<TranscriptionDevice>();
  /** The device whose weights are already here, if any: transcribing with it needs no download. */
  const [cached, setCached] = useState<TranscriptionDevice>();
  const job = useRef<TranscribeJob>(undefined);
  const model = settings.transcriptionModel;
  const language = settings.transcriptionLanguage;

  useEffect(() => {
    setTranscript(undefined);
    if (recordingId !== undefined) void getTranscript(recordingId).then(setTranscript);
  }, [recordingId]);

  // Worked out ahead of the click, so the click can go straight to the permission prompt.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const picked = await pickDevice();
      const downloaded = await cachedDevice(model, picked);
      if (cancelled) return;
      setDevice(picked);
      setCached(downloaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [model]);

  // Leaving the page stops it; the worker goes with the page anyway.
  useEffect(() => () => job.current?.cancel(), []);
  const running = status.step !== 'idle';
  useBeforeUnload(running);

  const run = useCallback(
    async (allowDownload: boolean) => {
      // An already downloaded model is used as it is, rather than fetching the other device's.
      const use = cached ?? device;
      if (!use || job.current) return;
      setStatus(cached ? { step: 'transcribing', seconds: 0, duration: (durationMs ?? 0) / 1000 } : { step: 'downloading', loaded: 0, total: 0, fromCache: false });
      setLive([]);
      const current = transcribe(
        blob,
        { model, language, device: use, allowDownload },
        {
          onDownload: (loaded, total) => setStatus({ step: 'downloading', loaded, total, fromCache: !!cached }),
          onLoaded: (used) => setStatus({ step: 'transcribing', seconds: 0, duration: (durationMs ?? 0) / 1000, device: used }),
          onProgress: (seconds, duration) =>
            setStatus((s) => ({ step: 'transcribing', seconds, duration: duration || (durationMs ?? 0) / 1000, device: s.step === 'transcribing' ? s.device : undefined })),
          onSegments: setLive,
        },
      );
      job.current = current;
      try {
        const { segments, device: used, language: spoken, elapsedMs } = await current.result;
        const next: Transcript = { segments, model, language: spoken, date: new Date().toISOString() };
        setTranscript(next);
        setCached(used);
        if (recordingId !== undefined) await saveTranscript(recordingId, next);
        if (segments.length) {
          toast.success('Transcript ready', { description: `Took ${formatDuration(elapsedMs)} on your ${deviceName(used)}.` });
        } else {
          toast.info('No speech found', { description: 'Nothing in this video sounded like speech.' });
        }
      } catch (error) {
        if (error instanceof TranscriptionCancelled) return;
        console.error('Transcription failed', error);
        toast.error(error instanceof NoAudioError ? 'No sound to transcribe' : "Couldn't transcribe this video", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        job.current = undefined;
        setLive(undefined);
        setStatus({ step: 'idle' });
      }
    },
    [blob, cached, device, durationMs, language, model, recordingId],
  );

  const start = useCallback(() => {
    if (cached) {
      // The permission isn't needed for a model that's already here; pass it on if it's held.
      void hasModelPermission().then((allowed) => run(allowed));
    } else {
      setAskDownload(true);
    }
  }, [cached, run]);

  const cancel = useCallback(() => job.current?.cancel(), []);

  const segments = live ?? transcript?.segments;
  const vtt = useMemo(() => (transcript?.segments.length ? toVtt(transcript.segments) : undefined), [transcript]);

  const button = (
    <Button variant="outline" disabled={!device || running} onClick={start}>
      {running ? <Loader2 className="animate-spin" /> : <Captions />} {transcript ? 'Transcribe again' : 'Transcribe'}
    </Button>
  );

  const dialog = device && (
    <DownloadDialog
      open={askDownload}
      onOpenChange={setAskDownload}
      sizeMb={MODELS[model].downloadMb[device]}
      modelLabel={MODELS[model].label}
      onConfirm={() => {
        setAskDownload(false);
        // Straight from the click, so the browser shows its prompt.
        void requestModelPermission().then((granted) => {
          if (granted) void run(true);
          else toast.info('Transcription needs the one-time model download', { description: 'Nothing was downloaded.' });
        });
      }}
    />
  );

  return { transcript, segments, status, running, start, cancel, button, dialog, captions: vtt };
}

function DownloadDialog({
  open,
  onOpenChange,
  sizeMb,
  modelLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sizeMb: number;
  modelLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download the speech model?</DialogTitle>
          <DialogDescription>
            Transcribing runs on your computer, so it needs the Whisper {modelLabel} speech model first: about {sizeMb} MB, downloaded once from
            Hugging Face and kept for next time.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm">
          <li>Your browser asks to let Screen Tools reach huggingface.co. That's only used for this download.</li>
          <li>Your video and its sound never leave your computer.</li>
          <li>You can delete the model, and give back the permission, in Settings → Transcription.</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            <Download /> Download and transcribe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The transcript next to the player: progress while it's made, then every line with its
 * time. Click a line to jump there; the line playing is highlighted. Search, copy and
 * download as captions or text.
 */
export function TranscriptPanel({
  transcription,
  video,
  fileBase,
}: {
  transcription: ReturnType<typeof useTranscription>;
  video: RefObject<HTMLVideoElement | null>;
  /** File name for downloads, without the extension. */
  fileBase: string;
}) {
  const { segments, status, running, cancel, transcript } = transcription;
  const [query, setQuery] = useState('');
  const [time, setTime] = useState(0);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const update = () => setTime(el.currentTime);
    el.addEventListener('timeupdate', update);
    el.addEventListener('seeked', update);
    return () => {
      el.removeEventListener('timeupdate', update);
      el.removeEventListener('seeked', update);
    };
  }, [video, segments]);

  const active = segments ? segmentAt(segments, time) : -1;
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () => (segments ?? []).map((segment, index) => ({ segment, index })).filter(({ segment }) => !needle || segment.text.toLowerCase().includes(needle)),
    [segments, needle],
  );

  // Keep the playing line in view, inside the list only (not the page).
  useEffect(() => {
    if (needle || active < 0 || !list.current) return;
    const item = list.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!item) return;
    const box = list.current;
    if (item.offsetTop < box.scrollTop || item.offsetTop + item.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: item.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
    }
  }, [active, needle]);

  if (!segments && !running) return null;

  const seek = (seconds: number) => {
    if (video.current) video.current.currentTime = seconds;
  };
  const exportAs = (extension: 'vtt' | 'srt' | 'txt') => {
    const all = transcript?.segments ?? [];
    const [text, type] =
      extension === 'vtt' ? [toVtt(all), 'text/vtt'] : extension === 'srt' ? [toSrt(all), 'application/x-subrip'] : [toText(all), 'text/plain'];
    downloadBlob(new Blob([text], { type }), `${fileBase}.${extension}`);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(toText(transcript?.segments ?? []));
    toast.success('Transcript copied');
  };
  const ready = !running && !!transcript?.segments.length;

  return (
    <section aria-label="Transcript" className="bg-card flex min-h-0 flex-col rounded-lg border xl:absolute xl:inset-0">
      <header className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            aria-label="Search transcript"
            placeholder="Search transcript"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 pl-8"
          />
        </div>
        {ready && (
          <IconButton label="Copy transcript" onClick={() => void copy()}>
            <Copy />
          </IconButton>
        )}
      </header>

      {running && <RunningStatus status={status} onCancel={cancel} />}

      <ol ref={list} className="relative max-h-80 min-h-0 flex-1 overflow-y-auto p-1 xl:max-h-none">
        {shown.map(({ segment, index }) => (
          <li key={index} data-index={index}>
            <button
              type="button"
              onClick={() => seek(segment.start)}
              aria-current={index === active ? 'true' : undefined}
              className={cn(
                'hover:bg-accent flex w-full gap-3 rounded-md px-2 py-1.5 text-left text-sm',
                index === active && 'bg-primary/10 text-foreground',
              )}
            >
              <span className="text-muted-foreground w-12 shrink-0 pt-px text-xs tabular-nums">{formatDuration(segment.start * 1000)}</span>
              <span>{highlight(segment.text, needle)}</span>
            </button>
          </li>
        ))}
        {needle && !shown.length && <li className="text-muted-foreground p-3 text-sm">No lines match “{query.trim()}”.</li>}
        {!running && segments?.length === 0 && <li className="text-muted-foreground p-3 text-sm">No speech found in this video.</li>}
      </ol>

      {ready && (
        <footer className="flex flex-wrap items-center gap-1 border-t p-2">
          <span className="text-muted-foreground mr-auto text-xs">Download</span>
          {(['vtt', 'srt', 'txt'] as const).map((extension) => (
            <Button key={extension} size="sm" variant="ghost" onClick={() => exportAs(extension)}>
              <Download /> .{extension}
            </Button>
          ))}
        </footer>
      )}
    </section>
  );
}

function RunningStatus({ status, onCancel }: { status: Status; onCancel: () => void }) {
  const [label, value] =
    status.step === 'downloading'
      ? [
          status.fromCache
            ? 'Loading the speech model…'
            : status.total
              ? `Downloading the speech model… ${formatBytes(status.loaded)} of ${formatBytes(status.total)}`
              : 'Getting the speech model ready…',
          status.total ? (status.loaded / status.total) * 100 : null,
        ]
      : status.step === 'transcribing'
        ? [
            `Transcribing${status.device ? ` on your ${deviceName(status.device)}` : ''}… ${formatDuration(status.seconds * 1000)}${status.duration ? ` of ${formatDuration(status.duration * 1000)}` : ''}`,
            status.duration ? Math.min(100, (status.seconds / status.duration) * 100) : null,
          ]
        : ['', null];
  return (
    <div className="space-y-2 border-b p-3">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
        <span className="flex-1">{label}</span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X /> Cancel
        </Button>
      </div>
      <Progress value={value} />
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="icon-sm" variant="ghost" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Marks every match of `needle` in `text`. */
function highlight(text: string, needle: string): ReactNode {
  if (!needle) return text;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="rounded-sm bg-yellow-300/60 text-inherit dark:bg-yellow-500/40">{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

/** The player with the transcript beside it on wide screens and under it otherwise, once there is one. */
export function PlayerWithTranscript({
  player,
  transcription,
  video,
  fileBase,
}: {
  player: ReactNode;
  transcription: ReturnType<typeof useTranscription>;
  video: RefObject<HTMLVideoElement | null>;
  fileBase: string;
}) {
  const open = transcription.running || !!transcription.segments;
  return (
    <div className={cn('grid gap-4', open && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
      {player}
      {open && (
        <div className="relative min-h-0">
          <TranscriptPanel transcription={transcription} video={video} fileBase={fileBase} />
        </div>
      )}
      {transcription.dialog}
    </div>
  );
}

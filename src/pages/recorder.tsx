import { Camera, Circle, Mic, Monitor, Pause, Play, Plus, Save, Square, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceTiles } from '@/components/choice-tiles';
import { MonitorCamera } from '@/components/icons';
import { ConfirmDeleteDialog, UnsavedDialog } from '@/components/confirm-dialog';
import { RecordedVideo } from '@/components/recorded-video';
import { LargeFileNotice, useSaveVideo } from '@/components/save-video';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { OptionSelect } from '@/components/option-select';
import { useBeforeUnload } from '@/hooks/use-before-unload';
import { setBusy } from '@/hooks/use-busy';
import { navigate, useRoute } from '@/hooks/use-route';
import { useSettings } from '@/hooks/use-settings';
import { CaptureError } from '@/lib/capture';
import { LARGE_FILE_BYTES } from '@/lib/compress';
import { deleteRecording, updateRecording } from '@/lib/db';
import { openAppTab } from '@/lib/download';
import { fileExtension, formatBytes, formatDuration, formatOptions, recordingFileName } from '@/lib/formats';
import type { AppMessage } from '@/lib/messages';
import { RecordingSession, type FinishedRecording } from '@/lib/session';
import {
  SCREEN_RESOLUTIONS,
  getSettings,
  setCaptureSource,
  updateSettings,
  type AudioSource,
  type CaptureSource,
  type ScreenResolutionId,
} from '@/lib/settings';
import { resetToolbar, showCountdown, showRecording } from '@/lib/toolbar';

/** Seconds between picking what to share and the recording starting. */
const COUNTDOWN_SECONDS = 3;

const SCREEN_RESOLUTION_OPTIONS = SCREEN_RESOLUTIONS.map((r) => ({ value: r.id as ScreenResolutionId, label: r.label }));

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'countdown'; session: RecordingSession; seconds: number }
  | { kind: 'recording'; session: RecordingSession; paused: boolean }
  | { kind: 'stopping' }
  | { kind: 'finished'; recording: FinishedRecording; saved: boolean };

const WARNINGS: Record<CaptureError['kind'], string> = {
  camera: 'Camera not found',
  microphone: 'Microphone not found',
  'system-audio': 'System audio track not found',
  screen: 'Error getting the screen',
  cancelled: 'Screen sharing was cancelled',
};

function showCaptureError(error: unknown) {
  if (!(error instanceof CaptureError)) {
    console.error(error);
    toast.error('Error getting media stream', { description: error instanceof Error ? error.message : String(error) });
    return;
  }
  if (error.kind === 'cancelled') return;
  // Camera and mic permission prompts don't always show in the popup window; a tab can ask.
  const fixable = error.kind === 'camera' || error.kind === 'microphone';
  toast.warning(WARNINGS[error.kind], {
    description: error.kind === 'system-audio' ? 'To record sound, tick "Also share audio" in the picker.' : error.message,
    action: fixable ? { label: 'Fix in new tab', onClick: () => openAppTab('/settings') } : undefined,
    duration: 10_000,
  });
}

function focusThisWindow() {
  chrome.windows.getCurrent((window) => {
    if (window.id !== undefined) void chrome.windows.update(window.id, { focused: true });
  });
}

export function RecorderPage() {
  const settings = useSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const sessionRef = useRef<RecordingSession>(undefined);

  const busy = phase.kind !== 'idle' && phase.kind !== 'finished';
  useEffect(() => setBusy(busy), [busy]);
  useBeforeUnload(busy || (phase.kind === 'finished' && !phase.saved));

  /** Stops the recording, or cancels it if the countdown is still running. */
  const stop = async () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = undefined;
    void resetToolbar();
    focusThisWindow();
    if (!session.started) {
      session.cancel();
      setPhase({ kind: 'idle' });
      return;
    }
    setPhase({ kind: 'stopping' });
    try {
      const recording = await session.stop(getSettings().optimizeVideo);
      setPhase({ kind: 'finished', recording, saved: false });
    } catch (error) {
      console.error(error);
      toast.error('Could not finish the recording', { description: 'It may still be in Latest videos.' });
      setPhase({ kind: 'idle' });
    }
  };

  const start = async () => {
    setPhase({ kind: 'starting' });
    let session: RecordingSession;
    try {
      session = await RecordingSession.open(getSettings(), {
        onWarning: showCaptureError,
        onStateChange: (state) => {
          if (state === 'stopped') return;
          void showRecording(state === 'paused');
          setPhase((p) => (p.kind === 'recording' ? { ...p, paused: state === 'paused' } : p));
        },
        onEndedExternally: () => void stop(),
      });
    } catch (error) {
      showCaptureError(error);
      setPhase({ kind: 'idle' });
      return;
    }
    sessionRef.current = session;

    // `stop()` clears the ref, so a changed ref means it was cancelled meanwhile.
    for (let seconds = COUNTDOWN_SECONDS; seconds > 0; seconds--) {
      setPhase({ kind: 'countdown', session, seconds });
      void showCountdown(seconds);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (sessionRef.current !== session) return;
    }
    try {
      await session.record();
    } catch (error) {
      console.error(error);
      toast.error('Could not start the recording', { description: error instanceof Error ? error.message : String(error) });
      if (sessionRef.current === session) await stop();
      return;
    }
    if (sessionRef.current === session) setPhase({ kind: 'recording', session, paused: false });
  };

  // Mid-recording, a click on the toolbar icon reaches the worker, which asks here to stop.
  useEffect(() => {
    const onMessage = (message: AppMessage, _sender: chrome.runtime.MessageSender, respond: (stopped: boolean) => void) => {
      if (message?.type !== 'stopRecording' || !sessionRef.current) return;
      void stop();
      respond(true);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // The toolbar popup opens `#/?start=<source>` to begin straight away with that source.
  const autoStart = useRoute().match(/\?start=(screen|camera|screen-camera)$/)?.[1] as CaptureSource | undefined;
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart) {
      autoStarted.current = false;
      return;
    }
    if (autoStarted.current) return;
    autoStarted.current = true;
    navigate('/');
    // Reads `phase` as it is now; this only reacts to the route.
    if (phase.kind === 'finished') {
      toast('Save or discard this recording first');
    } else if (phase.kind === 'idle') {
      setCaptureSource(autoStart);
      void start();
    }
  }, [autoStart]);

  // Stop cleanly if the page goes away mid-recording; chunks so far are already saved.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) return;
      if (session.started) void session.stop(false);
      else session.cancel();
      void resetToolbar();
    },
    [],
  );

  if (phase.kind === 'countdown' || phase.kind === 'recording' || phase.kind === 'stopping') {
    return (
      <LiveView
        session={phase.kind === 'stopping' ? undefined : phase.session}
        countdown={phase.kind === 'countdown' ? phase.seconds : undefined}
        paused={phase.kind === 'recording' && phase.paused}
        onStop={() => void stop()}
      />
    );
  }

  if (phase.kind === 'finished') {
    return (
      <FinishedView
        recording={phase.recording}
        saved={phase.saved}
        onSaved={() => setPhase((p) => (p.kind === 'finished' ? { ...p, saved: true } : p))}
        onDone={() => setPhase({ kind: 'idle' })}
      />
    );
  }

  const wantsScreen = settings.captureSource !== 'camera';

  return (
    <div className="mx-auto my-auto w-full max-w-xl space-y-8 py-6">
      <div className="space-y-1.5 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">New recording</h2>
        <p className="text-muted-foreground text-sm">
          Choose what to capture. Screen lets you pick your whole screen, a window or a tab.
        </p>
      </div>

      <Field label="Capture">
        <ChoiceTiles<CaptureSource>
          label="Capture"
          value={settings.captureSource}
          onChange={setCaptureSource}
          choices={[
            { value: 'screen', label: 'Screen', icons: [Monitor] },
            { value: 'camera', label: 'Camera', icons: [Camera] },
            { value: 'screen-camera', label: 'Screen + camera', icons: [MonitorCamera] },
          ]}
        />
      </Field>

      <Field label="Audio" hint={wantsScreen ? undefined : 'System audio needs a screen capture.'}>
        <ChoiceTiles<AudioSource>
          label="Audio"
          value={settings.audioSource}
          onChange={(audioSource) => updateSettings({ audioSource })}
          choices={[
            { value: 'none', label: 'None', icons: [VolumeX] },
            { value: 'microphone', label: 'Mic', icons: [Mic] },
            { value: 'system', label: 'System', icons: [Volume2], disabled: !wantsScreen },
            { value: 'system-microphone', label: 'System + mic', icons: [Volume2, Mic], disabled: !wantsScreen },
          ]}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Format" htmlFor="format">
          <OptionSelect
            id="format"
            items={formatOptions()}
            value={settings.format}
            onValueChange={(format) => updateSettings({ format })}
          />
        </Field>
        <Field label="Resolution" htmlFor="screen-resolution">
          {wantsScreen ? (
            <OptionSelect
              id="screen-resolution"
              items={SCREEN_RESOLUTION_OPTIONS}
              value={settings.screenResolution}
              onValueChange={(screenResolution) => updateSettings({ screenResolution })}
            />
          ) : (
            <p className="text-muted-foreground flex h-8 items-center text-sm">Set by the camera in Settings</p>
          )}
        </Field>
      </div>

      <Button size="lg" className="h-11 w-full text-base" onClick={() => void start()} disabled={phase.kind === 'starting'}>
        <Circle className="fill-record text-record" />
        {phase.kind === 'starting' ? 'Starting…' : 'Start recording'}
      </Button>
    </div>
  );
}

/** A small uppercase label over a control, with an optional note under it. */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function LiveView({
  session,
  countdown,
  paused,
  onStop,
}: {
  session?: RecordingSession;
  /** Seconds left before recording starts; undefined once it has. */
  countdown?: number;
  paused: boolean;
  onStop: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    if (video.current && session) video.current.srcObject = session.preview;
  }, [session]);
  useEffect(() => {
    const timer = setInterval(() => rerender((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, []);

  return (
    <Card className="my-auto">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3">
            {!paused && !countdown && <span className="bg-record absolute inline-flex size-full animate-ping rounded-full opacity-75" />}
            <span className={`relative inline-flex size-3 rounded-full ${paused ? 'bg-muted-foreground' : 'bg-record'}`} />
          </span>
          <CardTitle>
            {!session ? 'Finishing…' : countdown ? 'Starting in…' : paused ? 'Paused' : 'Recording'}
          </CardTitle>
        </div>
        <span className="font-mono text-2xl tabular-nums">{formatDuration(session?.elapsedMs ?? 0)}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <video ref={video} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black object-contain" />
          {countdown !== undefined && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
              <span key={countdown} className="animate-in zoom-in-50 fade-in text-8xl font-semibold text-white tabular-nums duration-300">
                {countdown}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="lg" disabled={!session || countdown !== undefined} onClick={() => session?.togglePause()}>
            {paused ? <Play /> : <Pause />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="destructive" size="lg" disabled={!session} onClick={onStop}>
            <Square className="fill-current" /> {countdown !== undefined ? 'Cancel' : 'Stop'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** After stopping: play it back, compress, save, discard, or start a new recording. */
function FinishedView({
  recording,
  saved,
  onSaved,
  onDone,
}: {
  recording: FinishedRecording;
  saved: boolean;
  onSaved: () => void;
  onDone: () => void;
}) {
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const { save: saveVideo, dialog: saveDialog } = useSaveVideo();

  /** Resolves false if the user cancels the save dialog. */
  const save = async (suggestCompression = false): Promise<boolean> => {
    const name = recordingFileName(new Date(), recording.mimeType);
    if (!(await saveVideo(recording.blob, recording.mimeType, name, { suggestCompression }))) return false;
    await updateRecording(recording.id, { saved: true });
    onSaved();
    return true;
  };

  const startNew = (force = false) => {
    if (!force && !saved) {
      setUnsavedOpen(true);
      return;
    }
    onDone();
  };

  const discard = async () => {
    await deleteRecording(recording.id);
    onDone();
    toast('Recording discarded');
  };

  return (
    <Card className="my-auto">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Recorded video</CardTitle>
          <CardDescription>
            {formatDuration(recording.durationMs)} · {fileExtension(recording.mimeType).toUpperCase()} ·{' '}
            {formatBytes(recording.blob.size)}
          </CardDescription>
        </div>
        {saved ? <Badge variant="secondary">Saved</Badge> : <Badge variant="outline">Not saved yet</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {recording.blob.size > LARGE_FILE_BYTES && (
          <LargeFileNotice size={recording.blob.size} onCompress={() => void save(true)} />
        )}
        <RecordedVideo blob={recording.blob} />
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDiscardOpen(true)}
          >
            <Trash2 /> Discard
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => startNew()}>
              <Plus /> New recording
            </Button>
            <Button onClick={() => void save()}>
              <Save /> Save video
            </Button>
          </div>
        </div>
      </CardContent>
      <UnsavedDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onSave={() => void save().then((ok) => ok && startNew(true))}
        onDiscard={() => startNew(true)}
      />
      <ConfirmDeleteDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={() => void discard()}
        title="Discard this recording?"
        description={
          saved
            ? "It's removed from Latest videos. The copy you saved stays in your downloads."
            : "It's deleted and won't be in Latest videos. This can't be undone."
        }
        confirmLabel="Discard"
      />
      {saveDialog}
    </Card>
  );
}

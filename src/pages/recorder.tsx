import { Camera, Circle, Mic, Monitor, Pause, Play, Plus, Save, Square, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceTiles } from '@/components/choice-tiles';
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
import { useSettings } from '@/hooks/use-settings';
import { CaptureError } from '@/lib/capture';
import { LARGE_FILE_BYTES } from '@/lib/compress';
import { deleteRecording, updateRecording } from '@/lib/db';
import { openAppTab } from '@/lib/download';
import { fileExtension, formatBytes, formatDuration, formatOptions, recordingFileName } from '@/lib/formats';
import { RecordingSession, type FinishedRecording } from '@/lib/session';
import {
  SCREEN_RESOLUTIONS,
  getSettings,
  updateSettings,
  type AudioSource,
  type CaptureSource,
  type ScreenResolutionId,
} from '@/lib/settings';

const SCREEN_RESOLUTION_OPTIONS = SCREEN_RESOLUTIONS.map((r) => ({ value: r.id as ScreenResolutionId, label: r.label }));

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
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

  const busy = phase.kind === 'starting' || phase.kind === 'recording' || phase.kind === 'stopping';
  useEffect(() => setBusy(busy), [busy]);
  useBeforeUnload(busy || (phase.kind === 'finished' && !phase.saved));

  const stop = async () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = undefined;
    setPhase({ kind: 'stopping' });
    focusThisWindow();
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
    try {
      const session = await RecordingSession.start(getSettings(), {
        onWarning: showCaptureError,
        onStateChange: (state) => {
          if (state === 'stopped') return;
          setPhase((p) => (p.kind === 'recording' ? { ...p, paused: state === 'paused' } : p));
        },
        onEndedExternally: () => void stop(),
      });
      sessionRef.current = session;
      setPhase({ kind: 'recording', session, paused: false });
    } catch (error) {
      showCaptureError(error);
      setPhase({ kind: 'idle' });
    }
  };

  // Stop cleanly if the page goes away mid-recording; chunks so far are already saved.
  useEffect(() => () => void sessionRef.current?.stop(false), []);

  if (phase.kind === 'recording' || phase.kind === 'stopping') {
    return (
      <LiveView
        session={phase.kind === 'recording' ? phase.session : undefined}
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>What do you want to capture?</CardTitle>
          <CardDescription>The screen option lets you pick your whole screen, a window or a Chrome tab.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChoiceTiles<CaptureSource>
            label="Capture"
            value={settings.captureSource}
            onChange={(captureSource) =>
              updateSettings({
                captureSource,
                // System audio needs a screen to come from.
                ...(captureSource === 'camera' && settings.audioSource.startsWith('system')
                  ? { audioSource: settings.audioSource === 'system-microphone' ? 'microphone' : 'none' }
                  : {}),
              })
            }
            choices={[
              { value: 'screen', label: 'Only screen', icons: [Monitor] },
              { value: 'camera', label: 'Only camera', icons: [Camera] },
              { value: 'screen-camera', label: 'Screen + camera', icons: [Monitor, Camera] },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record audio?</CardTitle>
          <CardDescription>
            System audio is the sound from the screen, window or tab you share.
            {!wantsScreen && ' It needs a screen capture.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChoiceTiles<AudioSource>
            label="Audio"
            value={settings.audioSource}
            onChange={(audioSource) => updateSettings({ audioSource })}
            choices={[
              { value: 'none', label: 'None', icons: [VolumeX] },
              { value: 'microphone', label: 'Microphone', icons: [Mic] },
              { value: 'system-microphone', label: 'System + mic', icons: [Volume2, Mic], disabled: !wantsScreen },
              { value: 'system', label: 'System', icons: [Volume2], disabled: !wantsScreen },
            ]}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="format" className="text-muted-foreground">
              Format
            </Label>
            <OptionSelect
              id="format"
              className="w-28"
              items={formatOptions()}
              value={settings.format}
              onValueChange={(format) => updateSettings({ format })}
            />
          </div>
          {wantsScreen && (
            <div className="flex items-center gap-2">
              <Label htmlFor="screen-resolution" className="text-muted-foreground">
                Resolution
              </Label>
              <OptionSelect
                id="screen-resolution"
                className="w-44"
                items={SCREEN_RESOLUTION_OPTIONS}
                value={settings.screenResolution}
                onValueChange={(screenResolution) => updateSettings({ screenResolution })}
              />
            </div>
          )}
        </div>
        <Button size="lg" onClick={() => void start()} disabled={phase.kind === 'starting'}>
          <Circle className="fill-record text-record" />
          {phase.kind === 'starting' ? 'Starting…' : 'Start recording'}
        </Button>
      </div>
    </div>
  );
}

function LiveView({ session, paused, onStop }: { session?: RecordingSession; paused: boolean; onStop: () => void }) {
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3">
            {!paused && <span className="bg-record absolute inline-flex size-full animate-ping rounded-full opacity-75" />}
            <span className={`relative inline-flex size-3 rounded-full ${paused ? 'bg-muted-foreground' : 'bg-record'}`} />
          </span>
          <CardTitle>{session ? (paused ? 'Paused' : 'Recording') : 'Finishing…'}</CardTitle>
        </div>
        <span className="font-mono text-2xl tabular-nums">{formatDuration(session?.elapsedMs ?? 0)}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <video ref={video} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black object-contain" />
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="lg" disabled={!session} onClick={() => session?.togglePause()}>
            {paused ? <Play /> : <Pause />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="destructive" size="lg" disabled={!session} onClick={onStop}>
            <Square className="fill-current" /> Stop
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
    <Card>
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

// One recording: gathers the streams the user picked, composites them, and records
// the result with MediaRecorder. Chunks go to IndexedDB as they arrive (autosave).
import { AudioMixer, CaptureError, captureCamera, captureMicrophone, captureScreen } from './capture';
import { Compositor, videoFor } from './compositor';
import {
  addChunk,
  createRecording,
  getRecordingBlob,
  pruneRecordings,
  replaceRecordingBlob,
  updateRecording,
} from './db';
import { isWebm, pickMimeType } from './formats';
import { makeSeekable } from './optimize';
import { cameraResolution, screenResolution, type Settings } from './settings';

/** How often MediaRecorder hands over a chunk, i.e. the most a crash can lose. */
const CHUNK_MS = 5000;

export type SessionState = 'recording' | 'paused' | 'stopped';

export interface FinishedRecording {
  id: number;
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface SessionCallbacks {
  /** Something optional failed (e.g. no system audio); recording carries on without it. */
  onWarning(error: CaptureError): void;
  onStateChange(state: SessionState): void;
  /** The user ended it outside the app, via Chrome's "Stop sharing" bar. */
  onEndedExternally(): void;
}

export class RecordingSession {
  readonly preview: MediaStream;
  private readonly recorder: MediaRecorder;
  private readonly cleanup: (() => void)[];
  private recordingId?: number;
  private writes = Promise.resolve();
  private startedAt = 0;
  private pausedAt = 0;
  private pausedMs = 0;
  private finished?: Promise<FinishedRecording>;

  private constructor(
    preview: MediaStream,
    recorder: MediaRecorder,
    cleanup: (() => void)[],
    private readonly callbacks: SessionCallbacks,
  ) {
    this.preview = preview;
    this.recorder = recorder;
    this.cleanup = cleanup;
  }

  /** Asks for the picked sources (shows the screen picker) and starts recording. */
  static async start(settings: Settings, callbacks: SessionCallbacks): Promise<RecordingSession> {
    const cleanup: (() => void)[] = [];
    const stopStream = (stream: MediaStream) => cleanup.push(() => stream.getTracks().forEach((t) => t.stop()));
    const wantsScreen = settings.captureSource !== 'camera';
    const wantsCamera = settings.captureSource !== 'screen';
    const wantsMic = settings.audioSource === 'microphone' || settings.audioSource === 'system-microphone';
    const wantsSystem = wantsScreen && (settings.audioSource === 'system' || settings.audioSource === 'system-microphone');

    try {
      const mixer = settings.audioSource === 'none' ? undefined : new AudioMixer();
      if (mixer) cleanup.push(() => mixer.close());

      // Optional extras first, so their permission prompts come before the screen picker.
      if (wantsMic) {
        try {
          const mic = await captureMicrophone(settings.microphoneId);
          stopStream(mic);
          mixer?.add(mic);
        } catch (error) {
          callbacks.onWarning(error as CaptureError);
        }
      }

      let camera: HTMLVideoElement | undefined;
      if (wantsCamera) {
        const { width, height } = cameraResolution(settings.cameraResolution);
        try {
          const stream = await captureCamera(settings.cameraId, width, height, settings.frameRate);
          stopStream(stream);
          camera = await videoFor(stream);
        } catch (error) {
          // Camera only can't go ahead without one.
          if (!wantsScreen) throw error;
          callbacks.onWarning(error as CaptureError);
        }
      }

      let compositor: Compositor;
      let screenStream: MediaStream | undefined;
      if (wantsScreen) {
        const screenCapture = await captureScreen(wantsSystem, settings.frameRate, screenResolution(settings.screenResolution));
        screenStream = screenCapture.stream;
        stopStream(screenStream);
        if (wantsSystem && !screenCapture.hasAudio) {
          callbacks.onWarning(new CaptureError('system-audio', 'The source you picked has no audio to share'));
        }
        mixer?.add(screenStream);
        const screenVideo = await videoFor(screenStream);
        compositor = new Compositor(screenVideo.videoWidth, screenVideo.videoHeight, settings.frameRate);
        compositor.addFullFrame(screenVideo);
        if (camera) {
          compositor.addOverlay(camera, {
            position: settings.cameraPosition,
            size: settings.cameraSize,
            shape: settings.cameraShape,
            zoom: settings.cameraZoom,
            mirror: settings.cameraMirror,
          });
        }
      } else {
        compositor = new Compositor(camera!.videoWidth, camera!.videoHeight, settings.frameRate);
        compositor.addFullFrame(camera!, settings.cameraMirror);
      }
      cleanup.unshift(() => compositor.stop());

      const canvasStream = compositor.start();
      cleanup.push(() => canvasStream.getTracks().forEach((t) => t.stop()));
      const audioTracks = mixer?.stream.getAudioTracks() ?? [];
      const recorded = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
      const mimeType = pickMimeType(settings.format);
      const recorder = new MediaRecorder(recorded, { mimeType });

      const session = new RecordingSession(canvasStream, recorder, cleanup, callbacks);
      screenStream?.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state === 'inactive') return;
        callbacks.onEndedExternally();
      });
      await session.begin(mimeType);
      return session;
    } catch (error) {
      cleanup.forEach((fn) => fn());
      throw error;
    }
  }

  private async begin(mimeType: string): Promise<void> {
    await pruneRecordings();
    const id = await createRecording(mimeType);
    this.recordingId = id;
    this.recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      this.writes = this.writes.then(() => addChunk(id, event.data)).catch(console.error);
    };
    this.recorder.start(CHUNK_MS);
    this.startedAt = performance.now();
    this.callbacks.onStateChange('recording');
  }

  get mimeType(): string {
    return this.recorder.mimeType;
  }

  get elapsedMs(): number {
    if (!this.startedAt) return 0;
    const end = this.pausedAt || performance.now();
    return end - this.startedAt - this.pausedMs;
  }

  togglePause(): void {
    if (this.recorder.state === 'recording') {
      this.recorder.pause();
      this.pausedAt = performance.now();
      this.callbacks.onStateChange('paused');
    } else if (this.recorder.state === 'paused') {
      this.recorder.resume();
      this.pausedMs += performance.now() - this.pausedAt;
      this.pausedAt = 0;
      this.callbacks.onStateChange('recording');
    }
  }

  /** Stops recording and returns the finished video. Safe to call more than once. */
  stop(optimize: boolean): Promise<FinishedRecording> {
    this.finished ??= new Promise<void>((resolve) => {
      if (this.recorder.state === 'inactive') resolve();
      else {
        this.recorder.addEventListener('stop', () => resolve(), { once: true });
        this.recorder.stop();
      }
    }).then(async () => {
      const durationMs = this.elapsedMs;
      this.cleanup.forEach((fn) => fn());
      this.callbacks.onStateChange('stopped');
      // The last chunk arrives just before `stop`; wait until everything is written.
      await this.writes;
      const id = this.recordingId!;
      let blob = (await getRecordingBlob(id)) ?? new Blob([], { type: this.mimeType });
      if (optimize && isWebm(this.mimeType)) {
        blob = await makeSeekable(blob, durationMs);
        await replaceRecordingBlob(id, blob);
      }
      await updateRecording(id, { durationMs, seekable: optimize || !isWebm(this.mimeType) });
      return { id, blob, mimeType: this.mimeType, durationMs };
    });
    return this.finished;
  }
}

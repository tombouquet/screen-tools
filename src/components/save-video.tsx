import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { OptionSelect } from '@/components/option-select';
import { ShareSwitch, useConnectedDestinations } from '@/components/upload-dialog';
import { showUploadedToast, uploadErrorMessage, UploadProgress } from '@/components/upload-status';
import { navigate } from '@/hooks/use-route';
import { local } from '@/lib/connectors/local';
import type { Connector, ConnectorId } from '@/lib/connectors/types';
import {
  UploadCancelled,
  cancel as cancelUpload,
  getLiveUploads,
  startUpload,
  subscribeUploads,
  useUploadGuard,
} from '@/lib/connectors/upload';
import {
  CompressionCancelled,
  analyzeVideo,
  compressVideo,
  planPresets,
  suggestedPreset,
  type CompressionJob,
  type PresetPlan,
  type VideoInfo,
} from '@/lib/compress';
import { updateRecording } from '@/lib/db';
import { downloadBlob } from '@/lib/download';
import { cleanFileName, fileExtension, formatBytes, splitFileName } from '@/lib/formats';
import { destinationFor, getSettings, updateSettings, type SaveSize } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { platform } from '@/platform';

interface SaveRequest {
  blob: Blob;
  mimeType: string;
  fileName: string;
  /** Preselect the suggested compression preset (opened from the "too big" notice). */
  suggestCompression: boolean;
  recordingId?: number;
  /** The name it was saved as, without the extension, or undefined if cancelled. */
  resolve: (savedAs: string | undefined) => void;
}

export interface SaveOptions {
  suggestCompression?: boolean;
  /** The stored recording being saved, so uploads of it are listed with it. */
  recordingId?: number;
}

/**
 * Saving a video. With "show save options" on (the default), Save opens a dialog for the
 * file name, size and destination: this computer or a connected service. Sizes are the
 * original or a compressed copy at one of the presets; a compressed copy is made first
 * and then saved or uploaded. `save` resolves with the file name (without its extension)
 * once the download starts or the upload finishes, or undefined if the user cancels.
 * Saving a stored recording under a new name keeps that name on the recording.
 * Render `dialog` somewhere in the page.
 */
export function useSaveVideo() {
  const [request, setRequest] = useState<SaveRequest>();
  useUploadGuard();

  const save = (blob: Blob, mimeType: string, fileName: string, options: SaveOptions = {}): Promise<string | undefined> => {
    if (!getSettings().showSaveOptions && !options.suggestCompression) {
      downloadBlob(blob, fileName);
      return Promise.resolve(splitFileName(fileName).base);
    }
    return new Promise((resolve) =>
      setRequest({
        blob,
        mimeType,
        fileName,
        suggestCompression: Boolean(options.suggestCompression),
        recordingId: options.recordingId,
        resolve,
      }),
    );
  };

  const finish = (savedAs?: string) => {
    request?.resolve(savedAs);
    setRequest(undefined);
  };

  const dialog = request && <SaveDialog key={request.fileName} request={request} onDone={finish} />;
  return { save, dialog };
}

type Sizes = { kind: 'loading' } | { kind: 'ready'; info: VideoInfo; plans: PresetPlan[] } | { kind: 'unavailable' };

const percentSmaller = (from: number, to: number) => Math.max(0, Math.round((1 - to / from) * 100));
const baseMime = (mimeType: string) => mimeType.split(';')[0]!.trim();

type Progressing =
  | { kind: 'compress'; plan: PresetPlan; fraction: number }
  | { kind: 'upload'; connector: Connector; uploadId?: number };

function SaveDialog({ request, onDone }: { request: SaveRequest; onDone: (savedAs?: string) => void }) {
  const { base, extension } = splitFileName(request.fileName);
  const [name, setName] = useState(base);
  const [size, setSize] = useState<SaveSize>('original');
  const [sizes, setSizes] = useState<Sizes>({ kind: 'loading' });
  const [progress, setProgress] = useState<Progressing>();
  const [error, setError] = useState<string>();
  const job = useRef<CompressionJob>(undefined);
  const upload = useRef<number>(undefined);
  // Set once the dialog is cancelled or gone, so an upload still starting stops straight away.
  const closed = useRef(false);
  const live = useSyncExternalStore(subscribeUploads, getLiveUploads);

  const destinations = useConnectedDestinations('video');
  const [chosen, setChosen] = useState<ConnectorId>(getSettings().saveDestination);
  const [share, setShare] = useState(getSettings().shareLink);
  // Falls back to this computer when the remembered service isn't connected any more.
  const destination = destinationFor(chosen, destinations.map((d) => d.id));
  const cloud = destinations.find((d) => d.id === destination);

  // Work out the presets' estimated sizes, then pick last time's size (or the suggestion).
  useEffect(() => {
    let stale = false;
    analyzeVideo(request.blob)
      .then(async (info) => ({ info, plans: await planPresets(info, request.mimeType) }))
      .then(
        ({ info, plans }) => {
          if (stale) return;
          setSizes({ kind: 'ready', info, plans });
          const remembered = getSettings().saveSize;
          const usable = (id: SaveSize) =>
            id === 'original' || plans.some((p) => p.preset.id === id && p.worthIt && p.encodable);
          const initial = request.suggestCompression ? suggestedPreset(plans) : remembered;
          setSize(initial && usable(initial) ? initial : 'original');
        },
        () => !stale && setSizes({ kind: 'unavailable' }),
      );
    closed.current = false;
    return () => {
      stale = true;
      closed.current = true;
      job.current?.cancel();
      if (upload.current !== undefined) cancelUpload(upload.current);
    };
  }, [request]);

  const cancel = () => {
    closed.current = true;
    job.current?.cancel();
    job.current = undefined;
    if (upload.current !== undefined) cancelUpload(upload.current);
    upload.current = undefined;
    onDone();
  };

  /** Hands the (possibly compressed) file to the chosen destination. */
  const deliver = async (blob: Blob, mimeType: string, fileName: string) => {
    if (!cloud) {
      downloadBlob(blob, fileName);
      onDone(splitFileName(fileName).base);
      return;
    }
    setProgress({ kind: 'upload', connector: cloud });
    try {
      const current = await startUpload({
        source: request.recordingId !== undefined ? { kind: 'recording', id: request.recordingId } : undefined,
        connectorId: cloud.id,
        job: { blob, fileName, mimeType: baseMime(mimeType), kind: 'video', share: cloud.links === 'always' || share },
        // The original is in the recording already; a compressed copy has to be kept for a resume.
        blobIsSource: blob === request.blob,
      });
      if (closed.current) cancelUpload(current.id);
      upload.current = current.id;
      setProgress({ kind: 'upload', connector: cloud, uploadId: current.id });
      const result = await current.promise;
      if (upload.current !== current.id) return;
      upload.current = undefined;
      showUploadedToast(cloud, result);
      onDone(splitFileName(fileName).base);
    } catch (reason) {
      if (reason instanceof UploadCancelled) return;
      console.error(reason);
      upload.current = undefined;
      setProgress(undefined);
      setError(uploadErrorMessage(cloud, reason));
    }
  };

  const save = () => {
    const chosenBase = cleanFileName(name) || base;
    // Keep a name the user typed, so the list can show it and the next save starts from it.
    if (request.recordingId !== undefined && chosenBase !== base) {
      void updateRecording(request.recordingId, { name: chosenBase });
    }
    updateSettings({ saveSize: size, saveDestination: destination, ...(cloud ? { shareLink: share } : {}) });
    setError(undefined);
    const plan = sizes.kind === 'ready' ? sizes.plans.find((p) => p.preset.id === size) : undefined;
    if (!plan) {
      void deliver(request.blob, request.mimeType, `${chosenBase}${extension}`);
      return;
    }
    setProgress({ kind: 'compress', plan, fraction: 0 });
    const current = compressVideo(request.blob, request.mimeType, plan, (fraction) =>
      setProgress((p) => (p?.kind === 'compress' ? { ...p, fraction } : p)),
    );
    job.current = current;
    current.promise.then(
      (result) => {
        if (job.current !== current) return;
        job.current = undefined;
        void deliver(result.blob, result.mimeType, `${chosenBase}.${fileExtension(result.mimeType)}`);
      },
      (reason: unknown) => {
        if (job.current !== current) return;
        job.current = undefined;
        setProgress(undefined);
        if (reason instanceof CompressionCancelled) return;
        console.error(reason);
        setError(`Couldn't compress this video: ${reason instanceof Error ? reason.message : String(reason)}`);
      },
    );
  };

  const busy = Boolean(progress);
  const uploading = progress?.kind === 'upload' ? progress : undefined;
  const uploadProgress = uploading?.uploadId !== undefined ? live.get(uploading.uploadId) : undefined;
  const submitLabel = cloud
    ? size === 'original'
      ? 'Upload'
      : 'Compress and upload'
    : size === 'original'
      ? 'Save'
      : 'Compress and save';

  return (
    <Dialog open onOpenChange={(open) => !open && cancel()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Save video</DialogTitle>
            <DialogDescription>{cloud ? cloud.description : 'It goes to your downloads folder.'}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="file-name">File name</Label>
            <Input
              id="file-name"
              value={name}
              autoFocus
              disabled={busy}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {uploading ? (
            <UploadProgress
              connector={uploading.connector}
              sentBytes={uploadProgress?.sentBytes ?? 0}
              size={uploadProgress?.size ?? 0}
            />
          ) : progress?.kind === 'compress' ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>
                  Compressing ({progress.plan.preset.label}, ≈ {formatBytes(progress.plan.estimatedBytes)})…
                </span>
                <span className="tabular-nums">{Math.round(progress.fraction * 100)}%</span>
              </div>
              <Progress value={Math.round(progress.fraction * 100)} />
              <p className="text-muted-foreground text-xs">
                {cloud ? `It uploads to ${cloud.name}` : 'It downloads'} when it's done. Long videos can take a while; keep
                this window open.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="save-destination">Save to</Label>
                <OptionSelect
                  id="save-destination"
                  items={[
                    { value: 'local' as ConnectorId, label: local.name, icon: local.icon },
                    ...destinations.map((d) => ({ value: d.id, label: d.name, icon: d.icon })),
                  ]}
                  value={destination}
                  onValueChange={setChosen}
                />
                {destinations.length === 0 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline underline-offset-4"
                    onClick={() => {
                      onDone();
                      navigate('/settings/uploads');
                    }}
                  >
                    Connect a service or add an upload server in Settings
                  </button>
                )}
              </div>
              {cloud && cloud.links !== 'always' && <ShareSwitch checked={share} onChange={setShare} />}
              <div className="grid gap-2">
                <Label>Size</Label>
                <RadioGroup value={size} onValueChange={(v) => setSize(v as SaveSize)} className="gap-2">
                  <SizeOption
                    value="original"
                    label="Original"
                    description={
                      sizes.kind === 'ready'
                        ? `Full quality, ${sizes.info.width}×${sizes.info.height}.`
                        : 'Full quality, as recorded.'
                    }
                    selected={size === 'original'}
                    size={formatBytes(request.blob.size)}
                  />
                  {sizes.kind === 'loading' && (
                    <p className="text-muted-foreground flex items-center gap-2 px-1 py-2 text-xs">
                      <Loader2 className="size-3.5 animate-spin" /> Working out smaller sizes…
                    </p>
                  )}
                  {sizes.kind === 'unavailable' && (
                    <p className="text-muted-foreground px-1 py-2 text-xs">This file can't be compressed.</p>
                  )}
                  {sizes.kind === 'ready' && !sizes.plans.some((p) => p.encodable) && (
                    <p className="text-muted-foreground px-1 py-2 text-xs">
                      {platform.name} can't encode this video on this computer, so only the original can be saved.
                    </p>
                  )}
                  {sizes.kind === 'ready' &&
                    sizes.plans
                      .filter((plan) => plan.encodable)
                      .map((plan) => (
                        <SizeOption
                          key={plan.preset.id}
                          value={plan.preset.id}
                          label={plan.preset.label}
                          description={`${plan.preset.description} ${plan.width}×${plan.height}.`}
                          selected={size === plan.preset.id}
                          disabled={!plan.worthIt}
                          size={plan.worthIt ? `≈ ${formatBytes(plan.estimatedBytes)}` : 'No smaller'}
                          badge={plan.worthIt ? `${percentSmaller(sizes.info.size, plan.estimatedBytes)}% smaller` : undefined}
                        />
                      ))}
                </RadioGroup>
                {sizes.kind === 'ready' && sizes.plans.some((p) => p.encodable) && (
                  <p className="text-muted-foreground text-xs">
                    Smaller sizes are estimates. Recordings with little movement usually come out smaller.
                  </p>
                )}
              </div>
            </>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancel}>
              {busy ? 'Stop' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={busy}>
              {uploading ? 'Uploading…' : busy ? 'Compressing…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SizeOption({
  value,
  label,
  description,
  selected,
  disabled,
  size,
  badge,
}: {
  value: string;
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  size: string;
  badge?: string;
}) {
  const id = `size-${value}`;
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 font-normal',
        selected && 'border-primary bg-primary/5',
        disabled && 'opacity-50',
      )}
    >
      <RadioGroupItem id={id} value={value} disabled={disabled} />
      <span className="flex-1 space-y-0.5">
        <span className="block font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </span>
      <span className="space-y-1 text-right">
        <span className="block font-medium tabular-nums">{size}</span>
        {badge && (
          <Badge variant="secondary" className="tabular-nums">
            {badge}
          </Badge>
        )}
      </span>
    </Label>
  );
}

/** Shown on a video over the sharing limit; opens the save dialog with a smaller size picked. */
export function LargeFileNotice({ size, onCompress }: { size: number; onCompress: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <span className="min-w-52 flex-1">
        <span className="font-medium">This video is {formatBytes(size)}.</span>{' '}
        <span className="text-muted-foreground">That's too big for email and many chat apps.</span>
      </span>
      <Button size="sm" onClick={onCompress}>
        Save a smaller copy
      </Button>
    </div>
  );
}

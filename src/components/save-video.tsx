import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  CompressionCancelled,
  PRESETS,
  analyzeVideo,
  compressedExtension,
  compressVideo,
  planPreset,
  suggestedPreset,
  type CompressionJob,
  type PresetPlan,
  type VideoInfo,
} from '@/lib/compress';
import { downloadBlob } from '@/lib/download';
import { cleanFileName, fileExtension, formatBytes, splitFileName } from '@/lib/formats';
import { getSettings, updateSettings, type SaveSize } from '@/lib/settings';
import { cn } from '@/lib/utils';

interface SaveRequest {
  blob: Blob;
  mimeType: string;
  fileName: string;
  /** Preselect the suggested compression preset (opened from the "too big" notice). */
  suggestCompression: boolean;
  resolve: (saved: boolean) => void;
}

export interface SaveOptions {
  suggestCompression?: boolean;
}

/**
 * Saving a video. With "show save options" on (the default), Save opens a dialog for the
 * file name and size: the original, or a compressed copy at one of the presets.
 * `save` resolves true once the download starts, false if the user cancels.
 * Render `dialog` somewhere in the page.
 */
export function useSaveVideo() {
  const [request, setRequest] = useState<SaveRequest>();

  const save = (blob: Blob, mimeType: string, fileName: string, options: SaveOptions = {}): Promise<boolean> => {
    if (!getSettings().showSaveOptions && !options.suggestCompression) {
      downloadBlob(blob, fileName);
      return Promise.resolve(true);
    }
    return new Promise((resolve) =>
      setRequest({ blob, mimeType, fileName, suggestCompression: Boolean(options.suggestCompression), resolve }),
    );
  };

  const finish = (saved: boolean) => {
    request?.resolve(saved);
    setRequest(undefined);
  };

  const dialog = request && <SaveDialog key={request.fileName} request={request} onDone={finish} />;
  return { save, dialog };
}

type Sizes = { kind: 'loading' } | { kind: 'ready'; info: VideoInfo; plans: PresetPlan[] } | { kind: 'unavailable' };

const percentSmaller = (from: number, to: number) => Math.max(0, Math.round((1 - to / from) * 100));

function SaveDialog({ request, onDone }: { request: SaveRequest; onDone: (saved: boolean) => void }) {
  const { base, extension } = splitFileName(request.fileName);
  const [name, setName] = useState(base);
  const [size, setSize] = useState<SaveSize>('original');
  const [sizes, setSizes] = useState<Sizes>({ kind: 'loading' });
  const [progress, setProgress] = useState<{ plan: PresetPlan; fraction: number }>();
  const [error, setError] = useState<string>();
  const job = useRef<CompressionJob>(undefined);

  // Work out the presets' estimated sizes, then pick last time's size (or the suggestion).
  useEffect(() => {
    let stale = false;
    analyzeVideo(request.blob).then(
      (info) => {
        if (stale) return;
        const plans = PRESETS.map((preset) => planPreset(preset, info));
        setSizes({ kind: 'ready', info, plans });
        const remembered = getSettings().saveSize;
        const usable = (id: SaveSize) => id === 'original' || plans.some((p) => p.preset.id === id && p.worthIt);
        const initial = request.suggestCompression ? suggestedPreset(plans) : remembered;
        setSize(initial && usable(initial) ? initial : 'original');
      },
      () => !stale && setSizes({ kind: 'unavailable' }),
    );
    return () => {
      stale = true;
      job.current?.cancel();
    };
  }, [request]);

  const cancel = () => {
    job.current?.cancel();
    job.current = undefined;
    onDone(false);
  };

  const save = () => {
    const chosenBase = cleanFileName(name) || base;
    updateSettings({ saveSize: size });
    const plan = sizes.kind === 'ready' ? sizes.plans.find((p) => p.preset.id === size) : undefined;
    if (!plan) {
      downloadBlob(request.blob, `${chosenBase}${extension}`);
      onDone(true);
      return;
    }
    setError(undefined);
    setProgress({ plan, fraction: 0 });
    const current = compressVideo(request.blob, request.mimeType, plan, (fraction) =>
      setProgress((p) => p && { ...p, fraction }),
    );
    job.current = current;
    current.promise.then(
      (result) => {
        if (job.current !== current) return;
        job.current = undefined;
        downloadBlob(result.blob, `${chosenBase}.${fileExtension(result.mimeType)}`);
        onDone(true);
      },
      (reason: unknown) => {
        if (job.current !== current) return;
        job.current = undefined;
        setProgress(undefined);
        if (reason instanceof CompressionCancelled) return;
        console.error(reason);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
  };

  const busy = Boolean(progress);

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
            <DialogDescription>It goes to your downloads folder.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="file-name">File name</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file-name"
                value={name}
                autoFocus
                disabled={busy}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setName(event.target.value)}
              />
              <span className="text-muted-foreground text-sm">
                {size === 'original' || sizes.kind !== 'ready' ? extension : compressedExtension(request.mimeType)}
              </span>
            </div>
          </div>

          {progress ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>
                  Compressing ({progress.plan.preset.label}, ≈ {formatBytes(progress.plan.estimatedBytes)})…
                </span>
                <span className="tabular-nums">{Math.round(progress.fraction * 100)}%</span>
              </div>
              <Progress value={Math.round(progress.fraction * 100)} />
              <p className="text-muted-foreground text-xs">
                It downloads when it's done. Long videos can take a while; keep this window open.
              </p>
            </div>
          ) : (
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
                {sizes.kind === 'ready' &&
                  sizes.plans.map((plan) => (
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
              {sizes.kind === 'ready' && (
                <p className="text-muted-foreground text-xs">
                  Smaller sizes are estimates. Recordings with little movement usually come out smaller.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-destructive text-sm">Couldn't compress this video: {error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancel}>
              {busy ? 'Stop' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Compressing…' : size === 'original' ? 'Save' : 'Compress and save'}
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

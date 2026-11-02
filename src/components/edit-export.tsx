import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Edit } from '@/lib/edit/model';
import {
  EXACT_SHIFT_S,
  RenderCancelled,
  planRender,
  renderEdit,
  type RenderJob,
  type RenderMode,
  type RenderPlan,
  type RenderResult,
} from '@/lib/edit/render';
import type { EditSource } from '@/lib/edit/source';
import { formatDuration } from '@/lib/formats';
import { cn } from '@/lib/utils';

/** Shifts up to this long are offered as the default; longer ones default to re-encoding. */
const FAST_DEFAULT_SHIFT_S = 0.5;

/**
 * Works out how the edit can be exported, lets the user pick fast (copy) or exact
 * (re-encode) when both work, and renders it with progress and a Stop button.
 */
export function ExportDialog({
  edit,
  sources,
  onDone,
  onClose,
}: {
  edit: Edit;
  sources: Map<string, EditSource>;
  onDone: (result: RenderResult) => void;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<RenderPlan>();
  const [mode, setMode] = useState<RenderMode>('encode');
  const [fraction, setFraction] = useState<number>();
  const [error, setError] = useState<string>();
  const job = useRef<RenderJob>(undefined);

  useEffect(() => {
    let stale = false;
    planRender(edit, sources).then(
      (next) => {
        if (stale) return;
        setPlan(next);
        setMode(!next.copyBlocked && next.copyShiftS <= FAST_DEFAULT_SHIFT_S ? 'copy' : 'encode');
      },
      (reason: unknown) => {
        if (stale) return;
        console.error(reason);
        setPlan({ copyBlocked: "This video's format can't be copied.", copyShiftS: 0, copyContainer: 'mp4', encodeContainer: 'mp4', durationS: 0 });
      },
    );
    return () => {
      stale = true;
      job.current?.cancel();
    };
  }, [edit, sources]);

  const start = () => {
    if (!plan) return;
    setError(undefined);
    setFraction(0);
    const current = renderEdit(edit, sources, mode, plan, setFraction);
    job.current = current;
    current.promise.then(
      (result) => {
        if (job.current !== current) return;
        job.current = undefined;
        onDone(result);
      },
      (reason: unknown) => {
        if (job.current !== current) return;
        job.current = undefined;
        setFraction(undefined);
        if (reason instanceof RenderCancelled) return;
        console.error(reason);
        setError(`Couldn't export this edit: ${reason instanceof Error ? reason.message : String(reason)}`);
      },
    );
  };

  const stop = () => {
    job.current?.cancel();
    job.current = undefined;
    setFraction(undefined);
  };

  const busy = fraction !== undefined;
  const exact = plan && !plan.copyBlocked && plan.copyShiftS <= EXACT_SHIFT_S;

  return (
    <Dialog open onOpenChange={(open) => !open && (busy ? stop() : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export edit</DialogTitle>
          <DialogDescription>
            Makes a new {plan ? formatDuration(plan.durationS * 1000) : ''} video on your computer. The original stays as it is.
          </DialogDescription>
        </DialogHeader>

        {!plan ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Checking the clips…
          </p>
        ) : busy ? (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>{mode === 'copy' ? 'Copying' : 'Re-encoding'}…</span>
              <span className="tabular-nums">{Math.round(fraction * 100)}%</span>
            </div>
            <Progress value={Math.round(fraction * 100)} />
            <p className="text-muted-foreground text-xs">Long videos can take a while; keep this window open.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label>How</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as RenderMode)} className="gap-2">
              <ModeOption
                value="copy"
                label={exact ? 'Copy (fast, no quality loss)' : 'Fast'}
                selected={mode === 'copy'}
                disabled={Boolean(plan.copyBlocked)}
                description={
                  plan.copyBlocked
                    ? `Not available: ${plan.copyBlocked.charAt(0).toLowerCase()}${plan.copyBlocked.slice(1)}`
                    : exact
                      ? `Copies the video as it is, so it takes seconds. ${plan.copyContainer.toUpperCase()}.`
                      : `Copies the video as it is: quick, no quality loss. Cuts can only start on a keyframe, so a cut may start up to ${plan.copyShiftS.toFixed(1)} s earlier. ${plan.copyContainer.toUpperCase()}.`
                }
              />
              <ModeOption
                value="encode"
                label="Exact"
                selected={mode === 'encode'}
                description={`Re-encodes the video: slower, and needed for sped-up parts and mixed formats. Cuts land on the exact frame. ${plan.encodeContainer.toUpperCase()}.`}
              />
            </RadioGroup>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={busy ? stop : onClose}>
            {busy ? 'Stop' : 'Cancel'}
          </Button>
          <Button type="button" disabled={!plan || busy || !plan.durationS} onClick={start}>
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  value,
  label,
  description,
  selected,
  disabled,
}: {
  value: RenderMode;
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
}) {
  const id = `export-${value}`;
  return (
    <Label
      htmlFor={id}
      className={cn('flex items-start gap-3 rounded-lg border p-3 font-normal', selected && 'border-primary bg-primary/5', disabled && 'opacity-50')}
    >
      <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-0.5" />
      <span className="flex-1 space-y-0.5">
        <span className="block font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </span>
    </Label>
  );
}

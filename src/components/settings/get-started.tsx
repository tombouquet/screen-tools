import { ArrowRight, Camera, Check, CloudUpload, ExternalLink, Loader2, Mic, PartyPopper, Rocket, ShieldCheck, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { browser } from 'wxt/browser';
import { CameraPreviewDialog } from '@/components/camera-preview-dialog';
import { MicTest } from '@/components/mic-test';
import { SectionHeader } from '@/components/settings/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { navigate } from '@/hooks/use-route';
import type { PermissionCheck } from '@/lib/capture';
import type { Connection } from '@/lib/connectors/types';
import { openAppTab } from '@/lib/download';
import type { Settings } from '@/lib/settings';
import { markSetup, type SetupProgress } from '@/lib/setup';
import { cn } from '@/lib/utils';

/** The required checks, in order. Connecting an upload service is extra. */
export function setupSteps(permission: PermissionCheck | undefined, setup: SetupProgress) {
  return [permission?.state === 'granted', setup.cameraChecked, setup.micChecked];
}

export function GetStartedSection({
  settings,
  permission,
  onRetry,
  setup,
  connections,
}: {
  settings: Settings;
  permission?: PermissionCheck;
  onRetry: () => void;
  setup: SetupProgress;
  connections?: Connection[];
}) {
  const steps = setupSteps(permission, setup);
  const done = steps.filter(Boolean).length;
  const allDone = done === steps.length;
  const [previewOpen, setPreviewOpen] = useState(false);
  const allowed = permission?.state === 'granted';
  const connected = Boolean(connections?.some((c) => c.connector !== 'local'));

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Rocket}
        title="Get started"
        description="A few quick checks so your first recording just works. Takes about a minute."
      />

      <div className="bg-card space-y-3 rounded-xl border p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{allDone ? "You're all set" : 'Your setup'}</span>
          <span className="text-muted-foreground tabular-nums">
            {done} of {steps.length} done
          </span>
        </div>
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-green-500 transition-[width] duration-500"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        {allDone && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <PartyPopper className="size-5 text-green-600" />
            <p className="min-w-48 flex-1 text-sm">Camera and microphone are working. You're ready to record.</p>
            <Button size="sm" onClick={() => navigate('/')}>
              <Video /> Start a recording
            </Button>
          </div>
        )}
      </div>

      <ol className="space-y-3">
        <Step
          number={1}
          icon={ShieldCheck}
          title="Allow camera and microphone"
          description="Your browser asks once. Screen Tools only uses them while you record or test."
          done={allowed}
        >
          <PermissionStatus permission={permission} onRetry={onRetry} />
        </Step>

        <Step
          number={2}
          icon={Camera}
          title="Check your camera"
          description="See how you'll look over your screen in Screen + camera recordings."
          done={setup.cameraChecked}
        >
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={setup.cameraChecked ? 'outline' : 'default'} onClick={() => setPreviewOpen(true)}>
              <Camera /> Open camera preview
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/settings/camera')}>
              Camera settings <ArrowRight />
            </Button>
          </div>
          <CameraPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            settings={settings}
            onLive={() => markSetup({ cameraChecked: true })}
          />
        </Step>

        <Step
          number={3}
          icon={Mic}
          title="Check your microphone"
          description="Start the test and say a few words. The bar moves when it hears you."
          done={setup.micChecked}
        >
          <MicTest deviceId={settings.microphoneId} onHeard={() => markSetup({ micChecked: true })} />
        </Step>

        <Step
          icon={CloudUpload}
          title="Share by link"
          optional
          description="Connect Google Drive, Dropbox or your own server to upload a recording and copy a link."
          done={connected}
        >
          <Button size="sm" variant="outline" onClick={() => navigate('/settings/uploads')}>
            {connected ? 'Manage uploads' : 'Set up uploads'} <ArrowRight />
          </Button>
        </Step>
      </ol>
    </div>
  );
}

function Step({
  number,
  icon: Icon,
  title,
  description,
  done,
  optional,
  children,
}: {
  number?: number;
  icon: LucideIcon;
  title: string;
  description: string;
  done: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        'bg-card flex gap-4 rounded-xl border p-5 transition-colors',
        done && 'border-green-500/40 bg-green-500/5',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
          done ? 'border-green-500 bg-green-500 text-white' : 'bg-muted text-muted-foreground',
        )}
        aria-label={done ? 'Done' : undefined}
      >
        {done ? <Check className="size-4" strokeWidth={3} /> : number ?? <Icon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {title}
            {optional && <Badge variant="outline">Optional</Badge>}
          </p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

function PermissionStatus({ permission, onRetry }: { permission?: PermissionCheck; onRetry: () => void }) {
  // The browser doesn't always show permission prompts in the popup window; a normal tab can.
  const [inPopupWindow, setInPopupWindow] = useState(false);
  useEffect(() => {
    void browser.windows.getCurrent().then((w) => setInPopupWindow(w.type === 'popup'));
  }, []);

  if (!permission) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Checking…
      </p>
    );
  }
  const message =
    permission.state === 'granted'
      ? 'Camera and microphone are allowed.'
      : permission.state === 'partial'
        ? `Only the ${permission.camera ? 'camera' : 'microphone'} is allowed.`
        : permission.state === 'denied'
          ? 'Access was blocked. Click the camera icon in the address bar, allow both, then try again.'
          : `Couldn't check access: ${permission.error}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DeviceBadge label="Camera" ok={permission.camera} />
        <DeviceBadge label="Microphone" ok={permission.microphone} />
        <span className={cn('text-sm', permission.state === 'granted' ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-500')}>
          {message}
        </span>
      </div>
      {permission.state !== 'granted' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onRetry}>
            Allow access
          </Button>
          {inPopupWindow && (
            <Button size="sm" variant="outline" onClick={() => openAppTab('/settings/get-started')}>
              <ExternalLink /> Open in a tab
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Badge variant={ok ? 'secondary' : 'outline'} className={cn(ok && 'text-green-700 dark:text-green-400')}>
      {ok ? <Check /> : null}
      {label}
    </Badge>
  );
}

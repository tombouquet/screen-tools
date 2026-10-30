import { CheckCircle2, ExternalLink, Monitor, Moon, ShieldAlert, Sun, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { useTheme } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { OptionSelect, type SelectOption } from '@/components/option-select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSettings } from '@/hooks/use-settings';
import { checkPermissions, listDevices, type PermissionCheck } from '@/lib/capture';
import { overlayBox } from '@/lib/compositor';
import { openAppTab } from '@/lib/download';
import { SQUIRCLE_CLIP_PATH } from '@/lib/squircle';
import { formatOptions } from '@/lib/formats';
import {
  CAMERA_POSITIONS,
  CAMERA_RESOLUTIONS,
  CAMERA_SHAPES,
  CAMERA_SIZES,
  SCREEN_RESOLUTIONS,
  SCREENSHOT_QUALITIES,
  FRAME_RATES,
  updateSettings,
  type CameraPosition,
  type CameraResolutionId,
  type CameraShape,
  type CameraSize,
  type FrameRate,
  type ScreenResolutionId,
  type ScreenshotQualityId,
  type Settings,
  type Theme,
} from '@/lib/settings';

const POSITION_LABELS: Record<CameraPosition, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};
const CAMERA_POSITION_OPTIONS = CAMERA_POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }));
const CAMERA_RESOLUTION_OPTIONS = CAMERA_RESOLUTIONS.map((r) => ({ value: r.id as CameraResolutionId, label: r.label }));
const SCREEN_RESOLUTION_OPTIONS = SCREEN_RESOLUTIONS.map((r) => ({ value: r.id as ScreenResolutionId, label: r.label }));
const SCREENSHOT_QUALITY_OPTIONS = SCREENSHOT_QUALITIES.map((q) => ({ value: q.id as ScreenshotQualityId, label: q.label }));
const IMAGE_FORMAT_OPTIONS = [
  { value: 'png' as const, label: 'PNG' },
  { value: 'jpg' as const, label: 'JPG' },
];
const FRAME_RATE_OPTIONS = FRAME_RATES.map((fps) => ({
  value: String(fps),
  label: fps === 60 ? '60 fps (smoother, bigger files)' : `${fps} fps`,
}));
const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1);
// The device selects use a stand-in value for "system default", stored as ''.
const DEFAULT_DEVICE = 'default-device';

export function SettingsPage() {
  const settings = useSettings();
  const [permission, setPermission] = useState<PermissionCheck>();
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] }>({
    cameras: [],
    microphones: [],
  });

  const check = useCallback(async () => {
    setPermission(undefined);
    setPermission(await checkPermissions());
    setDevices(await listDevices());
  }, []);
  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="space-y-4">
      <PermissionCard permission={permission} onRetry={() => void check()} />

      <Card>
        <CardHeader>
          <CardTitle>Video</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Screen resolution" id="screen-resolution">
            <OptionSelect
              id="screen-resolution"
              items={SCREEN_RESOLUTION_OPTIONS}
              value={settings.screenResolution}
              onValueChange={(screenResolution) => updateSettings({ screenResolution })}
            />
          </Field>
          <Field label="Preferred camera" id="camera">
            <DeviceSelect
              id="camera"
              devices={devices.cameras}
              value={settings.cameraId}
              onChange={(cameraId) => updateSettings({ cameraId })}
            />
          </Field>
          <Field label="Camera resolution" id="resolution">
            <OptionSelect
              id="resolution"
              items={CAMERA_RESOLUTION_OPTIONS}
              value={settings.cameraResolution}
              onValueChange={(cameraResolution) => updateSettings({ cameraResolution })}
            />
          </Field>
          <Field label="Output format" id="format">
            <OptionSelect
              id="format"
              items={formatOptions()}
              value={settings.format}
              onValueChange={(format) => updateSettings({ format })}
            />
          </Field>
          <Field label="Frame rate" id="frame-rate">
            <OptionSelect
              id="frame-rate"
              items={FRAME_RATE_OPTIONS}
              value={String(settings.frameRate)}
              onValueChange={(v) => updateSettings({ frameRate: Number(v) as FrameRate })}
            />
          </Field>
          <SwitchField
            id="save-options"
            label="Show save options"
            description="Pick a file name and size (original or a smaller copy) when saving. Off saves the original straight away with a dated name."
            checked={settings.showSaveOptions}
            onChange={(showSaveOptions) => updateSettings({ showSaveOptions })}
          />
          <SwitchField
            id="optimize"
            label="Optimize video (make seekable)"
            description="Writes the length into WebM files so you can skip around in them. Turn off if stopping a long recording is slow."
            checked={settings.optimizeVideo}
            onChange={(optimizeVideo) => updateSettings({ optimizeVideo })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Camera overlay</CardTitle>
          <CardDescription>How the camera looks in Screen + camera recordings.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-[1fr_220px]">
          <div className="space-y-5">
            <Field label="Position" id="position">
              <OptionSelect
                id="position"
                items={CAMERA_POSITION_OPTIONS}
                value={settings.cameraPosition}
                onValueChange={(cameraPosition) => updateSettings({ cameraPosition })}
              />
            </Field>
            <Field label="Size">
              <Segmented
                value={settings.cameraSize}
                options={CAMERA_SIZES}
                onChange={(cameraSize: CameraSize) => updateSettings({ cameraSize })}
              />
            </Field>
            <Field label="Shape">
              <Segmented
                value={settings.cameraShape}
                options={CAMERA_SHAPES}
                onChange={(cameraShape: CameraShape) => updateSettings({ cameraShape })}
              />
            </Field>
            <Field label={`Zoom · ${settings.cameraZoom.toFixed(1)}×`} id="zoom">
              <Slider
                id="zoom"
                min={1}
                max={2}
                step={0.1}
                value={settings.cameraZoom}
                onValueChange={(v) => updateSettings({ cameraZoom: typeof v === 'number' ? v : v[0]! })}
              />
            </Field>
            <SwitchField
              id="mirror"
              label="Mirror camera image"
              checked={settings.cameraMirror}
              onChange={(cameraMirror) => updateSettings({ cameraMirror })}
            />
          </div>
          <OverlayPreview settings={settings} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Preferred microphone" id="microphone">
            <DeviceSelect
              id="microphone"
              devices={devices.microphones}
              value={settings.microphoneId}
              onChange={(microphoneId) => updateSettings({ microphoneId })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Screenshots</CardTitle>
          <CardDescription>Native keeps every pixel of your screen; on a high-density display that's twice the page size.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Quality" id="screenshot-quality">
            <OptionSelect
              id="screenshot-quality"
              items={SCREENSHOT_QUALITY_OPTIONS}
              value={settings.screenshotQuality}
              onValueChange={(screenshotQuality) => updateSettings({ screenshotQuality })}
            />
          </Field>
          <Field label="Download format" id="image-format">
            <OptionSelect
              id="image-format"
              items={IMAGE_FORMAT_OPTIONS}
              value={settings.imageFormat}
              onValueChange={(imageFormat) => updateSettings({ imageFormat })}
            />
          </Field>
        </CardContent>
      </Card>

      <AppearanceCard />
    </div>
  );
}

function PermissionCard({ permission, onRetry }: { permission?: PermissionCheck; onRetry: () => void }) {
  const status = !permission
    ? { icon: ShieldAlert, text: 'Please grant permission', tone: 'text-muted-foreground' }
    : permission.state === 'granted'
      ? { icon: CheckCircle2, text: 'Permission granted', tone: 'text-green-600' }
      : permission.state === 'partial'
        ? { icon: ShieldAlert, text: 'Permission partially granted', tone: 'text-amber-600' }
        : permission.state === 'denied'
          ? { icon: XCircle, text: 'Permission denied', tone: 'text-destructive' }
          : { icon: XCircle, text: `Error getting media stream: ${permission.error}`, tone: 'text-destructive' };
  const Icon = status.icon;
  // The browser doesn't always show permission prompts in the popup window; a normal tab can.
  const [inPopupWindow, setInPopupWindow] = useState(false);
  useEffect(() => {
    void browser.windows.getCurrent().then((w) => setInPopupWindow(w.type === 'popup'));
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recording permission</CardTitle>
        <CardDescription>Camera and microphone access, for camera recordings and microphone audio.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Icon className={`size-5 ${status.tone}`} />
        <span className={`flex-1 text-sm font-medium ${status.tone}`}>{status.text}</span>
        {permission && (
          <span className="flex gap-2">
            <Badge variant={permission.camera ? 'secondary' : 'outline'}>Video {permission.camera ? '✓' : '✗'}</Badge>
            <Badge variant={permission.microphone ? 'secondary' : 'outline'}>
              Audio {permission.microphone ? '✓' : '✗'}
            </Badge>
          </span>
        )}
        {permission && permission.state !== 'granted' && (
          <span className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
            {inPopupWindow && (
              <Button size="sm" onClick={() => openAppTab('/settings')}>
                <ExternalLink /> Fix in new tab
              </Button>
            )}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          variant="outline"
          value={[theme]}
          onValueChange={(v) => v[0] && setTheme(v[0] as Theme)}
          aria-label="Theme"
        >
          <ToggleGroupItem value="light" className="px-4">
            <Sun /> Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" className="px-4">
            <Moon /> Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="system" className="px-4">
            <Monitor /> System
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}

/** A 16:9 sketch of a 1080p frame showing where the camera overlay will sit. */
function OverlayPreview({ settings }: { settings: Settings }) {
  const W = 1920;
  const H = 1080;
  const box = overlayBox(
    {
      position: settings.cameraPosition,
      size: settings.cameraSize,
      shape: settings.cameraShape,
      zoom: settings.cameraZoom,
      mirror: settings.cameraMirror,
    },
    W,
    H,
  );
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  return (
    <div className="space-y-2">
      <Label>Preview</Label>
      <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-md border">
        <div className="absolute inset-[8%] space-y-[6%] opacity-40">
          <div className="bg-muted-foreground/40 h-[8%] w-2/3 rounded-sm" />
          <div className="bg-muted-foreground/30 h-[6%] w-1/2 rounded-sm" />
          <div className="bg-muted-foreground/30 h-[6%] w-3/5 rounded-sm" />
        </div>
        <div
          className="bg-primary/80 absolute flex items-center justify-center"
          style={{
            left: pct(box.x, W),
            top: pct(box.y, H),
            width: pct(box.width, W),
            height: pct(box.height, H),
            borderRadius: settings.cameraShape === 'circle' ? '9999px' : settings.cameraShape === 'default' ? '2px' : undefined,
            clipPath: settings.cameraShape === 'squircle' ? SQUIRCLE_CLIP_PATH : undefined,
          }}
        >
          <span className="bg-primary-foreground/80 size-1/3 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function SwitchField({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0] as T)}
      className="w-full"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option} className="flex-1">
          {capitalise(option)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function DeviceSelect({
  id,
  devices,
  value,
  onChange,
}: {
  id: string;
  devices: MediaDeviceInfo[];
  value: string;
  onChange: (deviceId: string) => void;
}) {
  const items: SelectOption[] = [
    { value: DEFAULT_DEVICE, label: 'System default' },
    ...devices.map((device, i) => ({ value: device.deviceId, label: device.label || `Device ${i + 1}` })),
  ];
  return (
    <OptionSelect
      id={id}
      items={items}
      value={value || DEFAULT_DEVICE}
      onValueChange={(v) => onChange(v === DEFAULT_DEVICE ? '' : v)}
    />
  );
}

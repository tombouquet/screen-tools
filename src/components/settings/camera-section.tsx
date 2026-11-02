import { Camera, User, Video } from 'lucide-react';
import { useState } from 'react';
import { CameraOverlayControls, overlayOf, overlayStyle } from '@/components/camera-overlay-controls';
import { CameraPreviewDialog } from '@/components/camera-preview-dialog';
import { DesktopScene } from '@/components/desktop-scene';
import { OptionSelect } from '@/components/option-select';
import { AccessNotice, DeviceSelect, SectionHeader, SettingGroup, SettingRow } from '@/components/settings/layout';
import { Button } from '@/components/ui/button';
import type { PermissionCheck } from '@/lib/capture';
import { CAMERA_RESOLUTIONS, updateSettings, type CameraResolutionId, type Settings } from '@/lib/settings';
import { markSetup } from '@/lib/setup';

const CAMERA_RESOLUTION_OPTIONS = CAMERA_RESOLUTIONS.map((r) => ({ value: r.id as CameraResolutionId, label: r.label }));

export function CameraSection({
  settings,
  permission,
  cameras,
}: {
  settings: Settings;
  permission?: PermissionCheck;
  cameras: MediaDeviceInfo[];
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Camera}
        title="Camera"
        description="Which camera to use, and how it sits over your screen in Screen + camera recordings."
      />
      {permission && !permission.camera && <AccessNotice device="camera" />}

      {/* A sketch of the overlay on a sample screen; the camera only turns on in the full preview. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border shadow-sm">
        <DesktopScene className="absolute inset-0 size-full" />
        <div
          className="absolute flex items-end justify-center overflow-hidden bg-neutral-800 transition-all duration-200"
          style={overlayStyle(overlayOf(settings))}
        >
          <User
            className="size-[75%] text-neutral-400 transition-transform duration-200"
            style={{ transform: `translateY(15%) scale(${settings.cameraZoom})` }}
            strokeWidth={1.5}
          />
        </div>
        <Button size="lg" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-lg" onClick={() => setPreviewOpen(true)}>
          <Video /> Try with your camera
        </Button>
      </div>
      <CameraPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        settings={settings}
        onLive={() => markSetup({ cameraChecked: true })}
      />

      <SettingGroup title="Overlay" description="Changes show in the picture above.">
        <CameraOverlayControls settings={settings} />
      </SettingGroup>

      <SettingGroup title="Device">
        <SettingRow id="camera" label="Camera" description="System default follows your computer's choice.">
          <DeviceSelect
            id="camera"
            devices={cameras}
            value={settings.cameraId}
            onChange={(cameraId) => updateSettings({ cameraId })}
          />
        </SettingRow>
        <SettingRow
          id="camera-resolution"
          label="Camera quality"
          description="Higher is sharper. Your camera may not support every option."
        >
          <OptionSelect
            id="camera-resolution"
            items={CAMERA_RESOLUTION_OPTIONS}
            value={settings.cameraResolution}
            onValueChange={(cameraResolution) => updateSettings({ cameraResolution })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

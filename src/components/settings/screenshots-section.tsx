import { FileImage, Image, ImageDown } from 'lucide-react';
import { ChoiceTiles } from '@/components/choice-tiles';
import { SectionHeader, SettingGroup } from '@/components/settings/layout';
import {
  SCREENSHOT_QUALITIES,
  updateSettings,
  type ImageFormat,
  type ScreenshotQualityId,
  type Settings,
} from '@/lib/settings';
import { cn } from '@/lib/utils';

// Short names for the tiles; the width cap goes underneath.
const QUALITY_NAMES: Record<ScreenshotQualityId, string> = { native: 'Native', '2560': 'High', '1920': 'Medium', '1280': 'Small' };

export function ScreenshotsSection({ settings }: { settings: Settings }) {
  return (
    <div className="space-y-6">
      <SectionHeader icon={Image} title="Screenshots" description="Size and file type for screenshots of a page." />

      <SettingGroup
        title="Size"
        description="Native keeps every pixel of your screen; on a high-density display that's twice the page size."
      >
        <ChoiceTiles<ScreenshotQualityId>
          label="Screenshot size"
          value={settings.screenshotQuality}
          onChange={(screenshotQuality) => updateSettings({ screenshotQuality })}
          columns={4}
          choices={SCREENSHOT_QUALITIES.map((q, i) => ({
            value: q.id,
            label: QUALITY_NAMES[q.id],
            description: q.maxWidth ? `Up to ${q.maxWidth} px wide` : 'Full resolution',
            visual: <SizeSwatch scale={1 - i * 0.2} />,
          }))}
        />
      </SettingGroup>

      <SettingGroup title="Download as">
        <ChoiceTiles<ImageFormat>
          label="Download format"
          value={settings.imageFormat}
          onChange={(imageFormat) => updateSettings({ imageFormat })}
          choices={[
            { value: 'png', label: 'PNG', icons: [FileImage], description: 'Sharpest, for text and UI' },
            { value: 'jpg', label: 'JPG', icons: [ImageDown], description: 'Smaller, for photos' },
          ]}
        />
      </SettingGroup>
    </div>
  );
}

/** A picture frame drawn smaller for each step down in size. */
function SizeSwatch({ scale }: { scale: number }) {
  return (
    <span className="flex aspect-video w-full items-end justify-center">
      <span
        className={cn('border-primary/60 bg-primary/15 block aspect-video rounded-sm border-2')}
        style={{ width: `${scale * 100}%` }}
      />
    </span>
  );
}

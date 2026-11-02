import { FileImage, Image, ImageDown } from 'lucide-react';
import { useEffect } from 'react';
import { ChoiceTiles } from '@/components/choice-tiles';
import { SectionHeader, SettingGroup, SettingRow } from '@/components/settings/layout';
import { Switch } from '@/components/ui/switch';
import { hasClipboardAccess, requestClipboardAccess } from '@/lib/clipboard';
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
  // Firefox: access taken away in about:addons turns the setting off, so it says what happens.
  useEffect(() => {
    if (!settings.copyScreenshots) return;
    void hasClipboardAccess().then((allowed) => !allowed && updateSettings({ copyScreenshots: false }));
  }, [settings.copyScreenshots]);

  return (
    <div className="space-y-6">
      <SectionHeader icon={Image} title="Screenshots" description="Size, file type and what happens after a screenshot." />

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

      <SettingGroup title="After a screenshot">
        <SettingRow
          id="copy-screenshots"
          label="Copy screenshots to the clipboard"
          description="Each new screenshot goes on the clipboard as a PNG as soon as it's taken, ready to paste. The editor still opens."
        >
          <Switch
            id="copy-screenshots"
            className="sm:justify-self-end"
            checked={settings.copyScreenshots}
            onCheckedChange={(on) => {
              if (!on) return updateSettings({ copyScreenshots: false });
              // Asked straight from the click: Firefox only shows the prompt then.
              void requestClipboardAccess().then((allowed) => allowed && updateSettings({ copyScreenshots: true }));
            }}
          />
        </SettingRow>
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

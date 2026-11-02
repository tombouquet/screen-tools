import { Film, Gauge } from 'lucide-react';
import { ChoiceTiles } from '@/components/choice-tiles';
import { SwitchField } from '@/components/fields';
import { OptionSelect } from '@/components/option-select';
import { SectionHeader, SettingGroup, SettingRow } from '@/components/settings/layout';
import { isFormatSupported } from '@/lib/formats';
import {
  FRAME_RATES,
  SCREEN_RESOLUTIONS,
  updateSettings,
  type FrameRate,
  type OutputFormat,
  type ScreenResolutionId,
  type Settings,
} from '@/lib/settings';

const SCREEN_RESOLUTION_OPTIONS = SCREEN_RESOLUTIONS.map((r) => ({ value: r.id as ScreenResolutionId, label: r.label }));
const FRAME_RATE_HINTS: Record<FrameRate, string> = {
  15: 'Smallest files',
  24: 'Film look',
  30: 'Recommended',
  60: 'Smoothest',
};

export function RecordingSection({ settings }: { settings: Settings }) {
  const mp4 = isFormatSupported('mp4');
  return (
    <div className="space-y-6">
      <SectionHeader icon={Film} title="Recording" description="The file you get when you stop recording." />

      <SettingGroup title="File type">
        <ChoiceTiles<OutputFormat>
          label="File type"
          value={settings.format}
          onChange={(format) => updateSettings({ format })}
          choices={[
            {
              value: 'mp4',
              label: 'MP4',
              icons: [Film],
              description: mp4 ? 'Plays almost anywhere' : "This browser can't record MP4",
              disabled: !mp4,
            },
            { value: 'webm', label: 'WebM', icons: [Film], description: 'Plays in web browsers' },
          ]}
        />
      </SettingGroup>

      <SettingGroup title="Smoothness" description="Frames per second. More is smoother, with bigger files.">
        <ChoiceTiles<`${FrameRate}`>
          label="Frame rate"
          value={`${settings.frameRate}`}
          onChange={(v) => updateSettings({ frameRate: Number(v) as FrameRate })}
          columns={4}
          choices={FRAME_RATES.map((fps) => ({
            value: `${fps}` as const,
            label: `${fps} fps`,
            icons: [Gauge],
            description: FRAME_RATE_HINTS[fps],
          }))}
        />
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          id="screen-resolution"
          label="Screen quality"
          description="The largest size to record your screen at. Native keeps every pixel."
        >
          <OptionSelect
            id="screen-resolution"
            items={SCREEN_RESOLUTION_OPTIONS}
            value={settings.screenResolution}
            onValueChange={(screenResolution) => updateSettings({ screenResolution })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="When you stop recording">
        <SwitchField
          id="save-options"
          label="Ask how to save"
          description="Pick a file name and size (original or a smaller copy) when saving. Off saves the original straight away with a dated name."
          checked={settings.showSaveOptions}
          onChange={(showSaveOptions) => updateSettings({ showSaveOptions })}
        />
        <SwitchField
          id="optimize"
          label="Make videos seekable"
          description="Writes the length into WebM files so you can skip around in them. Turn off if stopping a long recording is slow."
          checked={settings.optimizeVideo}
          onChange={(optimizeVideo) => updateSettings({ optimizeVideo })}
        />
      </SettingGroup>
    </div>
  );
}

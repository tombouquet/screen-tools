import { Mic } from 'lucide-react';
import { MicTest } from '@/components/mic-test';
import { AccessNotice, DeviceSelect, SectionHeader, SettingGroup, SettingRow } from '@/components/settings/layout';
import type { PermissionCheck } from '@/lib/capture';
import { updateSettings, type Settings } from '@/lib/settings';
import { markSetup } from '@/lib/setup';

export function MicrophoneSection({
  settings,
  permission,
  microphones,
}: {
  settings: Settings;
  permission?: PermissionCheck;
  microphones: MediaDeviceInfo[];
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Mic}
        title="Microphone"
        description="Used when you choose Mic or System + mic on the Record page."
      />
      {permission && !permission.microphone && <AccessNotice device="microphone" />}

      <SettingGroup>
        <SettingRow id="microphone" label="Microphone" description="System default follows your computer's choice.">
          <DeviceSelect
            id="microphone"
            devices={microphones}
            value={settings.microphoneId}
            onChange={(microphoneId) => updateSettings({ microphoneId })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Test your microphone" description="Start the test and speak normally. The bar should reach the yellow without hitting red.">
        <MicTest deviceId={settings.microphoneId} onHeard={() => markSetup({ micChecked: true })} />
      </SettingGroup>
    </div>
  );
}

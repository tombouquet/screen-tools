import { Camera, Check, CloudUpload, Film, Image, Mic, Palette, Rocket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AppearanceSection } from '@/components/settings/appearance-section';
import { CameraSection } from '@/components/settings/camera-section';
import { GetStartedSection, setupSteps } from '@/components/settings/get-started';
import { MicrophoneSection } from '@/components/settings/microphone-section';
import { RecordingSection } from '@/components/settings/recording-section';
import { ScreenshotsSection } from '@/components/settings/screenshots-section';
import { UploadsSection } from '@/components/settings/uploads-section';
import { navigate } from '@/hooks/use-route';
import { useSettings } from '@/hooks/use-settings';
import { checkPermissions, listDevices, type PermissionCheck } from '@/lib/capture';
import { useConnections } from '@/lib/connectors/connections';
import { useSetup } from '@/lib/setup';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'get-started', label: 'Get started', icon: Rocket },
  { id: 'camera', label: 'Camera', icon: Camera },
  { id: 'microphone', label: 'Microphone', icon: Mic },
  { id: 'recording', label: 'Recording', icon: Film },
  { id: 'screenshots', label: 'Screenshots', icon: Image },
  { id: 'uploads', label: 'Uploads', icon: CloudUpload },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];
type SectionId = (typeof SECTIONS)[number]['id'];

const isSection = (id: string | undefined): id is SectionId => SECTIONS.some((s) => s.id === id);

/** Settings, one section at a time. `section` comes from the route, e.g. `#/settings/camera`. */
export function SettingsPage({ section }: { section?: string }) {
  const settings = useSettings();
  const setup = useSetup();
  const connections = useConnections();
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

  const steps = setupSteps(permission, setup);
  const stepsDone = steps.filter(Boolean).length;
  const setupComplete = stepsDone === steps.length;
  // A plain #/settings opens the checklist until its checks are done. Picked once, so finishing
  // a check doesn't swap the section (and close the camera preview) mid-use.
  const [fallback] = useState<SectionId>(() => (setup.cameraChecked && setup.micChecked ? 'camera' : 'get-started'));
  const active: SectionId = isSection(section) ? section : fallback;

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <nav
        aria-label="Settings"
        className="-mx-4 flex shrink-0 gap-1 overflow-x-auto px-4 pb-1 md:sticky md:top-4 md:mx-0 md:w-48 md:flex-col md:overflow-visible md:p-0"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(`/settings/${id}`)}
            aria-current={active === id ? 'page' : undefined}
            className={cn(
              'text-muted-foreground hover:bg-accent hover:text-foreground flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active === id && 'bg-accent text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
            {id === 'get-started' && (
              <span
                className={cn(
                  'ml-auto flex h-4 items-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                  setupComplete ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-primary text-primary-foreground',
                )}
              >
                {setupComplete ? <Check className="size-3" strokeWidth={3} /> : `${stepsDone}/${steps.length}`}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {active === 'get-started' && (
          <GetStartedSection
            settings={settings}
            permission={permission}
            onRetry={() => void check()}
            setup={setup}
            connections={connections}
          />
        )}
        {active === 'camera' && <CameraSection settings={settings} permission={permission} cameras={devices.cameras} />}
        {active === 'microphone' && (
          <MicrophoneSection settings={settings} permission={permission} microphones={devices.microphones} />
        )}
        {active === 'recording' && <RecordingSection settings={settings} />}
        {active === 'screenshots' && <ScreenshotsSection settings={settings} />}
        {active === 'uploads' && <UploadsSection connections={connections} />}
        {active === 'appearance' && <AppearanceSection />}
      </div>
    </div>
  );
}

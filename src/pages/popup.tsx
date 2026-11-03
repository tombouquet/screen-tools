// The toolbar popup: one click to start a recording or take a screenshot.
import {
  AppWindow,
  Camera,
  Eye,
  Film,
  Image,
  Mic,
  MicOff,
  Monitor,
  ScrollText,
  Settings,
  SquareDashedMousePointer,
  type LucideIcon,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { MonitorCamera } from '@/components/icons';
import { ThemeProvider } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/hooks/use-settings';
import { openAppTab } from '@/lib/download';
import type { AppMessage, ScreenshotMode } from '@/lib/messages';
import { getSettings, screenshotMaxWidth, updateSettings, type AudioSource, type CaptureSource } from '@/lib/settings';
import { cn } from '@/lib/utils';

const RECORD: { source: CaptureSource; label: string; icon: LucideIcon }[] = [
  { source: 'screen', label: 'Screen', icon: Monitor },
  { source: 'camera', label: 'Camera', icon: Camera },
  { source: 'screen-camera', label: 'Screen + camera', icon: MonitorCamera },
];

const SCREENSHOT: { mode: ScreenshotMode; label: string; icon: LucideIcon }[] = [
  { mode: 'area', label: 'Capture selected area', icon: SquareDashedMousePointer },
  { mode: 'visible', label: 'Capture visible area', icon: Eye },
  { mode: 'full', label: 'Capture full page', icon: ScrollText },
];

const LINKS: { route: string; label: string; icon: LucideIcon }[] = [
  { route: '/videos', label: 'Videos', icon: Film },
  { route: '/screenshots', label: 'Screenshots', icon: Image },
  { route: '/settings', label: 'Settings', icon: Settings },
];

/** Hands the job to the background worker, which outlives this popup. */
async function send(message: AppMessage): Promise<void> {
  try {
    await browser.runtime.sendMessage(message);
  } finally {
    window.close();
  }
}

async function screenshot(mode: ScreenshotMode): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const maxWidth = screenshotMaxWidth(getSettings().screenshotQuality);
  await send({ type: 'screenshot', mode, tabId: tab.id, windowId: tab.windowId, maxWidth });
}

const hasMic = (audioSource: AudioSource) => audioSource === 'microphone' || audioSource === 'system-microphone';

/** Turns the mic on or off and keeps the system audio choice as it was. */
function withMic(audioSource: AudioSource, on: boolean): AudioSource {
  const system = audioSource === 'system' || audioSource === 'system-microphone';
  if (on) return system ? 'system-microphone' : 'microphone';
  return system ? 'system' : 'none';
}

/**
 * Saved straight to settings, so the recorder the record buttons open uses it. The popup never
 * asks for the mic itself (it closes when the prompt takes focus); the recorder asks when it starts.
 */
function MicToggle() {
  const { audioSource } = useSettings();
  const on = hasMic(audioSource);
  const Icon = on ? Mic : MicOff;
  return (
    <label className="border-border bg-background hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50 flex h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-medium transition-colors">
      <Icon className={cn('size-5', !on && 'text-muted-foreground')} />
      <span className="flex-1">Microphone</span>
      <span className="text-muted-foreground text-xs">{on ? 'On' : 'Off'}</span>
      <Switch
        aria-label="Record the microphone"
        checked={on}
        onCheckedChange={(checked) => updateSettings({ audioSource: withMic(getSettings().audioSource, checked) })}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">{title}</h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

const actionClass = 'h-10 justify-start gap-3 px-3 text-sm [&_svg:not([class*=size-])]:size-5';

export function PopupPage() {
  return (
    <ThemeProvider>
      <div className="w-72 space-y-4 p-3">
        <header className="flex items-center gap-2 px-1">
          <img src="/icon/32.png" alt="" className="size-5" />
          <h1 className="text-sm font-semibold">Screen Tools</h1>
        </header>

        <Section title="Record">
          {RECORD.map(({ source, label, icon: Icon }) => (
            <Button
              key={source}
              variant="outline"
              className={actionClass}
              onClick={() => void send({ type: 'openApp', route: `/?start=${source}` })}
            >
              <Icon />
              {label}
            </Button>
          ))}
          <MicToggle />
        </Section>

        <Section title="Screenshot">
          {SCREENSHOT.map(({ mode, label, icon: Icon }) => (
            <Button key={mode} className={actionClass} onClick={() => void screenshot(mode)}>
              <Icon />
              {label}
            </Button>
          ))}
        </Section>

        <footer className="flex items-center justify-between border-t pt-2">
          <Button variant="ghost" size="sm" onClick={() => void send({ type: 'openApp', route: '/' })}>
            <AppWindow /> Open recorder
          </Button>
          <div className="flex">
            {LINKS.map(({ route, label, icon: Icon }) => (
              <Button
                key={route}
                variant="ghost"
                size="icon-sm"
                title={label}
                aria-label={label}
                onClick={() => {
                  openAppTab(route);
                  window.close();
                }}
              >
                <Icon />
              </Button>
            ))}
          </div>
        </footer>
      </div>
    </ThemeProvider>
  );
}

// The toolbar popup: one click to start a recording or take a screenshot.
import { AppWindow, Camera, Eye, Film, Image, Monitor, ScrollText, Settings, SquareDashedMousePointer, type LucideIcon } from 'lucide-react';
import { ThemeProvider } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { openAppTab } from '@/lib/download';
import type { AppMessage, ScreenshotMode } from '@/lib/messages';
import type { CaptureSource } from '@/lib/settings';

const RECORD: { source: CaptureSource; label: string; icons: LucideIcon[] }[] = [
  { source: 'screen', label: 'Screen', icons: [Monitor] },
  { source: 'camera', label: 'Camera', icons: [Camera] },
  { source: 'screen-camera', label: 'Screen + camera', icons: [Monitor, Camera] },
];

const SCREENSHOT: { mode: ScreenshotMode; label: string; icon: LucideIcon }[] = [
  { mode: 'area', label: 'Capture selected area', icon: SquareDashedMousePointer },
  { mode: 'visible', label: 'Capture visible area', icon: Eye },
  { mode: 'full', label: 'Capture full page', icon: ScrollText },
];

const LINKS: { route: string; label: string; icon: LucideIcon }[] = [
  { route: '/videos', label: 'Latest videos', icon: Film },
  { route: '/screenshots', label: 'Screenshots', icon: Image },
  { route: '/settings', label: 'Settings', icon: Settings },
];

/** Hands the job to the background worker, which outlives this popup. */
async function send(message: AppMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } finally {
    window.close();
  }
}

async function screenshot(mode: ScreenshotMode): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  await send({ type: 'screenshot', mode, tabId: tab.id, windowId: tab.windowId });
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
          {RECORD.map(({ source, label, icons }) => (
            <Button
              key={source}
              variant="outline"
              className={actionClass}
              onClick={() => void send({ type: 'openApp', route: `/?start=${source}` })}
            >
              <span className="flex w-11 items-center gap-1">
                {icons.map((Icon, i) => (
                  <Icon key={i} />
                ))}
              </span>
              {label}
            </Button>
          ))}
        </Section>

        <Section title="Screenshot">
          {SCREENSHOT.map(({ mode, label, icon: Icon }) => (
            <Button key={mode} className={actionClass} onClick={() => void screenshot(mode)}>
              <span className="flex w-11 items-center">
                <Icon />
              </span>
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

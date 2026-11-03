import { CircleHelp, Film, Image, Settings, Video } from 'lucide-react';
import { useEffect } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBusy } from '@/hooks/use-busy';
import { navigate, useRoute } from '@/hooks/use-route';
import { useIsWide } from '@/hooks/use-wide';
import { cn } from '@/lib/utils';
import { currentVersion } from '@/lib/version';
import { ChangelogPage } from '@/pages/changelog';
import { HelpPage } from '@/pages/help';
import { HomePage } from '@/pages/home';
import { RecorderPage } from '@/pages/recorder';
import { ScreenshotsPage } from '@/pages/screenshots';
import { SettingsPage } from '@/pages/settings';
import { VideosPage } from '@/pages/videos';

const NAV_BUTTON =
  'text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50';

const NAV = [
  { path: '/', label: 'Record', icon: Video },
  { path: '/videos', label: 'Videos', icon: Film },
  { path: '/screenshots', label: 'Screenshots', icon: Image },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function Page({ path }: { path: string }) {
  const video = path.match(/^\/videos(?:\/(\d+))?$/);
  if (video) return <VideosPage id={video[1] ? Number(video[1]) : undefined} />;
  const screenshot = path.match(/^\/screenshots(?:\/(\d+))?$/);
  if (screenshot) return <ScreenshotsPage id={screenshot[1] ? Number(screenshot[1]) : undefined} />;
  const settings = path.match(/^\/settings(?:\/([\w-]+))?$/);
  if (settings) return <SettingsPage section={settings[1]} />;
  const help = path.match(/^\/help(?:\/([\w-]+))?$/);
  if (help) return <HelpPage topic={help[1]} />;
  switch (path) {
    case '/changelog':
      return <ChangelogPage />;
    case '/home':
      return <HomePage />;
    default:
      return <RecorderPage />;
  }
}

export function App() {
  // A route can carry a query, e.g. `/?start` from the toolbar popup.
  const path = useRoute().split('?')[0]!;
  const busy = useBusy();
  const section = '/' + (path.split('/')[1] ?? '');
  // The screenshot editor and a single recording fill the tab exactly; they never scroll the page.
  const wideRequested = useIsWide();
  const wide = /^\/screenshots\/\d+$/.test(path) || wideRequested;

  // Mid-recording, the header links or the browser's Back could change the route and
  // unmount the recorder, which would end the recording. Keep it on screen and put the
  // route back instead.
  useEffect(() => {
    if (busy && path !== '/') navigate('/');
  }, [busy, path]);

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className={cn('mx-auto flex flex-col gap-4 p-4', wide ? 'h-screen max-w-none' : 'min-h-screen max-w-4xl')}>
          <header className="flex items-center gap-3">
            <a
              href="#/home"
              className={cn('flex items-center gap-3', busy && 'pointer-events-none')}
              title="Home"
              aria-disabled={busy || undefined}
              tabIndex={busy ? -1 : undefined}
            >
              <img src="/icon/48.png" alt="" className="size-7" />
              <h1 className="font-semibold">Screen Tools</h1>
            </a>
            <a
              href="#/changelog"
              className={cn(
                'text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline',
                busy && 'pointer-events-none',
              )}
              aria-disabled={busy || undefined}
              tabIndex={busy ? -1 : undefined}
              title="Changelog"
            >
              v{currentVersion()}
            </a>
            <nav className="ml-auto flex gap-1" aria-label="Main">
              {NAV.map(({ path: to, label, icon: Icon }) => (
                <button
                  key={to}
                  type="button"
                  disabled={busy}
                  onClick={() => navigate(to)}
                  aria-current={section === to ? 'page' : undefined}
                  className={cn(NAV_BUTTON, section === to && 'bg-accent text-foreground')}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => navigate('/help')}
                aria-current={section === '/help' ? 'page' : undefined}
                aria-label="Help"
                title="Help"
                className={cn(NAV_BUTTON, 'px-2', section === '/help' && 'bg-accent text-foreground')}
              >
                <CircleHelp className="size-4" />
              </button>
            </nav>
          </header>
          <main className="flex min-h-0 flex-1 flex-col">
            <Page path={busy ? '/' : path} />
          </main>
          <footer className="text-muted-foreground text-center text-xs">
            Free, no sign-up, no watermark. Recordings and screenshots stay on your computer unless you upload them.
          </footer>
        </div>
        <Toaster position="bottom-center" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}

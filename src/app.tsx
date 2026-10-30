import { Film, PlayCircle, Settings, Video } from 'lucide-react';
import { ThemeProvider } from '@/components/theme-provider';
import { UpdateBanner } from '@/components/update-banner';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBusy } from '@/hooks/use-busy';
import { navigate, useRoute } from '@/hooks/use-route';
import { cn } from '@/lib/utils';
import { currentVersion } from '@/lib/version';
import { ChangelogPage } from '@/pages/changelog';
import { PlayerPage } from '@/pages/player';
import { RecorderPage } from '@/pages/recorder';
import { SettingsPage } from '@/pages/settings';
import { VideosPage } from '@/pages/videos';

const NAV = [
  { path: '/', label: 'Record', icon: Video },
  { path: '/videos', label: 'Latest videos', icon: Film },
  { path: '/player', label: 'Player', icon: PlayCircle },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function Page({ path }: { path: string }) {
  const video = path.match(/^\/videos(?:\/(\d+))?$/);
  if (video) return <VideosPage id={video[1] ? Number(video[1]) : undefined} />;
  switch (path) {
    case '/player':
      return <PlayerPage />;
    case '/settings':
      return <SettingsPage />;
    case '/changelog':
      return <ChangelogPage />;
    default:
      return <RecorderPage />;
  }
}

export function App() {
  const path = useRoute();
  const busy = useBusy();
  const section = '/' + (path.split('/')[1] ?? '');

  return (
    <ThemeProvider>
      <TooltipProvider>
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 p-4">
          <header className="flex items-center gap-3">
            <img src="/icon/48.png" alt="" className="size-7" />
            <h1 className="font-semibold">Screen Recorder</h1>
            <a
              href="#/changelog"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
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
                  className={cn(
                    'text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
                    section === to && 'bg-accent text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </nav>
          </header>
          <UpdateBanner />
          <main className="flex-1">
            <Page path={path} />
          </main>
          <footer className="text-muted-foreground text-center text-xs">
            Free, no sign-up, no watermark. Recordings never leave your computer.
          </footer>
        </div>
        <Toaster position="bottom-center" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}

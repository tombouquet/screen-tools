// Welcome page, opened after installs and version changes.
import { ArrowRight, CircleHelp, Film, Image, Settings, Video, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { navigate } from '@/hooks/use-route';
import { GET_STARTED } from '@/pages/help';
import { platform } from '@/platform';

/** What the screen picker offers, e.g. "a window or a tab". */
const SOURCES = platform.capabilities.tabCapture ? 'a window, a tab' : 'a window';

const ACTIONS: { path: string; label: string; description: string; icon: LucideIcon }[] = [
  { path: '/', label: 'Record', description: `Your screen, ${SOURCES} or your camera, with audio.`, icon: Video },
  { path: '/videos', label: 'Videos', description: 'Your last 5 recordings, saved as you record.', icon: Film },
  { path: '/screenshots', label: 'Screenshots', description: 'Your last 10 screenshots, ready to annotate.', icon: Image },
  { path: '/settings', label: 'Settings', description: 'Camera, microphone, formats, uploads and theme.', icon: Settings },
];


export function HomePage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Welcome to Screen Tools</h2>
        <p className="text-muted-foreground text-sm">
          Record your screen, {SOURCES} or your camera, and take annotated screenshots. Free, no sign-up, no
          watermark, and nothing leaves your computer.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map(({ path, label, description, icon: Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className="bg-card text-card-foreground ring-foreground/10 hover:bg-accent flex items-start gap-3 rounded-xl p-4 text-left text-sm ring-1 transition-colors"
          >
            <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <span className="space-y-0.5">
              <span className="block font-medium">{label}</span>
              <span className="text-muted-foreground block">{description}</span>
            </span>
          </button>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-semibold">Get started</h3>
            <p className="text-muted-foreground text-sm">Everything starts from the toolbar icon.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/help')}>
            <CircleHelp /> Help and tips <ArrowRight />
          </Button>
        </div>
        <Card className="gap-0 overflow-hidden p-0">
          <ol className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
            {GET_STARTED.map(({ title, text, icon: Icon, topic }, i) => (
              <li key={title}>
                <button
                  type="button"
                  onClick={() => navigate(`/help/${topic}`)}
                  className="hover:bg-accent/50 flex h-full w-full items-start gap-3 p-4 text-left transition-colors"
                >
                  <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                    <Icon className="size-4" />
                  </span>
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">
                      {i + 1}. {title}
                    </span>
                    <span className="text-muted-foreground block text-sm">{text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </section>

    </div>
  );
}

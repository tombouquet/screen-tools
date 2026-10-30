// Welcome page, opened after installs and version changes.
import { Film, Image, PlayCircle, Settings, Video, type LucideIcon } from 'lucide-react';
import changelog from '../../CHANGELOG.md?raw';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { navigate } from '@/hooks/use-route';
import { currentVersion } from '@/lib/version';
import { Inline, parseChangelog } from '@/pages/changelog';
import { platform } from '@/platform';

/** What the screen picker offers, e.g. "a window or a tab". */
const SOURCES = platform.capabilities.tabCapture ? 'a window, a tab' : 'a window';

const ACTIONS: { path: string; label: string; description: string; icon: LucideIcon }[] = [
  { path: '/', label: 'Record', description: `Your screen, ${SOURCES} or your camera, with audio.`, icon: Video },
  { path: '/videos', label: 'Latest videos', description: 'Your last 5 recordings, saved as you record.', icon: Film },
  { path: '/screenshots', label: 'Screenshots', description: 'Your last 10 screenshots, ready to annotate.', icon: Image },
  { path: '/player', label: 'Player', description: 'Play any video file, or make an old WebM seekable.', icon: PlayCircle },
  { path: '/settings', label: 'Settings', description: 'Formats, camera overlay, screenshot size and theme.', icon: Settings },
];

const STEPS = [
  platform.copy.pinHint,
  'Click the toolbar icon to record the screen, the camera or both, or to take a screenshot.',
  platform.capabilities.screenPickerNeedsGesture
    ? 'Click Start recording, pick what to share, and recording starts after a 3-second countdown. While recording, the icon shows REC; click it to stop.'
    : 'Recording starts after a 3-second countdown. While recording, the icon shows REC; click it to stop.',
];

export function HomePage() {
  const current = currentVersion();
  const releases = parseChangelog(changelog);
  // A dev build can be ahead of the changelog, so fall back to the latest release.
  const release = releases.find((r) => r.version === current) ?? releases[0];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Welcome to Screen Tools</h2>
        <p className="text-muted-foreground text-sm">
          Record your screen, {SOURCES} or your camera, and take annotated screenshots. Free, no sign-up, no
          watermark, and nothing leaves your computer.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      <Card>
        <CardHeader>
          <CardTitle>How to use it</CardTitle>
          <CardDescription>Everything starts from the toolbar icon.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {release && (
        <Card>
          <CardHeader>
            <CardTitle>What's new in v{release.version}</CardTitle>
            {release.date && <CardDescription>{release.date}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="list-disc space-y-1 pl-5">
              {release.sections.flatMap((section) => section.items).map((item, i) => (
                <li key={i}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
            <a href="#/changelog" className="inline-block underline underline-offset-4">
              Full changelog
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

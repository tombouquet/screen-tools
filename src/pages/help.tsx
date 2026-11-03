// Help: how to use each part of Screen Tools, each with an animated scene, and
// answers to the questions that come up most.
import {
  ArrowRight,
  ChevronDown,
  CloudUpload,
  Image,
  Lightbulb,
  LifeBuoy,
  MousePointerClick,
  Pin,
  ShieldCheck,
  Square,
  SquarePen,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import {
  AnnotateScene,
  PinScene,
  RecordScene,
  RecoveryScene,
  ScreenshotScene,
  StopScene,
  UploadScene,
} from '@/components/help/help-graphics';
import { Button } from '@/components/ui/button';
import { navigate } from '@/hooks/use-route';
import { cn } from '@/lib/utils';
import { platform } from '@/platform';

const { capabilities, copy } = platform;
const FIREFOX = platform.id === 'firefox';

/** A link to another page of the app, such as a Settings section. */
function AppLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={`#${to}`} className="text-foreground font-medium underline underline-offset-4">
      {children}
    </a>
  );
}

/** The three steps on Home. */
export const GET_STARTED: { title: string; text: string; icon: LucideIcon; topic: string }[] = [
  { title: 'Pin Screen Tools', text: copy.pinSteps.join(' '), icon: Pin, topic: 'pin' },
  {
    title: 'Start a recording',
    text: capabilities.screenPickerNeedsGesture
      ? 'Click the icon and pick Screen, Camera or both, then Start recording.'
      : 'Click the icon and pick Screen, Camera or both. A 3-second countdown starts it.',
    icon: MousePointerClick,
    topic: 'record',
  },
  {
    title: 'Stop and save',
    text: 'Click the icon again to stop. Then download it or share a link.',
    icon: Square,
    topic: 'stop',
  },
];

interface Topic {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  intro: string;
  scene: ComponentType<{ className?: string }>;
  steps: ReactNode[];
  tip?: ReactNode;
}

const TOPICS: Topic[] = [
  {
    id: 'pin',
    label: 'Pin',
    icon: Pin,
    title: 'Pin Screen Tools to the toolbar',
    intro: 'Everything starts from the toolbar icon, so keep it in reach.',
    scene: PinScene,
    steps: [...copy.pinSteps, 'The icon stays in the toolbar. Click it any time to record or take a screenshot.'],
  },
  {
    id: 'record',
    label: 'Record',
    icon: Video,
    title: 'Record your screen or camera',
    intro: `Record your screen, ${capabilities.tabCapture ? 'a window, a tab' : 'a window'} or your camera, or your screen with your camera in a corner.`,
    scene: RecordScene,
    steps: [
      'Click the toolbar icon and pick Screen, Camera or Screen + camera.',
      'The Microphone switch turns your mic on or off for the next recording.',
      capabilities.screenPickerNeedsGesture
        ? 'The recorder opens. Click Start recording, then pick a screen or a window to share.'
        : `Pick ${capabilities.tabCapture ? 'a screen, a window or a tab' : 'a screen or a window'} to share.`,
      'Recording starts after a 3-second countdown. The icon shows REC while it runs.',
    ],
    tip: (
      <>
        Format, resolution and frame rate are in <AppLink to="/settings/recording">Settings › Recording</AppLink>, and
        the camera's corner, size and shape in <AppLink to="/settings/camera">Settings › Camera</AppLink>.
      </>
    ),
  },
  {
    id: 'stop',
    label: 'Stop and save',
    icon: Square,
    title: 'Stop and save',
    intro: "Your recording opens as soon as you stop, and it's already kept in Videos.",
    scene: StopScene,
    steps: [
      'Click the toolbar icon again to stop.',
      'Play it back, then click Download to save it to your computer.',
      'Or click Share link to upload it and copy a link to it.',
    ],
    tip: (
      <>
        <AppLink to="/videos">Videos</AppLink> keeps your last 5 recordings, so save the ones you want to keep.
      </>
    ),
  },
  {
    id: 'screenshot',
    label: 'Screenshot',
    icon: Image,
    title: 'Take a screenshot',
    intro: 'Capture part of a page, what you can see, or the whole page from top to bottom.',
    scene: ScreenshotScene,
    steps: [
      'Click the toolbar icon and pick Capture selected area, Capture visible area or Capture full page.',
      'For a selected area, drag over the part you want. Press Esc to cancel.',
      "Full page scrolls for you. Click the icon or press Esc to stop early and keep what's captured so far.",
      'Each screenshot opens in the editor.',
    ],
    tip: (
      <>
        <AppLink to="/screenshots">Screenshots</AppLink> keeps your last 10.
      </>
    ),
  },
  {
    id: 'annotate',
    label: 'Mark up',
    icon: SquarePen,
    title: 'Mark up and share a screenshot',
    intro: 'Point things out, hide what should stay private, and send it on.',
    scene: AnnotateScene,
    steps: [
      'Draw boxes, arrows, circles and pen or highlighter strokes, and add text.',
      'Pixelate names, emails and numbers. Crop to the part that matters.',
      'Copy puts it on the clipboard. Share link uploads it and copies the link.',
    ],
    tip: (
      <>
        Turn on Copy screenshots to the clipboard in <AppLink to="/settings/screenshots">Settings › Screenshots</AppLink>{' '}
        and each new screenshot is ready to paste as soon as it's taken.
      </>
    ),
  },
  {
    id: 'recover',
    label: 'Recover',
    icon: ShieldCheck,
    title: 'Never lose a recording',
    intro: 'A crash or a closed window loses a few seconds at most.',
    scene: RecoveryScene,
    steps: [
      'While you record, Screen Tools saves to disk every 5 seconds.',
      'If the browser or your computer closes mid-recording, open Videos.',
      "The recording is there, marked Interrupted. Open it to play, save or delete it.",
    ],
  },
  {
    id: 'upload',
    label: 'Uploads',
    icon: CloudUpload,
    title: 'Upload and share a link',
    intro: 'Send a recording or screenshot as a link instead of a file.',
    scene: UploadScene,
    steps: [
      <>
        Connect Google Drive or Dropbox, or add your own upload server, in{' '}
        <AppLink to="/settings/uploads">Settings › Uploads</AppLink>.
      </>,
      'Click Share link on a recording or screenshot. It uploads, then copies the link.',
      'Files go to a Screen Tools folder in your Drive, or Apps/Screen Tools in your Dropbox. Screen Tools can\'t see anything else there.',
    ],
    tip: 'Nothing leaves your computer until you upload it.',
  },
];

const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: "My camera or microphone doesn't work",
    answer: (
      <>
        Open <AppLink to="/settings/get-started">Settings › Get started</AppLink> and allow access when the browser asks.
        If you said no before, allow the camera and microphone again in the browser's site settings for Screen Tools.
        Close other apps that might be using the camera, such as video calls.
      </>
    ),
  },
  {
    question: 'My recording has no sound from the computer',
    answer: capabilities.systemAudio ? (
      <>
        Set Audio to System or System + mic on the Record page. Then, in Chrome's picker, share a tab or your whole
        screen and turn on its audio switch. A window can't share its audio.
      </>
    ) : (
      'Firefox can only record your microphone, not the sound from your computer or a tab.'
    ),
  },
  {
    question: "A page can't be screenshotted",
    answer: copy.blockedScreenshotMessage,
  },
  {
    question: 'A full-page screenshot only shows part of the page',
    answer:
      "Pages that scroll an inner panel, such as Gmail and many web apps, capture only what's visible. Use Capture visible area instead, scrolling the panel between shots.",
  },
  {
    question: "A video won't skip ahead in another player",
    answer: (
      <>
        Older WebM recordings can be missing their length. Open it in <AppLink to="/videos">Videos</AppLink> and click
        Make seekable, or record MP4 instead in <AppLink to="/settings/recording">Settings › Recording</AppLink>.
      </>
    ),
  },
  {
    question: 'The video is too big to send',
    answer:
      'Click Download and pick a smaller size, with the file size shown up front. Compression runs on your computer and keeps the original. Or click Share link and send a link instead.',
  },
  {
    question: 'Where are my recordings and screenshots kept?',
    answer:
      "In the browser's storage for Screen Tools, on this computer. Videos keeps your last 5 recordings and Screenshots your last 10. Save the ones you want to keep: removing the extension deletes them.",
  },
  ...(FIREFOX
    ? [
        {
          question: 'Why does Firefox ask me to click Start recording?',
          answer:
            'Firefox only opens its screen picker from a click in the page, so the recorder opens first and waits for you. The countdown starts once you pick what to share.',
        },
      ]
    : []),
];

const QUESTIONS_ID = 'questions';

function TopicView({ topic, next }: { topic: Topic; next?: { id: string; label: string } }) {
  const Scene = topic.scene;
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{topic.title}</h3>
        <p className="text-muted-foreground text-sm">{topic.intro}</p>
      </div>
      <Scene className="max-w-xl" />
      <ol className="max-w-xl space-y-2.5 text-sm">
        {topic.steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="bg-muted text-foreground grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold">
              {i + 1}
            </span>
            <span className="pt-px">{step}</span>
          </li>
        ))}
      </ol>
      {topic.tip && (
        <p className="text-muted-foreground flex max-w-xl gap-2 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0" />
          <span>{topic.tip}</span>
        </p>
      )}
      {next && (
        <Button variant="outline" onClick={() => navigate(`/help/${next.id}`)}>
          Next: {next.label} <ArrowRight />
        </Button>
      )}
    </div>
  );
}

function QuestionsView() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Questions</h3>
        <p className="text-muted-foreground text-sm">Answers to what comes up most.</p>
      </div>
      <div className="divide-y rounded-xl border">
        {QUESTIONS.map(({ question, answer }) => (
          <details key={question} className="group">
            <summary className="hover:bg-accent/50 flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDown className="text-muted-foreground ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <p className="text-muted-foreground px-4 pb-4 text-sm">{answer}</p>
          </details>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        Still stuck?{' '}
        <a
          href="https://github.com/tombouquet/screen-tools/issues"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-4"
        >
          Report a problem on GitHub
        </a>
      </p>
    </div>
  );
}

/** One topic at a time, picked from the list: `#/help/<topic>`, the first by default. */
export function HelpPage({ topic: id }: { topic?: string }) {
  const index = TOPICS.findIndex((t) => t.id === id);
  const topic = TOPICS[index] ?? (id === QUESTIONS_ID ? undefined : TOPICS[0]!);
  const current = topic?.id ?? QUESTIONS_ID;
  const after = TOPICS[TOPICS.indexOf(topic!) + 1];
  const items = [...TOPICS.map(({ id, label, icon }) => ({ id, label, icon })), { id: QUESTIONS_ID, label: 'Questions', icon: LifeBuoy }];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Help</h2>
        <p className="text-muted-foreground text-sm">Everything starts from the toolbar icon.</p>
      </div>
      <div className="grid items-start gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto md:sticky md:top-4 md:flex-col" aria-label="Help topics">
          {items.map(({ id: to, label, icon: Icon }) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate(`/help/${to}`)}
              aria-current={current === to ? 'page' : undefined}
              className={cn(
                'text-muted-foreground hover:bg-accent hover:text-foreground flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                current === to && 'bg-accent text-foreground font-medium',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        {topic ? (
          <TopicView key={topic.id} topic={topic} next={after ?? { id: QUESTIONS_ID, label: 'Questions' }} />
        ) : (
          <QuestionsView />
        )}
      </div>
    </div>
  );
}

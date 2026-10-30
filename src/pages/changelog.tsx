import { Fragment } from 'react';
import changelog from '../../CHANGELOG.md?raw';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { currentVersion } from '@/lib/version';
import { cn } from '@/lib/utils';

export interface Release {
  version: string;
  date?: string;
  sections: { heading: string; items: string[] }[];
}

/** Reads just what Release Please writes: `## version (date)`, `###` headings and `*` lists. */
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  for (const line of markdown.split('\n')) {
    const version = line.match(/^## \[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s*(?:\(([^)]+)\))?/);
    const release = releases.at(-1);
    if (version) releases.push({ version: version[1]!, date: version[2], sections: [] });
    else if (!release) continue;
    else if (line.startsWith('### ')) release.sections.push({ heading: line.slice(4), items: [] });
    else if (/^[*-] /.test(line)) {
      if (!release.sections.length) release.sections.push({ heading: '', items: [] });
      release.sections.at(-1)!.items.push(line.slice(2));
    }
  }
  return releases;
}

/** `code`, **bold** and [text](https://…) links. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith('`')) return <code key={i} className="bg-muted rounded px-1 font-mono text-xs">{part.slice(1, -1)}</code>;
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((.+)\)$/);
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="underline underline-offset-4">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function ChangelogPage() {
  const current = currentVersion();
  const releases = parseChangelog(changelog);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Changelog</h2>
        <p className="text-muted-foreground text-sm">
          What's new in each version of Screen Tools.
        </p>
      </div>
      {releases.length === 0 && <p className="text-muted-foreground text-sm">No releases yet. You're on v{current}.</p>}
      {releases.map((release) => (
        <Card key={release.version} className={cn(release.version === current && 'border-primary')}>
          <CardHeader className="flex flex-row flex-wrap items-baseline gap-2">
            <CardTitle>v{release.version}</CardTitle>
            {release.date && <span className="text-muted-foreground text-xs">{release.date}</span>}
            {release.version === current && <Badge>Installed</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
            {release.sections.map((section, i) => (
              <div key={i} className="space-y-1">
                {section.heading && (
                  <h3 className="text-sm font-semibold">
                    <Inline text={section.heading} />
                  </h3>
                )}
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {section.items.map((item, j) => (
                    <li key={j}>
                      <Inline text={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

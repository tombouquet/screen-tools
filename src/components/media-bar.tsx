// Pieces of the one bar above a single screenshot or recording: back, title and
// details on the left; tools in the middle; saved state and actions on the right.
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { navigate } from '@/hooks/use-route';
import { cn } from '@/lib/utils';

/** The bar itself. */
export function MediaBar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('bg-card flex flex-wrap items-center gap-2 rounded-lg border p-2', className)}>{children}</div>;
}

/** Back to the list, the title, and a line of details under it. */
export function MediaTitle({ back, title, details }: { back?: { to: string; label: string }; title: string; details: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {back && (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={back.label} onClick={() => navigate(back.to)} />}>
            <ArrowLeft />
          </TooltipTrigger>
          <TooltipContent>{back.label}</TooltipContent>
        </Tooltip>
      )}
      <div className={cn('max-w-44 min-w-0 pr-1 2xl:max-w-72', !back && 'pl-1.5')}>
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        <p className="text-muted-foreground truncate text-xs">{details}</p>
      </div>
    </div>
  );
}

export function SavedBadge({ saved }: { saved: boolean }) {
  return saved ? <Badge variant="secondary">Saved</Badge> : <Badge variant="outline">Not saved</Badge>;
}

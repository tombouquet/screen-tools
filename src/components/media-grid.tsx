// The grid used by the Videos and Screenshots lists: a card per item with a preview,
// a title and a line of details, and quick actions that show on hover.
import { Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function MediaGrid({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</ul>;
}

/** One item: the card opens it, and `actions` float over its top-right corner on hover. */
export function MediaCard({
  preview,
  title,
  details,
  onOpen,
  actions,
  /** Keeps the actions showing, e.g. while a link is uploading so the spinner stays visible. */
  pinActions,
}: {
  preview: ReactNode;
  title: string;
  details: ReactNode;
  onOpen: () => void;
  actions?: ReactNode;
  pinActions?: boolean;
}) {
  return (
    <li className="group relative">
      <button
        className="hover:bg-accent flex w-full flex-col gap-2 rounded-lg border p-2 text-left select-none"
        onClick={onOpen}
      >
        <span className="bg-muted relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md">
          {preview}
        </span>
        <span className="min-w-0 px-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="text-muted-foreground text-xs">{details}</span>
        </span>
      </button>
      {actions && (
        <div
          className={cn(
            'absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
            pinActions && 'opacity-100',
          )}
        >
          {actions}
        </div>
      )}
    </li>
  );
}

export function QuickAction({
  label,
  icon: Icon,
  destructive,
  primary,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  /** The one-click action, drawn filled so it stands out. */
  primary?: boolean;
  /** Shows a spinner in place of the icon. */
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={primary ? 'default' : 'secondary'}
            size="icon-sm"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={destructive ? 'text-destructive hover:text-destructive shadow-sm' : 'shadow-sm'}
          />
        }
      >
        {busy ? <Loader2 className="animate-spin" /> : <Icon />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The empty list: an icon and a line of text. */
export function EmptyMedia({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-sm">
      <Icon className="size-8" />
      <p>{children}</p>
    </div>
  );
}

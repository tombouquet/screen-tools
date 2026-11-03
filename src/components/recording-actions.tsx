// The layout for one recording, used right after recording and when opening one from
// Videos. It mirrors the screenshot editor: one bar with back, title and details on the
// left, then the saved state, Share link, Download and a ⋯ menu (ending in Delete) in the
// same spots; and the video filling the rest of the window.
import { Download, Ellipsis, Link2, Loader2, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { MediaBar, MediaTitle, SavedBadge } from '@/components/media-bar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { QuickShare } from '@/hooks/use-quick-share';
import { useWideLayout } from '@/hooks/use-wide';

export interface MenuAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}

export function RecordingLayout({
  back,
  title,
  details,
  saved,
  actions,
  onDelete,
  share,
  onDownload,
  menu,
  note,
  video,
  below,
}: {
  /** Where the back arrow goes, and its label. */
  back?: { to: string; label: string };
  title: string;
  /** Length, format and size. */
  details: ReactNode;
  saved: boolean;
  /** Buttons before Share link, such as Record again. */
  actions?: ReactNode;
  onDelete: () => void;
  share: { quickShare: QuickShare; sharing: boolean; onShare: () => void };
  onDownload: () => void;
  /** The ⋯ menu above Delete, such as Make seekable. */
  menu: MenuAction[];
  /** A short line in the middle of the bar. */
  note?: ReactNode;
  video: ReactNode;
  /** Under the video, such as its uploads. */
  below?: ReactNode;
}) {
  useWideLayout();
  const { quickShare, sharing, onShare } = share;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <MediaBar>
        <MediaTitle back={back} title={title} details={details} />
        {note && (
          <p className="text-muted-foreground hidden min-w-0 items-center gap-2 border-l pl-3 text-sm lg:flex">{note}</p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <SavedBadge saved={saved} />
          {actions}
          <Tooltip>
            <TooltipTrigger render={<Button disabled={!quickShare.ready || sharing} onClick={onShare} />}>
              {sharing ? <Loader2 className="animate-spin" /> : <Link2 />}
              {sharing ? 'Uploading…' : 'Share link'}
            </TooltipTrigger>
            <TooltipContent>
              {quickShare.destination
                ? `Upload to ${quickShare.destination.name} and copy the link`
                : 'Upload and copy the link. Connect a service in Settings first.'}
            </TooltipContent>
          </Tooltip>
          <Button variant="outline" onClick={onDownload}>
            <Download /> Download
          </Button>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={<DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More options" />} />}
              >
                <Ellipsis />
              </TooltipTrigger>
              <TooltipContent>More options</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              {menu.map(({ label, icon: Icon, onClick, disabled }) => (
                <DropdownMenuItem key={label} disabled={disabled} onClick={onClick}>
                  <Icon /> {label}
                </DropdownMenuItem>
              ))}
              {menu.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </MediaBar>

      <div className="bg-muted/50 flex min-h-0 flex-1 items-center justify-center rounded-lg border p-4">{video}</div>

      {below && <div className="max-h-48 shrink-0 overflow-auto empty:hidden">{below}</div>}
    </div>
  );
}

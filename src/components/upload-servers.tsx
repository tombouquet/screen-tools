// Settings: upload servers people add themselves, by URL. See docs/guides/upload-servers.md.
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { disconnect } from '@/lib/connectors/auth';
import {
  DEFAULT_SERVER_ICON,
  SERVER_ICONS,
  isServerIcon,
  serverIcon,
  type ServerIconId,
} from '@/lib/connectors/server-icons';
import { InvalidServerSettings, saveUploadServer } from '@/lib/connectors/upload-server';
import type { Connection, ConnectorId } from '@/lib/connectors/types';

const GUIDE_URL = 'https://github.com/tombouquet/screen-tools/blob/main/docs/guides/upload-servers.md';

/** The add dialog, or the edit dialog for one server. */
type Editing = { mode: 'add' } | { mode: 'edit'; connection: Connection };

export function UploadServers({ connections }: { connections: Connection[] }) {
  const servers = connections
    .filter((c) => c.server)
    .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
  const [editing, setEditing] = useState<Editing>();
  const [confirming, setConfirming] = useState<Connection>();
  const [removing, setRemoving] = useState<ConnectorId>();

  const remove = (connection: Connection) => {
    const name = connection.server!.name;
    setRemoving(connection.connector);
    disconnect(connection.connector)
      .then(
        () => toast.success(`Removed ${name}`),
        (error: unknown) => {
          console.error(error);
          toast.error(`Couldn't remove ${name}`, { description: error instanceof Error ? error.message : String(error) });
        },
      )
      .finally(() => setRemoving(undefined));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Upload servers</p>
          <p className="text-muted-foreground text-xs">
            Your own server, if it hands out upload links.{' '}
            <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
              What it needs
            </a>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing({ mode: 'add' })}>
          <Plus /> Add upload server
        </Button>
      </div>
      {servers.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {servers.map((connection) => {
            const Icon = serverIcon(connection.server!.icon);
            const busy = removing === connection.connector;
            return (
              <li key={connection.connector} className="flex flex-wrap items-center gap-3 p-3">
                <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-40 flex-1 space-y-0.5">
                  <p className="text-sm font-medium">{connection.server!.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{connection.server!.endpoint}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing({ mode: 'edit', connection })}>
                    <Pencil /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirming(connection)}>
                    {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <ServerDialog
          connection={editing.mode === 'edit' ? editing.connection : undefined}
          onClose={() => setEditing(undefined)}
        />
      )}
      <ConfirmDeleteDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && setConfirming(undefined)}
        onConfirm={() => confirming && remove(confirming)}
        title={`Remove ${confirming?.server?.name ?? 'this server'}?`}
        description="You won't be able to upload to it any more. Files already uploaded stay on the server, and their links keep working."
        confirmLabel="Remove"
      />
    </div>
  );
}

/** Adds a server, or edits `connection` when given. */
function ServerDialog({ connection, onClose }: { connection?: Connection; onClose: () => void }) {
  const existing = connection?.server;
  const [name, setName] = useState(existing?.name ?? '');
  const [endpoint, setEndpoint] = useState(existing?.endpoint ?? '');
  const [token, setToken] = useState(existing?.token ?? '');
  const [icon, setIcon] = useState<ServerIconId>(isServerIcon(existing?.icon) ? existing.icon : DEFAULT_SERVER_ICON);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const unencrypted = endpoint.trim().startsWith('http://') && token.trim() !== '';
  const editing = Boolean(connection);

  // Runs straight from the submit: saving asks for a permission, which needs the gesture.
  const save = () => {
    setError(undefined);
    setSaving(true);
    saveUploadServer({ name, endpoint, token, icon }, connection?.connector).then(
      (saved) => {
        setSaving(false);
        if (!saved) return;
        toast.success(editing ? `Saved ${saved.server!.name}` : `Added ${saved.server!.name}`);
        onClose();
      },
      (reason: unknown) => {
        setSaving(false);
        if (!(reason instanceof InvalidServerSettings)) console.error(reason);
        setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving) save();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit upload server' : 'Add upload server'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Changes apply to your next upload. Files already uploaded keep their links.'
                : 'Your browser asks to let Screen Tools talk to this server. Files go there only when you upload them.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="server-name">Name</Label>
            <Input
              id="server-name"
              value={name}
              autoFocus
              placeholder="Team uploads"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label id="server-icon-label">Icon</Label>
            <ToggleGroup
              aria-labelledby="server-icon-label"
              variant="outline"
              value={[icon]}
              onValueChange={(next) => next[0] && setIcon(next[0] as ServerIconId)}
              className="grid w-full grid-cols-6 gap-2"
            >
              {(Object.entries(SERVER_ICONS) as [ServerIconId, (typeof SERVER_ICONS)[ServerIconId]][]).map(
                ([id, { label, icon: Icon }]) => (
                  <ToggleGroupItem
                    key={id}
                    value={id}
                    aria-label={label}
                    title={label}
                    className="data-pressed:border-primary data-pressed:bg-primary/5 data-pressed:ring-primary aspect-square h-auto data-pressed:ring-1"
                  >
                    <Icon className="size-5!" />
                  </ToggleGroupItem>
                ),
              )}
            </ToggleGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="server-endpoint">Upload URL</Label>
            <Input
              id="server-endpoint"
              type="url"
              value={endpoint}
              placeholder="https://files.example.com/api/upload-url"
              onChange={(event) => setEndpoint(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">The address that hands out upload links, from your server's admin.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="server-token">Access token (optional)</Label>
            <Input
              id="server-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {unencrypted
                ? "This URL isn't encrypted (http), so the token can be read on the way. Use https if you can."
                : 'Only if your server asks for one. It stays on this computer.'}
            </p>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} {editing ? 'Save changes' : 'Add server'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

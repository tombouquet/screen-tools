// Settings: upload servers people add themselves, by URL. See docs/guides/upload-servers.md.
import { Loader2, Plus, Server } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { disconnect } from '@/lib/connectors/auth';
import { InvalidServerSettings, addUploadServer } from '@/lib/connectors/upload-server';
import type { Connection, ConnectorId } from '@/lib/connectors/types';

const GUIDE_URL = 'https://github.com/tombouquet/screen-tools/blob/main/docs/guides/upload-servers.md';

export function UploadServers({ connections }: { connections: Connection[] }) {
  const servers = connections
    .filter((c) => c.server)
    .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
  const [adding, setAdding] = useState(false);
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
    <div className="space-y-3 border-t pt-4">
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
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> Add upload server
        </Button>
      </div>
      {servers.length > 0 && (
        <ul className="divide-y">
          {servers.map((connection) => (
            <li key={connection.connector} className="flex flex-wrap items-center gap-3 py-3 last:pb-0">
              <Server className="text-muted-foreground size-5 shrink-0" />
              <div className="min-w-48 flex-1 space-y-0.5">
                <p className="text-sm font-medium">{connection.server!.name}</p>
                <p className="text-muted-foreground truncate text-xs">{connection.server!.endpoint}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={removing === connection.connector}
                onClick={() => remove(connection)}
              >
                {removing === connection.connector && <Loader2 className="animate-spin" />} Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddServerDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddServerDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const unencrypted = endpoint.trim().startsWith('http://') && token.trim() !== '';

  // Runs straight from the submit: adding asks for a permission, which needs the gesture.
  const save = () => {
    setError(undefined);
    setSaving(true);
    addUploadServer({ name, endpoint, token }).then(
      (connection) => {
        setSaving(false);
        if (!connection) return;
        toast.success(`Added ${connection.server!.name}`);
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
            <DialogTitle>Add upload server</DialogTitle>
            <DialogDescription>
              Your browser asks to let Screen Tools talk to this server. Files go there only when you upload them.
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
              {saving && <Loader2 className="animate-spin" />} Add server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

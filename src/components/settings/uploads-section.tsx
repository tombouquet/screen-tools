import { Check, CloudUpload, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SectionHeader, SettingGroup } from '@/components/settings/layout';
import { UploadServers } from '@/components/upload-servers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignInCancelled, connect, disconnect } from '@/lib/connectors/auth';
import { CONNECTORS } from '@/lib/connectors/registry';
import type { Connection, Connector, ConnectorId } from '@/lib/connectors/types';
import { useUploadGuard } from '@/lib/connectors/upload';

export function UploadsSection({ connections }: { connections?: Connection[] }) {
  const [pending, setPending] = useState<ConnectorId>();
  // An upload started on another page may still be running in this window.
  useUploadGuard();

  // Called straight from the click: Connect asks for permissions, which needs the gesture.
  const onConnect = (connector: Connector) => {
    setPending(connector.id);
    connect(connector).then(
      (connection) => toast.success(`Connected to ${connector.name}`, { description: accountLabel(connection) }),
      (error: unknown) => {
        if (error instanceof SignInCancelled) return;
        console.error(error);
        toast.error(`Couldn't connect to ${connector.name}`, { description: error instanceof Error ? error.message : String(error) });
      },
    ).finally(() => setPending(undefined));
  };
  const onDisconnect = (connector: Connector) => {
    setPending(connector.id);
    disconnect(connector.id).then(
      () => toast.success(`Disconnected from ${connector.name}`),
      (error: unknown) => {
        console.error(error);
        toast.error(`Couldn't disconnect from ${connector.name}`, { description: error instanceof Error ? error.message : String(error) });
      },
    ).finally(() => setPending(undefined));
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={CloudUpload}
        title="Uploads"
        description="Upload videos and screenshots and get a link to share. Files only leave your computer when you upload them."
      />

      <SettingGroup title="Cloud storage">
        <ul className="divide-y rounded-lg border">
          {CONNECTORS.filter((c) => c.auth).map((connector) => {
            const connection = connections?.find((c) => c.connector === connector.id);
            const available = Boolean(connector.auth?.clientId);
            const busy = pending === connector.id;
            return (
              <li key={connector.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <connector.icon className="size-4" />
                </span>
                <div className="min-w-40 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {connector.name}
                    {connection && (
                      <Badge variant="secondary" className="text-green-700 dark:text-green-400">
                        <Check /> Connected
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {available ? connector.description : 'Not available in this build'}
                  </p>
                  {connection && <p className="truncate text-xs">{accountLabel(connection)}</p>}
                </div>
                {available &&
                  connections &&
                  (connection ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => onDisconnect(connector)}>
                      {busy && <Loader2 className="animate-spin" />} Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => onConnect(connector)}>
                      {busy && <Loader2 className="animate-spin" />} Connect
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      </SettingGroup>

      {connections && (
        <SettingGroup>
          <UploadServers connections={connections} />
        </SettingGroup>
      )}
    </div>
  );
}

const accountLabel = (connection: Connection) =>
  connection.account.email ?? connection.account.name ?? connection.account.id;

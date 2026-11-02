// Every upload destination, in the order Settings and the save dialog show them. Upload
// servers come from what people added in Settings, so they're built from storage.
import { listConnections, subscribeConnections } from './connections';
import { dropbox } from './dropbox';
import { googleDrive } from './google-drive';
import { local } from './local';
import { removedServer, uploadServerConnector } from './upload-server';
import { isServerId, type Connection, type Connector, type ConnectorId, type MediaKind } from './types';

/** The built-in destinations. */
export const CONNECTORS: readonly Connector[] = [local, googleDrive, dropbox];

/** The connector for a saved upload server. */
export const serverConnector = (connection: Connection): Connector | undefined =>
  connection.server && uploadServerConnector(connection.connector, connection.server);

// Saved upload servers, kept in step with storage so getConnector can stay synchronous.
let servers = new Map<ConnectorId, Connector>();

async function loadServers(): Promise<void> {
  const next = new Map<ConnectorId, Connector>();
  for (const connection of await listConnections()) {
    const connector = serverConnector(connection);
    if (connector) next.set(connector.id, connector);
  }
  servers = next;
}

if (typeof window !== 'undefined') {
  void loadServers().catch((error: unknown) => console.error("Couldn't load upload servers", error));
  subscribeConnections(() => void loadServers().catch((error: unknown) => console.error(error)));
}

export function getConnector(id: ConnectorId): Connector {
  if (isServerId(id)) return servers.get(id) ?? removedServer(id);
  const connector = CONNECTORS.find((c) => c.id === id);
  if (!connector) throw new Error(`Unknown connector: ${id}`);
  return connector;
}

/** Like getConnector, but reads storage first, for a server added a moment ago. */
export async function loadConnector(id: ConnectorId): Promise<Connector> {
  if (isServerId(id) && !servers.has(id)) await loadServers();
  return getConnector(id);
}

/** Built-in destinations that take this kind of file. */
export const connectorsFor = (kind: MediaKind) => CONNECTORS.filter((c) => c.accepts.includes(kind));

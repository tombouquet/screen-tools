// Every upload destination, in the order Settings and the save dialog show them.
import { dropbox } from './dropbox';
import { googleDrive } from './google-drive';
import { local } from './local';
import type { Connector, ConnectorId, MediaKind } from './types';

export const CONNECTORS: readonly Connector[] = [local, googleDrive, dropbox];

export function getConnector(id: ConnectorId): Connector {
  const connector = CONNECTORS.find((c) => c.id === id);
  if (!connector) throw new Error(`Unknown connector: ${id}`);
  return connector;
}

/** Destinations that take this kind of file. */
export const connectorsFor = (kind: MediaKind) => CONNECTORS.filter((c) => c.accepts.includes(kind));

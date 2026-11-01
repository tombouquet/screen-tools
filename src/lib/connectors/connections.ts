// Connected accounts, one per connector, kept in browser.storage.local so every extension
// page sees the same sign-ins. Tokens stay on this computer.
import { useSyncExternalStore } from 'react';
import { browser, type Browser } from 'wxt/browser';
import type { Connection, ConnectorId } from './types';

const STORAGE_KEY = 'connections';

type Stored = Partial<Record<ConnectorId, Connection>>;

let cache: Connection[] | undefined;
let loading: Promise<Connection[]> | undefined;
const listeners = new Set<() => void>();

async function read(): Promise<Stored> {
  const { [STORAGE_KEY]: stored } = await browser.storage.local.get(STORAGE_KEY);
  return stored && typeof stored === 'object' ? (stored as Stored) : {};
}

async function write(stored: Stored): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: stored });
}

export async function listConnections(): Promise<Connection[]> {
  return Object.values(await read()).filter((c): c is Connection => Boolean(c));
}

export async function getConnection(id: ConnectorId): Promise<Connection | undefined> {
  return (await read())[id];
}

export async function saveConnection(connection: Connection): Promise<void> {
  const stored = await read();
  await write({ ...stored, [connection.connector]: connection });
}

export async function removeConnection(id: ConnectorId): Promise<void> {
  const { [id]: _removed, ...rest } = await read();
  await write(rest);
}

/** Calls `listener` whenever any page adds, renews or removes a connection. */
export function subscribeConnections(listener: () => void): () => void {
  const onChanged = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
    if (area === 'local' && STORAGE_KEY in changes) listener();
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}

let reloadAfter = false;

/** Reloads the cache. A change while a read is in flight reads again afterwards. */
function refresh(): void {
  if (loading) {
    reloadAfter = true;
    return;
  }
  loading = listConnections()
    .then((list) => {
      cache = list;
      listeners.forEach((l) => l());
      return list;
    })
    .catch((error: unknown) => {
      console.error(error);
      return cache ?? [];
    })
    .finally(() => {
      loading = undefined;
      if (reloadAfter) {
        reloadAfter = false;
        refresh();
      }
    });
}

let unsubscribe: (() => void) | undefined;

function subscribeCache(listener: () => void): () => void {
  listeners.add(listener);
  if (!unsubscribe) {
    unsubscribe = subscribeConnections(refresh);
    // Storage may have changed while nothing was listening.
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      unsubscribe?.();
      unsubscribe = undefined;
    }
  };
}

/** The connected accounts, or undefined until they've loaded. */
export function useConnections(): Connection[] | undefined {
  return useSyncExternalStore(subscribeCache, () => cache);
}

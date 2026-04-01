import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

const IDB_KEY = "ORBISPM_QUERY_CACHE";

// Bump this when cached data shapes change to force a cache clear
const SCHEMA_VERSION = 2;
const IDB_VERSION_KEY = "ORBISPM_CACHE_VERSION";

/**
 * Persists TanStack Query cache to IndexedDB via idb-keyval.
 * Survives page refreshes, browser restarts, and offline periods.
 * On next load the cache is restored instantly before any network fetch.
 *
 * Includes schema versioning: if the stored version differs from SCHEMA_VERSION,
 * the stale cache is discarded to prevent deserialization bugs.
 */
export function createIDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(IDB_KEY, client);
        await set(IDB_VERSION_KEY, SCHEMA_VERSION);
      } catch (err) {
        // IndexedDB quota exceeded or blocked
        console.warn(
          "[IDB Persister] Failed to persist cache (quota exceeded or blocked):",
          err,
        );
      }
    },
    restoreClient: async () => {
      try {
        const storedVersion = await get<number>(IDB_VERSION_KEY);
        if (storedVersion !== SCHEMA_VERSION) {
          // Schema changed — discard stale cache
          await del(IDB_KEY);
          await set(IDB_VERSION_KEY, SCHEMA_VERSION);
          return undefined;
        }
        return await get<PersistedClient>(IDB_KEY);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(IDB_KEY);
        await del(IDB_VERSION_KEY);
      } catch {
        // ignore
      }
    },
  };
}

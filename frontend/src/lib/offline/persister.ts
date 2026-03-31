import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

const IDB_KEY = "ORBISPM_QUERY_CACHE";

/**
 * Persists TanStack Query cache to IndexedDB via idb-keyval.
 * Survives page refreshes, browser restarts, and offline periods.
 * On next load the cache is restored instantly before any network fetch.
 */
export function createIDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(IDB_KEY, client);
      } catch {
        // IndexedDB quota exceeded or blocked — silently ignore
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(IDB_KEY);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(IDB_KEY);
      } catch {
        // ignore
      }
    },
  };
}

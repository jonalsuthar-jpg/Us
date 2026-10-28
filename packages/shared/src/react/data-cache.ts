/**
 * Last-known data for every screen, so opening one draws what we had at once
 * and the server's answer replaces it quietly (stale-while-revalidate).
 *
 * Always kept in memory for the session. A platform can plug in a store
 * (mobile: AsyncStorage) so it also survives a cold start.
 */
export interface DataCacheStore {
  /** Everything saved, read once at boot. */
  load(): Promise<Record<string, unknown>>;
  save(key: string, value: unknown): void;
  clear(): void;
}

/** Entries bigger than this stay in memory only. */
const MAX_PERSIST_CHARS = 300_000;
const PERSIST_DELAY_MS = 800;

const memory = new Map<string, unknown>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
let store: DataCacheStore | null = null;
let hydrated: Promise<void> | null = null;

/** Tell shared code where to keep data between launches (mobile wires this to AsyncStorage). */
export function setDataCacheStore(next: DataCacheStore) {
  store = next;
  hydrated = null;
}

/** Fill memory from the store. Safe to call more than once; later calls reuse the first read. */
export function hydrateDataCache(): Promise<void> {
  if (!store) return Promise.resolve();
  hydrated ??= store
    .load()
    .then((saved) => {
      // Anything written this session is newer than what was saved.
      for (const [k, v] of Object.entries(saved)) if (!memory.has(k)) memory.set(k, v);
    })
    .catch(() => {});
  return hydrated;
}

export function readCache<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

/** `persist: false` keeps it for this session only (values that don't survive JSON, or expire fast). */
export function writeCache<T>(key: string, value: T, persist = true) {
  memory.set(key, value);
  if (!store || !persist) return;
  const t = pending.get(key);
  if (t) clearTimeout(t);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      try {
        if (JSON.stringify(value).length <= MAX_PERSIST_CHARS) store?.save(key, value);
      } catch {
        // Not serialisable: memory only.
      }
    }, PERSIST_DELAY_MS),
  );
}

/** Forget everything (sign-out, unpair). */
export function clearDataCache() {
  memory.clear();
  pending.forEach(clearTimeout);
  pending.clear();
  store?.clear();
}

export const cacheKey = (coupleId: string, topic: string) => `${coupleId}:${topic}`;

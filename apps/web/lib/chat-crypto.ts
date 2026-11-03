import { setKeyStore, setMediaVault, type KeyStore, type MediaVault } from '@us/shared';

/**
 * This browser's chat secrets (its device key and the chat key it opened),
 * in IndexedDB: they stay on this machine and are wiped on sign-out.
 * Opened photos and voice notes are kept there too, so each file is
 * downloaded once per browser rather than on every page load.
 */

const DB = 'us-chat';
const STORE = 'keys';
const MEDIA = 'media';

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const names = req.result.objectStoreNames;
      if (!names.contains(STORE)) req.result.createObjectStore(STORE);
      if (!names.contains(MEDIA)) req.result.createObjectStore(MEDIA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      db = null;
      reject(req.error);
    };
  });
  return db;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const conn = await open();
  return new Promise((resolve, reject) => {
    const req = fn(conn.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const keyStore: KeyStore = {
  get: async (name) => ((await run('readonly', (s) => s.get(name))) as string | undefined) ?? null,
  set: async (name, value) => void (await run('readwrite', (s) => s.put(value, name))),
  remove: async (name) => void (await run('readwrite', (s) => s.delete(name))),
};

// Object URLs handed out this page load, so each file gets one.
const urls = new Map<string, string>();

const toUrl = (path: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  urls.set(path, url);
  return url;
};

const mediaVault: MediaVault = {
  async put(path, bytes, mime) {
    const known = urls.get(path);
    if (known) return known;
    const blob = new Blob([bytes as BlobPart], { type: mime });
    // A full or private-mode store still shows the file, just from memory.
    await run('readwrite', (s) => s.put(blob, path), MEDIA).catch(() => {});
    return toUrl(path, blob);
  },
  async get(path) {
    const known = urls.get(path);
    if (known) return known;
    const blob = (await run('readonly', (s) => s.get(path), MEDIA)) as Blob | undefined;
    return blob ? toUrl(path, blob) : null;
  },
  async clear() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
    await run('readwrite', (s) => s.clear(), MEDIA);
  },
};

if (typeof indexedDB !== 'undefined') {
  setKeyStore(keyStore);
  setMediaVault(mediaVault);
}

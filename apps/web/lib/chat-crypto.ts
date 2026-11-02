import { setKeyStore, type KeyStore } from '@us/shared';

/**
 * This browser's chat secrets (its device key and the chat key it opened),
 * in IndexedDB: they stay on this machine and are wiped on sign-out.
 * Opened photos and voice notes stay in memory as object URLs (the default).
 */

const DB = 'us-chat';
const STORE = 'keys';

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      db = null;
      reject(req.error);
    };
  });
  return db;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const conn = await open();
  return new Promise((resolve, reject) => {
    const req = fn(conn.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const keyStore: KeyStore = {
  get: async (name) => ((await run('readonly', (s) => s.get(name))) as string | undefined) ?? null,
  set: async (name, value) => void (await run('readwrite', (s) => s.put(value, name))),
  remove: async (name) => void (await run('readwrite', (s) => s.delete(name))),
};

if (typeof indexedDB !== 'undefined') setKeyStore(keyStore);

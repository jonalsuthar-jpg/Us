import { fromBase64, toBase64 } from './encoding';
import type { DeviceKeys } from './keys';

/**
 * Where a device keeps its secrets: its own key pair and the chat keys it has
 * opened. Mobile plugs in the Keychain / Keystore (expo-secure-store), web
 * IndexedDB. Nothing here ever goes to the server.
 */
export interface KeyStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

let store: KeyStore | null = null;

export function setKeyStore(next: KeyStore) {
  store = next;
}

function keyStore(): KeyStore {
  if (!store) throw new Error('no_key_store');
  return store;
}

/** This device as the chat knows it, per account (two people can share a browser). */
export interface StoredDevice extends DeviceKeys {
  id: string;
}

// Names stay within [A-Za-z0-9._-], which is all expo-secure-store accepts.
const deviceName = (userId: string) => `us.chat.device.${userId}`;
const chatKeyName = (coupleId: string, version: number) => `us.chat.key.${coupleId}.${version}`;

export async function loadDevice(userId: string): Promise<StoredDevice | null> {
  const raw = await keyStore().get(deviceName(userId));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { id: string; publicKey: string; secretKey: string };
    return { id: d.id, publicKey: fromBase64(d.publicKey), secretKey: fromBase64(d.secretKey) };
  } catch {
    return null;
  }
}

export function saveDevice(userId: string, d: StoredDevice): Promise<void> {
  return keyStore().set(deviceName(userId), JSON.stringify({ id: d.id, publicKey: toBase64(d.publicKey), secretKey: toBase64(d.secretKey) }));
}

export async function loadChatKey(coupleId: string, version: number): Promise<Uint8Array | null> {
  const raw = await keyStore().get(chatKeyName(coupleId, version));
  if (!raw) return null;
  try {
    const key = fromBase64(raw);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function saveChatKey(coupleId: string, version: number, key: Uint8Array): Promise<void> {
  return keyStore().set(chatKeyName(coupleId, version), toBase64(key));
}

/** Signing out: this device forgets who it was in the chat. */
export async function forgetChatSecrets(userId: string, coupleId: string | null, versions: number[] = [1]): Promise<void> {
  const s = keyStore();
  await s.remove(deviceName(userId));
  if (coupleId) for (const v of versions) await s.remove(chatKeyName(coupleId, v));
}

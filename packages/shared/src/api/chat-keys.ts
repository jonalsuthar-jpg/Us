import { fromBase64, toBase64 } from '../crypto/encoding';
import { generateChatKey, generateDeviceKeys, openSealedKey, sealKey, unwrapWithPin, wrapWithPin, type PinBackup, type PinParams } from '../crypto/keys';
import { forgetChatSecrets, loadDevice, saveDevice, type StoredDevice } from '../crypto/keystore';
import type { ChatDevice, ChatKeyWrap } from '../database.types';
import type { UsClient } from '../supabase';

/** "Our chat keys or devices changed" ping on the couple channel. */
export const CHAT_KEYS_TOPIC = 'chat:keys';
/** There is one chat key per couple for now; the column leaves room for rotating it. */
export const CHAT_KEY_VERSION = 1;

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

const isDuplicate = (e: unknown) => (e as { code?: string } | null)?.code === '23505';

/**
 * This device's chat identity: the one saved on it, or a new key pair
 * registered now (`created`, so the app can tell our other devices). A saved
 * one the server no longer knows (revoked, or the account was reset) is
 * replaced.
 */
export async function ensureChatDevice(sb: UsClient, userId: string, label: string): Promise<{ device: StoredDevice; created: boolean }> {
  const saved = await loadDevice(userId);
  if (saved) {
    const { data, error } = await sb.from('chat_devices').select('*').eq('id', saved.id).maybeSingle();
    if (error) throw error;
    if (data && !data.revoked_at) return { device: saved, created: false };
  }
  const keys = generateDeviceKeys();
  const { data: row, error } = await sb.from('chat_devices').insert({ public_key: toBase64(keys.publicKey), label }).select('*').single();
  if (error || !row) throw error ?? new Error('device_not_saved');
  const device = { id: row.id, ...keys };
  await saveDevice(userId, device);
  return { device, created: true };
}

/**
 * My partner's devices I should seal the key to without asking: all of
 * theirs, while none of them holds it yet (their first device has nobody of
 * theirs to approve it). Once one does, their own devices approve the rest.
 */
export function partnerDevicesToShare(state: Pick<ChatKeyState, 'devices' | 'wraps'>, partnerId: string): ChatDevice[] {
  const holders = new Set(state.wraps.map((w) => w.device_id));
  const theirs = state.devices.filter((d) => d.user_id === partnerId);
  return theirs.some((d) => holders.has(d.id)) ? [] : theirs;
}

/**
 * Who a device without the key is waiting for: one of my other devices to
 * approve it, or (while none of mine holds the key) my partner's app to
 * share it.
 */
export function waitingFor(state: Pick<ChatKeyState, 'devices' | 'wraps'>, myId: string): 'my-device' | 'partner' {
  const holders = new Set(state.wraps.map((w) => w.device_id));
  return state.devices.some((d) => d.user_id === myId && holders.has(d.id)) ? 'my-device' : 'partner';
}

export interface ChatKeyState {
  /** Both of our devices that may hold the key. */
  devices: ChatDevice[];
  /** Which of them hold it. */
  wraps: ChatKeyWrap[];
  /** Whether the couple has a chat key yet. */
  exists: boolean;
  /** Whether I've saved a PIN backup of it. */
  hasBackup: boolean;
}

export async function fetchChatKeyState(sb: UsClient, coupleId: string, version = CHAT_KEY_VERSION): Promise<ChatKeyState> {
  const [devices, wraps, keys, backups] = await Promise.all([
    sb.from('chat_devices').select('*').is('revoked_at', null).order('created_at'),
    sb.from('chat_key_wraps').select('*').eq('couple_id', coupleId).eq('key_version', version),
    sb.from('chat_keys').select('key_version').eq('couple_id', coupleId).eq('key_version', version),
    sb.from('chat_key_backups').select('key_version').eq('couple_id', coupleId).eq('key_version', version),
  ]);
  return {
    devices: unwrap(devices),
    wraps: unwrap(wraps),
    exists: unwrap(keys).length > 0,
    hasBackup: unwrap(backups).length > 0,
  };
}

/**
 * Make the couple's chat key, if nobody has yet. Returns it, or null when my
 * partner's device got there first (it will be shared with me instead).
 */
export async function claimChatKey(sb: UsClient, device: StoredDevice, version = CHAT_KEY_VERSION): Promise<Uint8Array | null> {
  const key = generateChatKey();
  const made = unwrap(
    await sb.rpc('claim_chat_key', { p_version: version, p_device_id: device.id, p_wrapped_key: sealKey(key, device.publicKey) }),
  );
  return made ? key : null;
}

/** Open the chat key sealed to this device, if there is one. */
export function openMyWrap(device: StoredDevice, wraps: ChatKeyWrap[]): Uint8Array | null {
  const mine = wraps.find((w) => w.device_id === device.id);
  if (!mine) return null;
  try {
    return openSealedKey(mine.wrapped_key, device);
  } catch {
    return null;
  }
}

/** Seal the chat key to another of our devices. Doing it twice is fine. */
export async function shareChatKey(
  sb: UsClient,
  s: { coupleId: string; key: Uint8Array; from: StoredDevice; to: ChatDevice; version?: number },
): Promise<void> {
  const { error } = await sb.from('chat_key_wraps').insert({
    couple_id: s.coupleId,
    key_version: s.version ?? CHAT_KEY_VERSION,
    device_id: s.to.id,
    wrapped_key: sealKey(s.key, fromBase64(s.to.public_key)),
    wrapped_by: s.from.id,
  });
  if (error && !isDuplicate(error)) throw error;
}

/** Save (or replace) my PIN backup of the chat key. */
export async function saveChatKeyBackup(sb: UsClient, coupleId: string, key: Uint8Array, pin: string, version = CHAT_KEY_VERSION): Promise<void> {
  const b = await wrapWithPin(key, pin);
  unwrap(
    await sb
      .from('chat_key_backups')
      .upsert({ couple_id: coupleId, key_version: version, salt: b.salt, params: { ...b.params }, wrapped_key: b.wrapped, updated_at: new Date().toISOString() })
      .select('key_version'),
  );
}

/** Open my PIN backup. Throws "no_backup" or "wrong_pin". */
export async function restoreChatKeyBackup(sb: UsClient, coupleId: string, pin: string, version = CHAT_KEY_VERSION): Promise<Uint8Array> {
  const { data: row, error } = await sb.from('chat_key_backups').select('*').eq('couple_id', coupleId).eq('key_version', version).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('no_backup');
  const backup: PinBackup = { salt: row.salt, params: row.params as unknown as PinParams, wrapped: row.wrapped_key };
  return unwrapWithPin(backup, pin);
}

/** Take one of my devices out of the chat (it can no longer get the key). */
export async function revokeChatDevice(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.rpc('revoke_chat_device', { p_id: id }));
}

/**
 * Signing out of a browser: it leaves the chat (revoked, so it can't be given
 * the key again) and forgets its secrets. Signing in again makes it a new
 * device, approved from another one or with the PIN.
 */
export async function leaveChatOnThisDevice(sb: UsClient, userId: string, coupleId: string | null): Promise<void> {
  const saved = await loadDevice(userId).catch(() => null);
  if (saved) await revokeChatDevice(sb, saved.id).catch(() => {});
  await forgetChatSecrets(userId, coupleId, [CHAT_KEY_VERSION]).catch(() => {});
}

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { scryptAsync } from '@noble/hashes/scrypt';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '@noble/hashes/utils';
import { concat, fromBase64, toBase64, utf8Encode } from './encoding';

/**
 * The keys behind encrypted chat.
 *
 *   device keys   an X25519 pair per device; the secret never leaves it
 *   chat key      32 random bytes the couple shares, sealed to each device
 *                 (sealKey) and to each person's PIN (wrapWithPin)
 */

export interface DeviceKeys {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateDeviceKeys(): DeviceKeys {
  const secretKey = x25519.utils.randomPrivateKey();
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function generateChatKey(): Uint8Array {
  return randomBytes(32);
}

const SEAL_INFO = utf8Encode('us-chat-seal-v1');

/** The chat key sealed so only the holder of `recipient`'s secret can open it: base64(ephemeral ‖ nonce ‖ box). */
export function sealKey(chatKey: Uint8Array, recipient: Uint8Array): string {
  const eph = generateDeviceKeys();
  const wrap = hkdf(sha256, x25519.getSharedSecret(eph.secretKey, recipient), concat(eph.publicKey, recipient), SEAL_INFO, 32);
  const nonce = randomBytes(24);
  const box = xchacha20poly1305(wrap, nonce, recipient).encrypt(chatKey);
  return toBase64(concat(eph.publicKey, nonce, box));
}

/** Throws if it wasn't sealed to this device or was tampered with. */
export function openSealedKey(sealed: string, me: DeviceKeys): Uint8Array {
  const bytes = fromBase64(sealed);
  if (bytes.length !== 32 + 24 + 32 + 16) throw new Error('bad_sealed_key');
  const ephPublic = bytes.subarray(0, 32);
  const wrap = hkdf(sha256, x25519.getSharedSecret(me.secretKey, ephPublic), concat(ephPublic, me.publicKey), SEAL_INFO, 32);
  return xchacha20poly1305(wrap, bytes.subarray(32, 56), me.publicKey).decrypt(bytes.subarray(56));
}

// ------------------------------------------------------------- PIN backup ---

/** A PIN shorter than this could be guessed offline by whoever holds the backup. */
export const MIN_PIN_LENGTH = 8;

export interface PinParams {
  N: number;
  r: number;
  p: number;
}

/** scrypt at 32 MB: a second or two in pure JS on a phone, slow enough per guess. */
export const PIN_PARAMS: PinParams = { N: 2 ** 15, r: 8, p: 1 };

export interface PinBackup {
  salt: string;
  params: PinParams;
  wrapped: string;
}

const PIN_INFO = utf8Encode('us-chat-pin-v1');

async function pinKey(pin: string, salt: Uint8Array, params: PinParams): Promise<Uint8Array> {
  const stretched = await scryptAsync(utf8Encode(pin.normalize('NFKC')), salt, { ...params, dkLen: 32, asyncTick: 20 });
  return hkdf(sha256, stretched, salt, PIN_INFO, 32);
}

export async function wrapWithPin(chatKey: Uint8Array, pin: string, params: PinParams = PIN_PARAMS): Promise<PinBackup> {
  if (pin.length < MIN_PIN_LENGTH) throw new Error('pin_too_short');
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const box = xchacha20poly1305(await pinKey(pin, salt, params), nonce, PIN_INFO).encrypt(chatKey);
  return { salt: toBase64(salt), params, wrapped: toBase64(concat(nonce, box)) };
}

/** Throws "wrong_pin" when the PIN doesn't open it. */
export async function unwrapWithPin(backup: PinBackup, pin: string): Promise<Uint8Array> {
  const bytes = fromBase64(backup.wrapped);
  const key = await pinKey(pin, fromBase64(backup.salt), backup.params);
  try {
    return xchacha20poly1305(key, bytes.subarray(0, 24), PIN_INFO).decrypt(bytes.subarray(24));
  } catch {
    throw new Error('wrong_pin');
  }
}

// ---------------------------------------------------------- safety codes ---

/** "4821 0937": the same on both screens means the same key. */
export function shortCode(...publicKeys: Uint8Array[]): string {
  const sorted = [...publicKeys].sort((a, b) => (toBase64(a) < toBase64(b) ? -1 : 1));
  const h = sha256(concat(utf8Encode('us-chat-code-v1'), ...sorted));
  const n = ((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0;
  const digits = String(n % 100_000_000).padStart(8, '0');
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

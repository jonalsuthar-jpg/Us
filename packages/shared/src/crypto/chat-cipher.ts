import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from './random';
import type { MediaMeta } from '../database.types';
import { concat, fromBase64, toBase64, utf8Decode, utf8Encode } from './encoding';

/** What a message's ciphertext holds. */
export interface MessagePayload {
  body?: string | null;
  meta?: MediaMeta | null;
  /** The file's real type, now that the upload itself is opaque bytes. */
  mime?: string | null;
}

/** Ties a message's ciphertext to its row, so it can't be moved to another one or another sender. */
export interface MessageBinding {
  couple_id: string;
  id: string;
  sender_id: string;
}

/** Encrypted files start with this, then the key version, the nonce and the box. */
const FILE_MAGIC = utf8Encode('USE1');
/** Message text is padded to a multiple of this, so its ciphertext gives away only a rough length. */
const PAD = 64;

const sub = (key: Uint8Array, label: string) => hkdf(sha256, key, undefined, utf8Encode(`us-chat-${label}-v1`), 32);
const aad = (...parts: string[]) => utf8Encode(parts.join('|'));

function seal(key: Uint8Array, plain: Uint8Array, ad: Uint8Array): Uint8Array {
  const nonce = randomBytes(24);
  return concat(nonce, xchacha20poly1305(key, nonce, ad).encrypt(plain));
}

function open(key: Uint8Array, sealed: Uint8Array, ad: Uint8Array): Uint8Array {
  if (sealed.length < 24 + 16) throw new Error('bad_ciphertext');
  return xchacha20poly1305(key, sealed.subarray(0, 24), ad).decrypt(sealed.subarray(24));
}

/** Everything the chat encrypts, under one version of the couple's chat key. */
export class ChatCipher {
  private readonly msgKey: Uint8Array;
  private readonly reactKey: Uint8Array;
  private readonly fileKey: Uint8Array;
  private readonly snapKey: Uint8Array;

  constructor(
    readonly version: number,
    key: Uint8Array,
  ) {
    if (key.length !== 32) throw new Error('bad_chat_key');
    this.msgKey = sub(key, 'msg');
    this.reactKey = sub(key, 'react');
    this.fileKey = sub(key, 'file');
    this.snapKey = sub(key, 'snap');
  }

  encryptMessage(m: MessageBinding, payload: MessagePayload): string {
    const json = utf8Encode(JSON.stringify(payload));
    // Trailing spaces are still valid JSON.
    const padded = new Uint8Array(Math.ceil((json.length + 1) / PAD) * PAD).fill(0x20);
    padded.set(json);
    return toBase64(seal(this.msgKey, padded, aad(m.couple_id, m.id, m.sender_id)));
  }

  decryptMessage(m: MessageBinding, ciphertext: string): MessagePayload {
    const payload = JSON.parse(utf8Decode(open(this.msgKey, fromBase64(ciphertext), aad(m.couple_id, m.id, m.sender_id))));
    if (!payload || typeof payload !== 'object') throw new Error('bad_payload');
    return payload as MessagePayload;
  }

  /** base64(version ‖ nonce ‖ box), so it also reads under a later key. */
  encryptReaction(messageId: string, userId: string, emoji: string): string {
    const version = new Uint8Array([this.version >> 8, this.version & 255]);
    return toBase64(concat(version, seal(this.reactKey, utf8Encode(emoji), aad(messageId, userId))));
  }

  decryptReaction(messageId: string, userId: string, value: string): string {
    const bytes = fromBase64(value);
    if (reactionVersion(bytes) !== this.version) throw new Error('other_key');
    return utf8Decode(open(this.reactKey, bytes.subarray(2), aad(messageId, userId)));
  }

  /** A file for the chat bucket, bound to the path it's stored at. */
  encryptFile(path: string, bytes: Uint8Array): Uint8Array {
    const version = new Uint8Array([this.version >> 8, this.version & 255]);
    return concat(FILE_MAGIC, version, seal(this.fileKey, bytes, aad(path)));
  }

  decryptFile(path: string, bytes: Uint8Array): Uint8Array {
    if (fileKeyVersion(bytes) !== this.version) throw new Error('other_key');
    return open(this.fileKey, bytes.subarray(FILE_MAGIC.length + 2), aad(path));
  }

  /** A snap's caption, bound to its photo (each snap has its own). */
  encryptCaption(photoPath: string, caption: string): string {
    return toBase64(seal(this.snapKey, utf8Encode(caption), aad(photoPath)));
  }

  decryptCaption(photoPath: string, ciphertext: string): string {
    return utf8Decode(open(this.snapKey, fromBase64(ciphertext), aad(photoPath)));
  }
}

/** Plain emoji are never base64; encrypted reactions always are. */
export function isEncryptedReaction(value: string): boolean {
  return value.length > 40 && /^[A-Za-z0-9+/]+=*$/.test(value);
}

function reactionVersion(bytes: Uint8Array): number {
  return (bytes[0]! << 8) | bytes[1]!;
}

export function reactionKeyVersion(value: string): number | null {
  try {
    return reactionVersion(fromBase64(value));
  } catch {
    return null;
  }
}

/** The key version an encrypted file was made with, or null for a plain file. */
export function fileKeyVersion(bytes: Uint8Array): number | null {
  if (bytes.length < FILE_MAGIC.length + 2 + 24 + 16) return null;
  for (let i = 0; i < FILE_MAGIC.length; i++) if (bytes[i] !== FILE_MAGIC[i]) return null;
  return (bytes[FILE_MAGIC.length]! << 8) | bytes[FILE_MAGIC.length + 1]!;
}

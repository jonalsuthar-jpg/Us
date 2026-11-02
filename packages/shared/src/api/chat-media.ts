import { fileKeyVersion, type ChatCipher } from '../crypto/chat-cipher';
import { chatMediaUrls } from './messages';

/**
 * Where opened (decrypted) chat files are kept on this device, so a picture
 * or voice note can be shown from a local URI. Web keeps object URLs in
 * memory; mobile writes files to its cache folder.
 */
export interface MediaVault {
  /** A URI for these bytes, under the storage path they came from. */
  put(path: string, bytes: Uint8Array, mime: string): Promise<string>;
  /** The URI from an earlier put, if it's still there. */
  get(path: string): Promise<string | null>;
  /** Sign-out and unpair. */
  clear(): Promise<void>;
}

const objectUrls = new Map<string, string>();

/** The default: object URLs, for as long as the page is open. */
const memoryVault: MediaVault = {
  async put(path, bytes, mime) {
    const old = objectUrls.get(path);
    if (old) return old;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    objectUrls.set(path, url);
    return url;
  },
  async get(path) {
    return objectUrls.get(path) ?? null;
  },
  async clear() {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.clear();
  },
};

let vault: MediaVault = memoryVault;

export function setMediaVault(next: MediaVault) {
  vault = next;
}

export function clearMediaVault(): Promise<void> {
  return vault.clear().catch(() => {});
}

export interface MediaRequest {
  path: string;
  /** The file's real type; encrypted uploads only say "octet-stream". */
  mime?: string | null;
}

/**
 * Local URIs for chat files that may be encrypted: each is fetched once,
 * opened here and kept in the vault. A file that turns out not to be
 * encrypted (sent before encryption) gets its signed link instead. Paths
 * that can't be fetched or opened are left out, to be asked for again later.
 */
export async function openChatMedia(sb: Parameters<typeof chatMediaUrls>[0], cipher: ChatCipher | null, items: MediaRequest[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: MediaRequest[] = [];
  for (const item of items) {
    const uri = await vault.get(item.path).catch(() => null);
    if (uri) out[item.path] = uri;
    else missing.push(item);
  }
  if (!missing.length) return out;
  const signed = await chatMediaUrls(sb, missing.map((m) => m.path));
  await Promise.all(
    missing.map(async ({ path, mime }) => {
      const url = signed[path];
      if (!url) return;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (fileKeyVersion(bytes) === null) {
          out[path] = url;
          return;
        }
        if (!cipher) return;
        out[path] = await vault.put(path, cipher.decryptFile(path, bytes), mime || 'application/octet-stream');
      } catch {
        // Try again next time.
      }
    }),
  );
  return out;
}

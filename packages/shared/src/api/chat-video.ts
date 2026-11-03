import type { ChatCipher } from '../crypto/chat-cipher';
import type { UsClient } from '../supabase';
import { keptLinks } from './signed-urls';

/**
 * Chat videos live in Cloudflare R2 rather than Supabase Storage (R2 doesn't
 * charge for downloads), under "<couple_id>/video/<message id>.enc". They're
 * always encrypted on the device, and the chat-video function signs the
 * links, so the R2 keys never ship in the apps.
 */

/** Largest video we send, after any compression (it's encrypted in memory). */
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
/** Longest video the pickers offer. */
export const VIDEO_MAX_MS = 60_000;

/** Where the link lifetime comes from: the function signs downloads for 6 hours. */
const DOWNLOAD_S = 6 * 3600;
const STORE = 'r2:video';

export const isVideoPath = (path: string | null | undefined): path is string => !!path && /^[^/]+\/video\/[^/]+\.enc$/.test(path);

export class VideoTooBigError extends Error {
  constructor() {
    super('That video is too big to send. Try a shorter one (up to a minute).');
  }
}

async function invoke<T>(sb: UsClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke('chat-video', { body });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

/** Encrypt and upload a video for this message; returns its path. */
export async function uploadChatVideo(sb: UsClient, messageId: string, bytes: Uint8Array, cipher: ChatCipher | null | undefined): Promise<string> {
  if (!cipher) throw new Error('Videos are sent encrypted, and this device doesn’t have the chat key yet.');
  if (bytes.byteLength > VIDEO_MAX_BYTES) throw new VideoTooBigError();
  const { path, url } = await invoke<{ path: string; url: string }>(sb, { action: 'upload', messageId });
  const res = await fetch(url, { method: 'PUT', body: cipher.encryptFile(path, bytes) as BodyInit, headers: { 'content-type': 'application/octet-stream' } });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return path;
}

/** Download links for videos, keyed by path (reused while they last). */
export function videoUrls(sb: UsClient, paths: string[]): Promise<Record<string, string>> {
  return keptLinks(STORE, paths, DOWNLOAD_S, async (missing) => (await invoke<{ urls: Record<string, string> }>(sb, { action: 'download', paths: missing })).urls);
}

/** Unpairing: delete our videos (best effort; R2 only holds ciphertext). */
export async function removeCoupleVideos(sb: UsClient): Promise<void> {
  await invoke(sb, { action: 'clear' }).catch(() => {});
}

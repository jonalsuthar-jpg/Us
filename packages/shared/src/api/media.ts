import type { UsClient } from '../supabase';

/**
 * Our files (photos, voice notes, stickers, drawings, snaps, birthday) live
 * in Cloudflare R2, not Supabase Storage: Storage downloads count against the
 * free plan's egress and R2's don't. The media function checks who may touch
 * which path and signs short-lived links; the bytes go straight to R2.
 * Bucket names and paths are the ones Storage used.
 */
export type MediaBucket = 'memories' | 'chat' | 'snaps' | 'drawings' | 'birthday';

type Body = Blob | ArrayBuffer | Uint8Array;

async function invoke<T>(sb: UsClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke('media', { body });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
}

/** Store a file at this path. */
export async function uploadFile(sb: UsClient, bucket: MediaBucket, path: string, body: Body, contentType: string): Promise<void> {
  const { url } = await invoke<{ url: string }>(sb, { action: 'upload', bucket, path });
  const res = await fetch(url, { method: 'PUT', body: body as BodyInit, headers: { 'content-type': contentType } });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

export async function removeFiles(sb: UsClient, bucket: MediaBucket, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await invoke(sb, { action: 'remove', bucket, paths });
}

export async function copyFile(sb: UsClient, from: { bucket: MediaBucket; path: string }, to: { bucket: MediaBucket; path: string }): Promise<void> {
  await invoke(sb, { action: 'copy', from, to });
}

/** Unpairing: every file of ours, in every bucket. */
export async function removeAllFiles(sb: UsClient): Promise<void> {
  await invoke(sb, { action: 'clear' });
}

/** Download links, keyed by path; paths we may not read are left out. */
export async function signDownloads(sb: UsClient, bucket: MediaBucket, paths: string[], expiresIn: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // The function signs up to 200 at a time.
  for (let i = 0; i < paths.length; i += 200) {
    const { urls } = await invoke<{ urls: Record<string, string> }>(sb, { action: 'download', bucket, paths: paths.slice(i, i + 200), expiresIn });
    Object.assign(out, urls);
  }
  return out;
}

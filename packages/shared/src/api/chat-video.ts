import type { ChatCipher } from '../crypto/chat-cipher';
import type { UsClient } from '../supabase';
import { keptLinks } from './signed-urls';

/**
 * Chat videos live in Cloudflare R2 rather than Supabase Storage (R2 doesn't
 * charge for downloads), under "<couple_id>/video/<message id>.enc". They're
 * always encrypted on the device, and the chat-video function signs the
 * links, so the R2 keys never ship in the apps.
 */

/**
 * How a video is kept. Like WhatsApp, a video is re-encoded to an efficient
 * bitrate rather than sent as the camera's file (which runs at 15-20 Mbps for
 * 1080p): HD looks the same as the original at a fraction of its size.
 *
 *   standard  chat, the default: 720p at about 1.6 Mbps
 *   hd        chat, when asked for: 1080p at about 4.5 Mbps
 *   memory    kept in Memories: 1080p at about 8 Mbps, close to the original
 *
 * A clip already at or under its profile's bitrate and size is kept as it is.
 * All H.264 + AAC, so every browser and phone plays it.
 */
export type VideoQuality = 'standard' | 'hd' | 'memory';

export const VIDEO_PROFILES: Record<VideoQuality, { maxBytes: number; shortSide: number; videoBitrate: number }> = {
  standard: { maxBytes: 25 * 1024 * 1024, shortSide: 720, videoBitrate: 1_600_000 },
  hd: { maxBytes: 40 * 1024 * 1024, shortSide: 1080, videoBitrate: 4_500_000 },
  memory: { maxBytes: 100 * 1024 * 1024, shortSide: 1080, videoBitrate: 8_000_000 },
};

/** Largest chat video we send, after any compression (it's encrypted in memory): HD's limit. */
export const VIDEO_MAX_BYTES = VIDEO_PROFILES.hd.maxBytes;
/** Largest video kept in Memories. */
export const MEMORY_VIDEO_MAX_BYTES = VIDEO_PROFILES.memory.maxBytes;
/** Longest video the pickers offer. */
export const VIDEO_MAX_MS = 60_000;

/** Where the link lifetime comes from: the function signs downloads for 6 hours. */
const DOWNLOAD_S = 6 * 3600;
const STORE = 'r2:video';

export const isVideoPath = (path: string | null | undefined): path is string => !!path && /^[^/]+\/video\/[^/]+\.enc$/.test(path);

/** How a video is made smaller (see videoPlan). */
export const VIDEO_TARGET = {
  /** Kept below the limit, for the container and the encoder overshooting. */
  fill: 0.88,
  /** Budgeted generously: the phone may keep the original sound as it is. */
  audioBitrate: 192_000,
  /** A clip within this much of its profile's bitrate is already efficient: kept as it is. */
  slack: 1.2,
  /** Below these a picture breaks up at that size, so it drops a step. */
  fullHdFloor: 3_000_000,
  hdFloor: 1_200_000,
  /** Below this it's too blurry to be worth sending. */
  minVideoBitrate: 400_000,
} as const;

export type VideoPlan = { action: 'send' } | { action: 'compress'; videoBitrate: number; audioBitrate: number; maxHeight: number } | { action: 'too_large' };

/**
 * What to do with a video of this size and length for `quality`: keep it
 * when it's already efficient and small enough, otherwise re-encode it at
 * the profile's bitrate (lower, if the clip is long, to stay under the
 * size limit). `shortSide` is the picture's smaller side, if known.
 */
export function videoPlan(sizeBytes: number, durationMs: number, quality: VideoQuality = 'standard', shortSide?: number): VideoPlan {
  const p = VIDEO_PROFILES[quality];
  const seconds = Math.max(1, durationMs / 1000);
  const sourceBitrate = sizeBytes > 0 ? (sizeBytes * 8) / seconds : Infinity;
  const efficient = sourceBitrate <= (p.videoBitrate + VIDEO_TARGET.audioBitrate) * VIDEO_TARGET.slack;
  if (sizeBytes > 0 && sizeBytes <= p.maxBytes && efficient && !(shortSide && shortSide > p.shortSide)) return { action: 'send' };
  const budget = Math.floor((p.maxBytes * VIDEO_TARGET.fill * 8) / seconds - VIDEO_TARGET.audioBitrate);
  const videoBitrate = Math.min(p.videoBitrate, budget);
  if (videoBitrate < VIDEO_TARGET.minVideoBitrate) return { action: 'too_large' };
  const step = videoBitrate >= VIDEO_TARGET.fullHdFloor ? 1080 : videoBitrate >= VIDEO_TARGET.hdFloor ? 720 : 480;
  return { action: 'compress', videoBitrate, audioBitrate: VIDEO_TARGET.audioBitrate, maxHeight: Math.min(p.shortSide, step) };
}

/** About how big the video will be once sent, for the quality chooser. */
export function estimateVideoBytes(sizeBytes: number, durationMs: number, quality: VideoQuality, shortSide?: number): number | null {
  const plan = videoPlan(sizeBytes, durationMs, quality, shortSide);
  if (plan.action === 'send') return sizeBytes || null;
  if (plan.action === 'too_large') return null;
  return Math.round(((plan.videoBitrate + plan.audioBitrate) * Math.max(1, durationMs / 1000)) / 8);
}

/** "12 MB", "850 KB". */
export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * A still from the video, shown before it plays. It rides inside the
 * encrypted message as a small JPEG data URL, so it's kept well under the
 * ciphertext's size limit.
 */
export const POSTER_MAX_CHARS = 12_000;

/** The poster in a video's details, if it's one we'd show. */
export function videoPoster(meta: Record<string, unknown> | null | undefined): string | null {
  const p = meta?.poster;
  return typeof p === 'string' && p.startsWith('data:image/jpeg;base64,') && p.length <= POSTER_MAX_CHARS ? p : null;
}

export class VideoTooBigError extends Error {
  /** `compressed`: it was made smaller and still didn't fit. */
  constructor(compressed = false, maxBytes = VIDEO_MAX_BYTES) {
    super(
      compressed
        ? 'This video is too large to send, even after making it smaller. Try a shorter clip.'
        : `This video is too large to send (max ${maxBytes / 1024 / 1024} MB). Try a shorter clip.`,
    );
  }
}

export class VideoTooLongError extends Error {
  constructor() {
    super(`Videos can be up to ${VIDEO_MAX_MS / 60_000 === 1 ? 'a minute' : `${VIDEO_MAX_MS / 60_000} minutes`} long.`);
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

/** After "delete for everyone": the message's video goes too. */
export async function removeChatVideo(sb: UsClient, messageId: string): Promise<void> {
  await invoke(sb, { action: 'remove', messageId });
}

/** Unpairing: delete our videos (best effort; R2 only holds ciphertext). */
export async function removeCoupleVideos(sb: UsClient): Promise<void> {
  await invoke(sb, { action: 'clear' }).catch(() => {});
}

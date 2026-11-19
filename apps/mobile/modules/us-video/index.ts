import { VIDEO_PROFILES, VideoTooBigError, videoPlan, type VideoQuality } from '@us/shared';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

interface Compressed {
  uri: string;
  size: number;
  width: number;
  height: number;
  durationMs: number;
}

interface UsVideoNative {
  compress(uri: string, maxHeight: number, videoBitrate: number): Promise<Compressed>;
  addListener(event: 'onProgress', fn: (e: { progress: number }) => void): EventSubscription;
}

/** Android only, and only in app builds that include it; absent elsewhere. */
const native = requireOptionalNativeModule<UsVideoNative>('UsVideo');

/** Whether this app build can make a video smaller. */
export const canCompress = !!native;

export interface FitVideo {
  uri: string;
  width?: number;
  height?: number;
  durationMs: number;
}

/**
 * The video as it's kept at `quality` (see VIDEO_PROFILES): unchanged when
 * it's already efficient and small enough, otherwise re-encoded on the phone.
 * Throws VideoTooBigError when it can't be brought under the limit. Without
 * the encoder (an older build), a file that fits is sent as it is.
 */
export async function fitVideo(video: FitVideo, sizeBytes: number, quality: VideoQuality = 'standard', onProgress?: (p: number) => void): Promise<FitVideo> {
  const limit = VIDEO_PROFILES[quality].maxBytes;
  const short = video.width && video.height ? Math.min(video.width, video.height) : undefined;
  const plan = videoPlan(sizeBytes, video.durationMs, quality, short);
  if (plan.action === 'send') return video;
  if (!native && sizeBytes > 0 && sizeBytes <= limit) return video;
  if (plan.action === 'too_large' || !native) throw new VideoTooBigError(false, limit);
  const sub = onProgress ? native.addListener('onProgress', (e) => onProgress(e.progress)) : null;
  try {
    const out = await native.compress(video.uri, plan.maxHeight, plan.videoBitrate);
    if (out.size > limit) throw new VideoTooBigError(true, limit);
    return { uri: out.uri, width: out.width || video.width, height: out.height || video.height, durationMs: out.durationMs || video.durationMs };
  } finally {
    sub?.remove();
  }
}

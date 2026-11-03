import { VIDEO_MAX_BYTES, VideoTooBigError, videoPlan } from '@us/shared';
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
 * The video as it can be sent: unchanged when it already fits under
 * VIDEO_MAX_BYTES, otherwise re-encoded smaller on the phone. Throws
 * VideoTooBigError when it can't be brought under the limit.
 */
export async function fitVideo(video: FitVideo, sizeBytes: number, onProgress?: (p: number) => void): Promise<FitVideo> {
  const plan = videoPlan(sizeBytes, video.durationMs);
  if (plan.action === 'send') return video;
  if (plan.action === 'too_large' || !native) throw new VideoTooBigError();
  const sub = onProgress ? native.addListener('onProgress', (e) => onProgress(e.progress)) : null;
  try {
    const out = await native.compress(video.uri, plan.maxHeight, plan.videoBitrate);
    if (out.size > VIDEO_MAX_BYTES) throw new VideoTooBigError(true);
    return { uri: out.uri, width: out.width || video.width, height: out.height || video.height, durationMs: out.durationMs || video.durationMs };
  } finally {
    sub?.remove();
  }
}

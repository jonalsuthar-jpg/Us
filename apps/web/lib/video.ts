'use client';

import { POSTER_MAX_CHARS } from '@us/shared';

/** A small still from early in the clip, as a JPEG data URL, or null if this browser can't make one. */
export function posterFrom(video: HTMLVideoElement): Promise<string | null> {
  return new Promise((resolve) => {
    const done = (v: string | null) => {
      video.onseeked = null;
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 3000);
    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const w = 240;
        const h = Math.max(1, Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * w));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
        for (const q of [0.6, 0.45, 0.3]) {
          const url = canvas.toDataURL('image/jpeg', q);
          if (url.length <= POSTER_MAX_CHARS) return done(url);
        }
        done(null);
      } catch {
        done(null);
      }
    };
    video.currentTime = Math.min(0.3, (video.duration || 1) / 2);
  });
}

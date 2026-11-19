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

/**
 * A sharp still from early in a video (a picked file or a signed link), as a
 * JPEG: the card picture for a memory that has only a video. Null if this
 * browser can't make one.
 */
export function videoStill(src: File | string, maxWidth = 720): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const v = document.createElement('video');
    // A signed link is on the media host: ask for it with CORS so the canvas can be read.
    if (typeof src === 'string') v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const done = (b: Blob | null) => {
      clearTimeout(timer);
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      resolve(b);
    };
    const timer = setTimeout(() => done(null), 10_000);
    v.onerror = () => done(null);
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    };
    v.onseeked = () => {
      try {
        const w = Math.min(maxWidth, v.videoWidth || maxWidth);
        const h = Math.max(1, Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * w));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(v, 0, 0, w, h);
        canvas.toBlob((b) => done(b), 'image/jpeg', 0.82);
      } catch {
        done(null);
      }
    };
    v.src = url;
  });
}

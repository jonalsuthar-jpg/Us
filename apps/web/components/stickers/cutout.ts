'use client';

import type { InteractiveSegmenterLegacy } from '@mediapipe/tasks-vision';
import { STICKER_SIZE } from '@us/shared';

/**
 * Sticker cut-out in the browser: tap the subject and MediaPipe's Interactive
 * Segmenter (Magic Touch, Apache-2.0) lifts it out. The model (~6 MB) and the
 * WebAssembly runtime download the first time someone makes a sticker.
 */
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
const MAX_SIDE = 1024;

let segmenter: Promise<InteractiveSegmenterLegacy> | null = null;

function getSegmenter() {
  segmenter ??= (async () => {
    const { FilesetResolver, InteractiveSegmenterLegacy } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    return InteractiveSegmenterLegacy.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL },
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  })().catch((e) => {
    segmenter = null;
    throw e;
  });
  return segmenter;
}

/** Start downloading the model early (when the maker opens). */
export function warmCutout() {
  void getSegmenter().catch(() => {});
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t open that photo'));
    img.src = src;
  });
}

/** The photo on a canvas, long side at most MAX_SIDE. */
function photoCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Trim a transparent canvas to what's visible, fit it in a square with a white outline. */
export function composeSticker(subject: HTMLCanvasElement, outline: number, size = STICKER_SIZE): HTMLCanvasElement | null {
  const ctx = subject.getContext('2d')!;
  const { width: w, height: h } = subject;
  const px = ctx.getImageData(0, 0, w, h).data;
  let left = w;
  let top = h;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! > 24) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < left) return null;
  const cw = right - left + 1;
  const ch = bottom - top + 1;
  const margin = outline + 6;
  const scale = Math.min((size - margin * 2) / cw, (size - margin * 2) / ch);
  const dw = cw * scale;
  const dh = ch * scale;
  const dx = (size - dw) / 2;
  const dy = (size - dh) / 2;

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const o = out.getContext('2d')!;
  if (outline > 0) {
    // The outline: the subject's silhouette in white, stamped in a ring around it.
    const white = document.createElement('canvas');
    white.width = cw;
    white.height = ch;
    const wc = white.getContext('2d')!;
    wc.drawImage(subject, left, top, cw, ch, 0, 0, cw, ch);
    wc.globalCompositeOperation = 'source-in';
    wc.fillStyle = '#FFFFFF';
    wc.fillRect(0, 0, cw, ch);
    for (const r of [outline / 2, outline]) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        o.drawImage(white, dx + Math.cos(a) * r, dy + Math.sin(a) * r, dw, dh);
      }
    }
  }
  o.drawImage(subject, left, top, cw, ch, dx, dy, dw, dh);
  return out;
}

/**
 * Lift out whatever is at (x, y) — shares of the photo's width and height —
 * as a transparent canvas the photo's size. Null when nothing was found there.
 */
export async function liftSubject(img: HTMLImageElement, x: number, y: number): Promise<HTMLCanvasElement | null> {
  const seg = await getSegmenter();
  const photo = photoCanvas(img);
  const mask = await new Promise<Float32Array | null>((resolve) => {
    seg.segment(photo, { keypoint: { x, y } }, (result) => {
      const m = result.confidenceMasks?.[0];
      const data = m ? m.getAsFloat32Array().slice() : null;
      result.confidenceMasks?.forEach((c) => c.close());
      resolve(data && m && m.width === photo.width && m.height === photo.height ? data : data ? resize(data, m!.width, m!.height, photo.width, photo.height) : null);
    });
  });
  if (!mask) return null;
  const ctx = photo.getContext('2d')!;
  const img2 = ctx.getImageData(0, 0, photo.width, photo.height);
  let kept = 0;
  for (let i = 0; i < mask.length; i++) {
    // Soft edge between 0.35 and 0.65 confidence.
    const a = Math.max(0, Math.min(1, (mask[i]! - 0.35) / 0.3));
    img2.data[i * 4 + 3] = Math.round(img2.data[i * 4 + 3]! * a);
    if (a > 0.5) kept++;
  }
  if (kept < mask.length * 0.005) return null;
  ctx.putImageData(img2, 0, 0);
  return photo;
}

/** Nearest-neighbour resize of a mask to the photo's size. */
function resize(m: Float32Array, mw: number, mh: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(mh - 1, Math.floor((y * mh) / h));
    for (let x = 0; x < w; x++) out[y * w + x] = m[sy * mw + Math.min(mw - 1, Math.floor((x * mw) / w))]!;
  }
  return out;
}

/** The whole photo, cropped to the middle square. */
export function squarePhoto(img: HTMLImageElement, size = STICKER_SIZE): HTMLCanvasElement {
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  return c;
}

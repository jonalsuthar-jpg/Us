import { BOARD_H, BOARD_W, EXPORT_H, EXPORT_W, PAGE_INK, PAGE_LINE, pageById, strokeLook, type DrawBackground, type Stroke } from '@us/shared';

/**
 * Drawing on an HTML canvas, by the shared rules (strokeLook): the same path
 * strings the phone draws with react-native-svg. Ink goes on its own layer so
 * the eraser cuts ink only, never the photo or the colouring page.
 */

const paths = new Map<string, { len: number; path: Path2D }>();

function pathOf(s: Stroke, d: string): Path2D {
  const key = s.id;
  const hit = paths.get(key);
  if (hit && hit.len === s.p.length) return hit.path;
  const path = new Path2D(d);
  if (!s.live) paths.set(key, { len: s.p.length, path });
  if (paths.size > 4000) paths.clear();
  return path;
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const look = strokeLook(s);
  if (!look.d) return;
  const path = s.live ? new Path2D(look.d) : pathOf(s, look.d);
  ctx.globalCompositeOperation = look.erase ? 'destination-out' : 'source-over';
  ctx.globalAlpha = look.alpha;
  if (look.fill) {
    ctx.fillStyle = look.color;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = look.erase ? '#000' : look.color;
    ctx.lineWidth = look.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Board units onto a canvas of this pixel size. */
export function boardTransform(ctx: CanvasRenderingContext2D, width: number) {
  const k = width / BOARD_W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

export function drawInk(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number) {
  boardTransform(ctx, width);
  for (const s of strokes) drawStroke(ctx, s);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function drawPageLines(ctx: CanvasRenderingContext2D, bg: DrawBackground | null | undefined, width: number) {
  if (bg?.kind !== 'page') return;
  const page = pageById(bg.id);
  if (!page) return;
  boardTransform(ctx, width);
  ctx.strokeStyle = PAGE_INK;
  ctx.lineWidth = PAGE_LINE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of page.paths) ctx.stroke(new Path2D(d));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** A photo filling the board (cropped to 3:4, centred). */
export function drawPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement | ImageBitmap | null, width: number, height: number) {
  if (!img) return;
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!iw || !ih) return;
  const scale = Math.max(width / iw, height / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t load the picture'));
    img.src = url;
  });
}

/** The whole picture, composed: paper, photo, ink, colouring-page lines. */
export function compose(
  out: CanvasRenderingContext2D,
  ink: HTMLCanvasElement,
  strokes: Stroke[],
  bg: DrawBackground | null | undefined,
  photo: HTMLImageElement | null,
) {
  const { width, height } = out.canvas;
  const ictx = ink.getContext('2d')!;
  if (ink.width !== width || ink.height !== height) {
    ink.width = width;
    ink.height = height;
  }
  ictx.clearRect(0, 0, width, height);
  drawInk(ictx, strokes, width);
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.fillStyle = '#FFFFFF';
  out.fillRect(0, 0, width, height);
  if (bg?.kind === 'photo') drawPhoto(out, photo, width, height);
  out.drawImage(ink, 0, 0);
  drawPageLines(out, bg, width);
}

/** The saved picture: always EXPORT_W × EXPORT_H, whichever screen it was drawn on. */
export async function renderPng(strokes: Stroke[], bg: DrawBackground | null | undefined, photo: HTMLImageElement | null = null): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W;
  canvas.height = EXPORT_H;
  const ink = document.createElement('canvas');
  compose(canvas.getContext('2d')!, ink, strokes, bg, photo);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t make the picture'))), 'image/png'));
}

export const BOARD_RATIO = BOARD_W / BOARD_H;

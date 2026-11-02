export interface VideoSize {
  width: number;
  height: number;
}

// Close enough to square that filling the box only crops a little.
const NEAR_SQUARE = 1.1;
const DEFAULT_SELF_ASPECT = 3 / 4;
const MIN_SELF_ASPECT = 9 / 16;
const MAX_SELF_ASPECT = 16 / 9;

function shapeOf({ width, height }: VideoSize): 'wide' | 'tall' | 'square' {
  const ratio = width / height;
  if (ratio > NEAR_SQUARE) return 'wide';
  if (ratio < 1 / NEAR_SQUARE) return 'tall';
  return 'square';
}

const known = (size: VideoSize | null | undefined): size is VideoSize => !!size && size.width > 0 && size.height > 0;

/**
 * How a camera sits in its box: filling it when they're the same shape, and
 * whole, with bands, when a wide picture meets a tall box or the reverse.
 */
export function videoFit(video: VideoSize | null | undefined, box: VideoSize | null | undefined): 'cover' | 'contain' {
  if (!known(video) || !known(box)) return 'cover';
  const a = shapeOf(video);
  const b = shapeOf(box);
  return a === 'square' || b === 'square' || a === b ? 'cover' : 'contain';
}

/** True when the picture is clearly wider than it is tall. */
export function isWideVideo(video: VideoSize | null | undefined): boolean {
  return known(video) && shapeOf(video) === 'wide';
}

/** The self view's width over height: the picture's own, within sensible limits. */
export function selfViewAspect(video: VideoSize | null | undefined): number {
  if (!known(video)) return DEFAULT_SELF_ASPECT;
  return Math.min(MAX_SELF_ASPECT, Math.max(MIN_SELF_ASPECT, video.width / video.height));
}

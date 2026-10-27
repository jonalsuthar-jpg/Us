/**
 * The paint bucket. Tap inside a shape and it fills up to the lines; tap
 * empty space and the background fills. Worked out once, by whoever taps, on
 * a coarse grid over the board; the result travels as an SVG path, so both
 * apps draw exactly the same shape.
 *
 * Fills sit underneath the lines (see fillsAndInk), and each fill spreads one
 * cell under the lines around it, so there's never a white gap.
 */
import { BOARD_H, BOARD_W, calligraphyWidths, type Stroke } from './strokes';
import { simplifyIndexes } from './strokes';

/** One grid cell, in board units. */
export const FILL_CELL = 8;
const GW = BOARD_W / FILL_CELL;
const GH = BOARD_H / FILL_CELL;
/** Longest fill path we'll send. */
export const FILL_MAX_CHARS = 48_000;

/** Lines as walls: every cell within a stroke's radius of its centre line. */
function walls(strokes: Stroke[]): Uint8Array {
  const g = new Uint8Array(GW * GH);
  for (const s of strokes) {
    if (s.tool === 'fill' || s.p.length < 2) continue;
    const value = s.tool === 'eraser' ? 0 : 1;
    const widths = s.tool === 'calligraphy' && s.p.length >= 4 ? calligraphyWidths(s.p, s.w) : s.ws && s.ws.length === s.p.length / 2 ? s.ws : null;
    const n = s.p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = Math.min(n - 1, i + 1);
      const ax = s.p[i * 2]! / FILL_CELL;
      const ay = s.p[i * 2 + 1]! / FILL_CELL;
      const bx = s.p[j * 2]! / FILL_CELL;
      const by = s.p[j * 2 + 1]! / FILL_CELL;
      const r = Math.max(0.6, ((widths ? Math.max(widths[i]!, widths[j]!) : s.w) / 2) / FILL_CELL);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
      const x1 = Math.min(GW - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
      const y1 = Math.min(GH - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          let t = len ? ((cx - ax) * dx + (cy - ay) * dy) / len : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + t * dx - cx;
          const ey = ay + t * dy - cy;
          if (ex * ex + ey * ey <= r * r) g[y * GW + x] = value;
        }
      }
    }
  }
  return g;
}

/** Every open cell reachable from the seed (4-way). */
function flood(g: Uint8Array, sx: number, sy: number): Uint8Array | null {
  let seed = -1;
  // Tapped right on a line: use the nearest open cell close by.
  for (let r = 0; r <= 3 && seed < 0; r++) {
    for (let y = sy - r; y <= sy + r && seed < 0; y++) {
      for (let x = sx - r; x <= sx + r; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if (!g[y * GW + x]) {
          seed = y * GW + x;
          break;
        }
      }
    }
  }
  if (seed < 0) return null;
  const inside = new Uint8Array(GW * GH);
  const stack = new Int32Array(GW * GH);
  let top = 0;
  stack[top++] = seed;
  inside[seed] = 1;
  while (top) {
    const c = stack[--top]!;
    const x = c % GW;
    const y = (c - x) / GW;
    if (x > 0 && !inside[c - 1] && !g[c - 1]) (inside[c - 1] = 1), (stack[top++] = c - 1);
    if (x < GW - 1 && !inside[c + 1] && !g[c + 1]) (inside[c + 1] = 1), (stack[top++] = c + 1);
    if (y > 0 && !inside[c - GW] && !g[c - GW]) (inside[c - GW] = 1), (stack[top++] = c - GW);
    if (y < GH - 1 && !inside[c + GW] && !g[c + GW]) (inside[c + GW] = 1), (stack[top++] = c + GW);
  }
  return inside;
}

/** Spread one cell outwards, under the lines. */
function grow(m: Uint8Array): Uint8Array {
  const out = m.slice();
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const c = y * GW + x;
      if (m[c]) continue;
      if ((x > 0 && m[c - 1]) || (x < GW - 1 && m[c + 1]) || (y > 0 && m[c - GW]) || (y < GH - 1 && m[c + GW])) out[c] = 1;
    }
  }
  return out;
}

/**
 * The region's outline as closed loops of grid corners. Every boundary edge
 * is used once, so with the even-odd rule the loops fill exactly the region,
 * holes included.
 */
function outline(m: Uint8Array): number[][] {
  const VW = GW + 1;
  const next = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const list = next.get(a);
    if (list) list.push(b);
    else next.set(a, [b]);
  };
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH && m[y * GW + x] === 1;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(y * VW + x, y * VW + x + 1);
      if (!on(x + 1, y)) add(y * VW + x + 1, (y + 1) * VW + x + 1);
      if (!on(x, y + 1)) add((y + 1) * VW + x + 1, (y + 1) * VW + x);
      if (!on(x - 1, y)) add((y + 1) * VW + x, y * VW + x);
    }
  }
  const loops: number[][] = [];
  for (const start of [...next.keys()]) {
    while (next.get(start)?.length) {
      const loop: number[] = [];
      let v = start;
      do {
        loop.push(v % VW, Math.floor(v / VW));
        const list = next.get(v)!;
        const to = list.pop()!;
        if (!list.length) next.delete(v);
        v = to;
      } while (v !== start && next.has(v));
      if (loop.length >= 6) loops.push(loop);
    }
  }
  return loops;
}

function loopPath(loop: number[], epsilon: number): string {
  // Close it, simplify (the stair-steps become slopes), drop the repeat.
  const closed = [...loop, loop[0]!, loop[1]!];
  const keep = simplifyIndexes(closed, epsilon);
  const pts = keep.slice(0, -1).flatMap((i) => [closed[i * 2]! * FILL_CELL, closed[i * 2 + 1]! * FILL_CELL]);
  if (pts.length < 6) return '';
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
  return d + 'Z';
}

/**
 * The region a tap at (x, y) fills, given the strokes drawn so far, as an
 * even-odd SVG path in board units. Null if the tap lands where nothing can fill.
 */
export function fillRegion(strokes: Stroke[], x: number, y: number): string | null {
  const g = walls(strokes);
  const sx = Math.max(0, Math.min(GW - 1, Math.floor(x / FILL_CELL)));
  const sy = Math.max(0, Math.min(GH - 1, Math.floor(y / FILL_CELL)));
  const region = flood(g, sx, sy);
  if (!region) return null;
  const loops = outline(grow(region));
  for (const epsilon of [0.75, 1.5, 3]) {
    const d = loops.map((l) => loopPath(l, epsilon)).join('');
    if (d && d.length <= FILL_MAX_CHARS) return d;
  }
  // Too detailed even when simplified: keep the biggest loops that fit.
  const parts = loops.map((l) => loopPath(l, 3)).sort((a, b) => b.length - a.length);
  let d = '';
  for (const part of parts) if (d.length + part.length <= FILL_MAX_CHARS) d += part;
  return d || null;
}

/** Fills go underneath the lines; everything else keeps its order. */
export function fillsAndInk<T extends Pick<Stroke, 'tool'>>(strokes: T[]): { fills: T[]; ink: T[] } {
  const fills: T[] = [];
  const ink: T[] = [];
  for (const s of strokes) (s.tool === 'fill' ? fills : ink).push(s);
  return { fills, ink };
}

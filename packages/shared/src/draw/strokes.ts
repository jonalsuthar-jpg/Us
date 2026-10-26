/**
 * The stroke model shared by web and mobile, so a drawing looks the same on
 * every screen.
 *
 *  - One board: a fixed 3000 × 4000 space (3:4). Points are whole numbers in
 *    that space, never screen pixels; each app scales the board to fit.
 *  - Widths are in the same units, so a line is as bold on a phone as on a
 *    monitor.
 *  - Colours travel as an index into DRAW_COLORS.
 *  - Both apps draw the same SVG path strings: the web with Path2D, the phone
 *    with react-native-svg.
 */

export const DRAW_FORMAT = 1;
export const BOARD_W = 3000;
export const BOARD_H = 4000;
/** Saved PNGs are always this size, whichever device saves them. */
export const EXPORT_W = 1200;
export const EXPORT_H = 1600;

export type DrawTool = 'pen' | 'marker' | 'eraser';

export const DRAW_COLORS = [
  { hex: '#15121A', name: 'Ink' },
  { hex: '#F5547C', name: 'Rose' },
  { hex: '#F3A823', name: 'Gold' },
  { hex: '#F07A2B', name: 'Orange' },
  { hex: '#37AC5F', name: 'Green' },
  { hex: '#0C8F82', name: 'Teal' },
  { hex: '#2F6FDB', name: 'Blue' },
  { hex: '#634882', name: 'Plum' },
] as const;

export const DRAW_SIZES = [
  { id: 's', name: 'Thin', w: 24 },
  { id: 'm', name: 'Medium', w: 50 },
  { id: 'l', name: 'Thick', w: 110 },
] as const;
export type DrawSize = (typeof DRAW_SIZES)[number]['id'];

/** A marker is wider and see-through; an eraser is wider still. */
const TOOL_WIDTH: Record<DrawTool, number> = { pen: 1, marker: 2.4, eraser: 3 };
export const MARKER_ALPHA = 0.45;

export interface Stroke {
  id: string;
  /** Who drew it (user id). */
  by: string;
  tool: DrawTool;
  /** Index into DRAW_COLORS. */
  c: number;
  /** Width in board units. */
  w: number;
  /** Flat [x0, y0, x1, y1, …] in board units. */
  p: number[];
  /** Per-point widths from a pressure-sensitive pen, if any. */
  ws?: number[];
  /** Ordering number: both sides sort by (n, by, id), so the layers agree. */
  n: number;
  /** When it started and how long it took (ms), for replay. */
  t0: number;
  d: number;
  /** Still being drawn. */
  live?: boolean;
}

/** Line width for a tool at a size: a preset ('s' | 'm' | 'l') or a width in board units. */
export function strokeWidth(tool: DrawTool, size: DrawSize | number): number {
  const base = typeof size === 'number' ? size : (DRAW_SIZES.find((s) => s.id === size)?.w ?? DRAW_SIZES[1].w);
  return Math.max(2, Math.round(base * TOOL_WIDTH[tool]));
}

/** Brush sizes the web slider allows, in board units. */
export const BRUSH_MIN = 10;
export const BRUSH_MAX = 160;

export function colorOf(c: number): string {
  return DRAW_COLORS[c]?.hex ?? DRAW_COLORS[0].hex;
}

export const clampX = (x: number) => Math.max(0, Math.min(BOARD_W, Math.round(x)));
export const clampY = (y: number) => Math.max(0, Math.min(BOARD_H, Math.round(y)));

/** Board coordinates from a point inside a box of `width` × `height` on screen. */
export function toBoard(x: number, y: number, width: number, height: number): [number, number] {
  return [clampX((x / width) * BOARD_W), clampY((y / height) * BOARD_H)];
}

/** Skip points too close to the last one; keeps live messages small. */
export function shouldAdd(p: number[], x: number, y: number, minDist = 6): boolean {
  const n = p.length;
  if (n < 2) return true;
  const dx = x - p[n - 2]!;
  const dy = y - p[n - 1]!;
  return dx * dx + dy * dy >= minDist * minDist;
}

// ------------------------------------------------------------ simplify ---

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return x * x + y * y;
}

/**
 * Ramer–Douglas–Peucker on a flat point list. Returns the kept indexes, so
 * per-point widths can be thinned the same way.
 */
export function simplifyIndexes(p: number[], epsilon = 2): number[] {
  const count = p.length / 2;
  if (count <= 2) return [...Array(count).keys()];
  const keep = new Uint8Array(count);
  keep[0] = keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  const eps2 = epsilon * epsilon;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let max = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(p[i * 2]!, p[i * 2 + 1]!, p[a * 2]!, p[a * 2 + 1]!, p[b * 2]!, p[b * 2 + 1]!);
      if (d > max) {
        max = d;
        at = i;
      }
    }
    if (at >= 0 && max > eps2) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(i);
  return out;
}

export function simplifyStroke<T extends Pick<Stroke, 'p' | 'ws'>>(s: T, epsilon = 2): T {
  const idx = simplifyIndexes(s.p, epsilon);
  if (idx.length === s.p.length / 2) return s;
  return {
    ...s,
    p: idx.flatMap((i) => [s.p[i * 2]!, s.p[i * 2 + 1]!]),
    ...(s.ws ? { ws: idx.map((i) => s.ws![i]!) } : {}),
  };
}

// --------------------------------------------------------------- paths ---

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A dot: a full circle as a path (fill it). */
function circlePath(x: number, y: number, r: number) {
  return `M${r1(x - r)} ${r1(y)}A${r1(r)} ${r1(r)} 0 1 0 ${r1(x + r)} ${r1(y)}A${r1(r)} ${r1(r)} 0 1 0 ${r1(x - r)} ${r1(y)}Z`;
}

/**
 * The smoothed centre line through the points (stroke it with round caps and
 * joins). Quadratic curves through the midpoints, so corners come out soft.
 */
export function centerPath(p: number[]): string {
  const n = p.length / 2;
  if (n === 0) return '';
  if (n === 1) return `M${p[0]} ${p[1]}L${r1(p[0]! + 0.1)} ${p[1]}`;
  if (n === 2) return `M${p[0]} ${p[1]}L${p[2]} ${p[3]}`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2]!;
    const y = p[i * 2 + 1]!;
    const mx = (x + p[i * 2 + 2]!) / 2;
    const my = (y + p[i * 2 + 3]!) / 2;
    d += `Q${x} ${y} ${r1(mx)} ${r1(my)}`;
  }
  d += `L${p[n * 2 - 2]} ${p[n * 2 - 1]}`;
  return d;
}

/**
 * The outline of a line whose width changes from point to point (a pressure
 * pen). Fill it. Left edge forward, a round cap, the right edge back, a round
 * cap home.
 */
export function outlinePath(p: number[], ws: number[]): string {
  const n = p.length / 2;
  if (n === 0) return '';
  if (n === 1) return circlePath(p[0]!, p[1]!, Math.max(0.5, ws[0]! / 2));
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = p[b * 2]! - p[a * 2]!;
    let dy = p[b * 2 + 1]! - p[a * 2 + 1]!;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const r = Math.max(0.5, (ws[i] ?? ws[ws.length - 1] ?? 1) / 2);
    const x = p[i * 2]!;
    const y = p[i * 2 + 1]!;
    left.push([x - dy * r, y + dx * r]);
    right.push([x + dy * r, y - dx * r]);
  }
  const side = (pts: [number, number][]) => {
    let d = '';
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]!;
      const [nx, ny] = pts[i + 1]!;
      d += `Q${r1(x)} ${r1(y)} ${r1((x + nx) / 2)} ${r1((y + ny) / 2)}`;
    }
    const last = pts[pts.length - 1]!;
    return d + `L${r1(last[0])} ${r1(last[1])}`;
  };
  const rEnd = Math.max(0.5, (ws[n - 1] ?? 1) / 2);
  const rStart = Math.max(0.5, (ws[0] ?? 1) / 2);
  const back = [...right].reverse();
  return (
    `M${r1(left[0]![0])} ${r1(left[0]![1])}` +
    side(left) +
    `A${r1(rEnd)} ${r1(rEnd)} 0 0 0 ${r1(back[0]![0])} ${r1(back[0]![1])}` +
    side(back) +
    `A${r1(rStart)} ${r1(rStart)} 0 0 0 ${r1(left[0]![0])} ${r1(left[0]![1])}Z`
  );
}

export interface StrokeLook {
  /** The SVG path string, in board units. */
  d: string;
  /** Fill the path (pressure outline) instead of stroking it. */
  fill: boolean;
  color: string;
  alpha: number;
  width: number;
  /** An eraser cuts ink away rather than painting. */
  erase: boolean;
}

/** How to draw a stroke. Both apps follow this to the letter. */
export function strokeLook(s: Pick<Stroke, 'tool' | 'c' | 'w' | 'p' | 'ws'>): StrokeLook {
  const pressure = !!s.ws && s.ws.length === s.p.length / 2 && s.tool !== 'eraser';
  return {
    d: pressure ? outlinePath(s.p, s.ws!) : centerPath(s.p),
    fill: pressure,
    color: colorOf(s.c),
    alpha: s.tool === 'marker' ? MARKER_ALPHA : 1,
    width: s.w,
    erase: s.tool === 'eraser',
  };
}

/** Pressure (0–1) to a width around the chosen size. */
export function pressureWidth(base: number, pressure: number): number {
  const p = Math.max(0.05, Math.min(1, pressure || 0.5));
  return Math.max(2, Math.round(base * (0.35 + p * 1.3)));
}

/**
 * Ink grouped for renderers without a cut-out blend (SVG): each eraser applies
 * to everything drawn before it, and nothing after. Layer k = (layer k-1 cut
 * by its erasers) + the ink that follows. Erasers in a row share one cut.
 */
export interface InkLayer {
  below: InkLayer | null;
  /** Erasers applied to `below`. */
  cut: Stroke[];
  ink: Stroke[];
}

export function inkLayers(strokes: Stroke[]): InkLayer {
  let layer: InkLayer = { below: null, cut: [], ink: [] };
  for (const s of strokes) {
    if (s.tool === 'eraser') {
      if (layer.ink.length === 0 && layer.cut.length) layer.cut.push(s);
      else layer = { below: layer, cut: [s], ink: [] };
    } else {
      layer.ink.push(s);
    }
  }
  return layer;
}

// ------------------------------------------------------------- storage ---

export interface DrawingFile {
  v: number;
  w: number;
  h: number;
  /** Background, if any: a colouring page id or a photo path. */
  bg?: DrawBackground | null;
  strokes: Omit<Stroke, 'live'>[];
}

export type DrawBackground = { kind: 'page'; id: string } | { kind: 'photo'; path: string; bucket: 'memories' | 'snaps' | 'drawings' };

/** The file saved with a drawing: strokes in order, simplified, times from 0. */
export function encodeDrawing(strokes: Stroke[], bg?: DrawBackground | null): DrawingFile {
  const done = strokes.filter((s) => s.p.length >= 2);
  const start = done.length ? Math.min(...done.map((s) => s.t0)) : 0;
  return {
    v: DRAW_FORMAT,
    w: BOARD_W,
    h: BOARD_H,
    ...(bg ? { bg } : {}),
    strokes: done.map((s, i) => {
      const { live: _live, ...rest } = simplifyStroke(s, 1.5);
      return { ...rest, n: i + 1, t0: Math.max(0, s.t0 - start), d: Math.max(0, Math.round(s.d)) };
    }),
  };
}

export class DrawingVersionError extends Error {
  constructor() {
    super('This drawing was made by a newer version of Us. Update the app to see it.');
  }
}

export function decodeDrawing(raw: unknown): DrawingFile {
  const f = raw as Partial<DrawingFile> | null;
  if (!f || typeof f !== 'object' || !Array.isArray(f.strokes)) throw new Error('Not a drawing');
  if ((f.v ?? 1) > DRAW_FORMAT) throw new DrawingVersionError();
  const sx = BOARD_W / (f.w || BOARD_W);
  const sy = BOARD_H / (f.h || BOARD_H);
  const strokes = f.strokes
    .filter((s) => s && Array.isArray(s.p) && s.p.length >= 2 && s.p.length % 2 === 0)
    .map((s, i) => ({
      id: String(s.id ?? i),
      by: String(s.by ?? ''),
      tool: (['pen', 'marker', 'eraser'] as const).includes(s.tool) ? s.tool : 'pen',
      c: Number.isInteger(s.c) ? s.c : 0,
      w: Math.max(1, Number(s.w) || 50),
      p: s.p.map((v, j) => Math.round(Number(v) * (j % 2 ? sy : sx))),
      ...(Array.isArray(s.ws) ? { ws: s.ws.map(Number) } : {}),
      n: Number(s.n) || i + 1,
      t0: Number(s.t0) || 0,
      d: Number(s.d) || 0,
    }));
  return { v: DRAW_FORMAT, w: BOARD_W, h: BOARD_H, bg: f.bg ?? null, strokes };
}

// -------------------------------------------------------------- replay ---

/** Total running time of a replay, with long pauses squeezed to `maxGap`. */
export function replayTimeline(strokes: Pick<Stroke, 't0' | 'd'>[], maxGap = 1200): { start: number; end: number }[] {
  let clock = 0;
  let prevEnd = 0;
  return strokes.map((s, i) => {
    const gap = i === 0 ? 0 : Math.max(0, Math.min(maxGap, s.t0 - prevEnd));
    const start = clock + gap;
    const dur = Math.max(80, Math.min(s.d || 300, 8000));
    clock = start + dur;
    prevEnd = s.t0 + (s.d || 0);
    return { start, end: clock };
  });
}

/** The strokes as they stood `ms` into the replay (the stroke in progress cut short). */
export function strokesAt<T extends Pick<Stroke, 'p' | 'ws' | 't0' | 'd'>>(strokes: T[], ms: number, timeline = replayTimeline(strokes)): T[] {
  const out: T[] = [];
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i]!;
    const { start, end } = timeline[i]!;
    if (ms >= end) out.push(s);
    else if (ms > start) {
      const pts = s.p.length / 2;
      const keep = Math.max(1, Math.ceil(((ms - start) / (end - start)) * pts));
      out.push({ ...s, p: s.p.slice(0, keep * 2), ...(s.ws ? { ws: s.ws.slice(0, keep) } : {}) });
      break;
    } else break;
  }
  return out;
}

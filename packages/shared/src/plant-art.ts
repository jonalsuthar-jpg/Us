import type { PlantStageKey, PlantState } from './api/plant';

/**
 * The plant scene as plain shape data, drawn the same way by the web (<svg>)
 * and mobile (react-native-svg) renderers. ViewBox 320 × 200.
 *
 * Layers are separate so renderers can animate them: the plant sways from
 * PLANT_ORIGIN, petals drift, the cans pour. Fills like "grad:leaf" name a
 * gradient in `gradients`; renderers give the ids a per-instance prefix.
 */

export const PLANT_VIEWBOX = { width: 320, height: 200 };
/** Where the stem meets the soil: the plant sways around this point. */
export const PLANT_ORIGIN = { x: 160, y: 127 };

export type ArtShape =
  | { kind: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; opacity?: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number };

export interface ArtGradient {
  id: string;
  type: 'linear' | 'radial';
  /** Linear: x1 y1 x2 y2 in 0–1. Radial: cx cy r in 0–1. */
  coords: number[];
  stops: { offset: number; color: string; opacity?: number }[];
}

export type ArtLayerId = 'sky' | 'ground' | 'pot' | 'plant' | 'petals' | 'canLeft' | 'canRight' | 'drops';

export interface ArtLayer {
  id: ArtLayerId;
  shapes: ArtShape[];
}

export interface PlantScene {
  gradients: ArtGradient[];
  layers: ArtLayer[];
}

// ------------------------------------------------------------- palette ---

const C = {
  plum900: '#170F21',
  plum800: '#241933',
  plum700: '#392751',
  plum600: '#4B3468',
  plum500: '#634882',
  plum300: '#B39ACC',
  rose200: '#FFB8C9',
  rose300: '#FF86A3',
  rose400: '#F5547C',
  rose500: '#E2336A',
  teal300: '#50CBB9',
  teal500: '#0C8F82',
  gold200: '#FFD98A',
  gold300: '#FCC24F',
  gold400: '#F3A823',
  gold800: '#563805',
  sage100: '#D0F2DA',
  sage200: '#A3E2B5',
  sage300: '#69C987',
  sage400: '#37AC5F',
  sage500: '#258F4C',
  sage600: '#1D743E',
  paper: '#FCFAFB',
  water: '#8ED2F2',
};

const SKY: Record<PlantState['daypart'], { top: string; bottom: string; hill: [string, string] }> = {
  morning: { top: '#FFE3D3', bottom: '#FFF7EF', hill: [C.sage200, C.sage300] },
  day: { top: '#D9EEFF', bottom: '#F5FBFF', hill: [C.sage200, C.sage300] },
  evening: { top: '#FFC7B8', bottom: '#FFEAD6', hill: ['#B9D9A8', '#8DC48F'] },
  night: { top: C.plum800, bottom: C.plum600, hill: ['#2E5440', '#22402F'] },
};

// --------------------------------------------------------- tiny geometry ---

type Pt = [number, number];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Rotate (degrees) and optionally mirror around a pivot, then move. */
function tx(at: Pt, deg = 0, scale = 1, flip = false) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return ([x, y]: Pt): Pt => {
    const px = (flip ? -x : x) * scale;
    const py = y * scale;
    return [at[0] + px * cos - py * sin, at[1] + px * sin + py * cos];
  };
}

/** A path builder whose every point goes through a transform. */
function pen(t: (p: Pt) => Pt = (p) => p) {
  const out: string[] = [];
  const p = (...pts: Pt[]) => pts.map((q) => t(q).map(r1).join(' ')).join(' ');
  const b = {
    M: (x: number, y: number) => (out.push(`M${p([x, y])}`), b),
    L: (x: number, y: number) => (out.push(`L${p([x, y])}`), b),
    Q: (x1: number, y1: number, x: number, y: number) => (out.push(`Q${p([x1, y1], [x, y])}`), b),
    C: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => (out.push(`C${p([x1, y1], [x2, y2], [x, y])}`), b),
    Z: () => (out.push('Z'), b),
    d: () => out.join(' '),
  };
  return b;
}

/** Point on a quadratic curve. */
function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

// ------------------------------------------------------------ elements ---

/** A leaf from its base, pointing along `deg`, with a lighter vein. */
function leaf(at: Pt, deg: number, len: number, fill: string, vein: string): ArtShape[] {
  const w = len * 0.42;
  const t = tx(at, deg);
  return [
    { kind: 'path', d: pen(t).M(0, 0).C(len * 0.25, -w, len * 0.72, -w * 0.85, len, 0).C(len * 0.7, w * 0.75, len * 0.28, w * 0.9, 0, 0).Z().d(), fill },
    { kind: 'path', d: pen(t).M(len * 0.06, 0).Q(len * 0.5, -w * 0.12, len * 0.86, 0).d(), stroke: vein, strokeWidth: 0.9, opacity: 0.7 },
  ];
}

/** A five-petal blossom. */
function flower(at: Pt, size: number, petal: string, petalDeep: string, heart = C.gold300, turn = 0): ArtShape[] {
  const shapes: ArtShape[] = [];
  for (let i = 0; i < 5; i++) {
    const t = tx(at, turn + i * 72 - 90);
    const l = size;
    const w = size * 0.62;
    shapes.push({
      kind: 'path',
      d: pen(t).M(0, 0).C(l * 0.2, -w, l * 0.95, -w * 0.9, l, 0).C(l * 0.95, w * 0.9, l * 0.2, w, 0, 0).Z().d(),
      fill: i % 2 ? petalDeep : petal,
    });
  }
  shapes.push({ kind: 'circle', cx: r1(at[0]), cy: r1(at[1]), r: r1(size * 0.32), fill: heart });
  shapes.push({ kind: 'circle', cx: r1(at[0] - size * 0.08), cy: r1(at[1] - size * 0.08), r: r1(size * 0.12), fill: '#FFF4D6', opacity: 0.9 });
  return shapes;
}

/** A closed bud on a short neck, cupped by two sepals. */
function bud(at: Pt, size: number, deg = -90): ArtShape[] {
  const t = tx(at, deg + 90);
  return [
    { kind: 'path', d: pen(t).M(0, 0).C(-size * 0.7, -size * 0.4, -size * 0.5, -size * 1.35, 0, -size * 1.6).C(size * 0.5, -size * 1.35, size * 0.7, -size * 0.4, 0, 0).Z().d(), fill: 'grad:bud' },
    { kind: 'path', d: pen(t).M(0, 0).C(-size * 0.55, -size * 0.1, -size * 0.6, -size * 0.6, -size * 0.35, -size * 0.75).C(-size * 0.2, -size * 0.4, -size * 0.1, -size * 0.2, 0, 0).Z().d(), fill: C.sage500 },
    { kind: 'path', d: pen(t).M(0, 0).C(size * 0.55, -size * 0.1, size * 0.6, -size * 0.6, size * 0.35, -size * 0.75).C(size * 0.2, -size * 0.4, size * 0.1, -size * 0.2, 0, 0).Z().d(), fill: C.sage500 },
  ];
}

/** Four-point sparkle. */
function sparkle(at: Pt, s: number, fill: string, opacity = 1): ArtShape {
  const [x, y] = at;
  return {
    kind: 'path',
    d: pen().M(x, y - s).Q(x + s * 0.18, y - s * 0.18, x + s, y).Q(x + s * 0.18, y + s * 0.18, x, y + s).Q(x - s * 0.18, y + s * 0.18, x - s, y).Q(x - s * 0.18, y - s * 0.18, x, y - s).Z().d(),
    fill,
    opacity,
  };
}

/** A watering can, spout to the right, around its body's centre. */
function can(at: Pt, color: string, deep: string, pouring: boolean, mirror: boolean): ArtShape[] {
  // Tipped forward towards the pot while pouring; resting and faded otherwise.
  const t = tx(at, pouring ? (mirror ? -30 : 30) : 0, 1, mirror);
  const o = pouring ? 1 : 0.55;
  return [
    // spout
    { kind: 'path', d: pen(t).M(9, -2).L(25, -14).L(28, -11.5).L(12, 3.5).Z().d(), fill: deep, opacity: o },
    { kind: 'path', d: pen(t).M(24, -17).L(31, -12).L(29.5, -9.5).L(22.5, -14.5).Z().d(), fill: deep, opacity: o },
    // handle
    { kind: 'path', d: pen(t).M(-11, -6).C(-22, -8, -22, 8, -11, 6).d(), stroke: deep, strokeWidth: 3, opacity: o },
    // body
    { kind: 'path', d: pen(t).M(-12, -10).C(-12, -13, -9, -14, -6, -14).L(6, -14).C(9, -14, 12, -13, 12, -10).L(12, 10).C(12, 13, 9, 14, 6, 14).L(-6, 14).C(-9, 14, -12, 13, -12, 10).Z().d(), fill: color, opacity: o },
    // shine and band
    { kind: 'path', d: pen(t).M(-8, -9).L(-8, 7).d(), stroke: '#FFFFFF', strokeWidth: 2, opacity: 0.45 * o },
    { kind: 'path', d: pen(t).M(-12, -4).L(12, -4).d(), stroke: deep, strokeWidth: 1.4, opacity: 0.5 * o },
  ];
}

/** Drops falling from a tipped can's spout towards the pot. */
function drops(from: Pt, towardsRight: boolean): ArtShape[] {
  const dir = towardsRight ? 1 : -1;
  return [0, 1, 2].map((i) => {
    const x = from[0] + dir * (i * 2.5 + 1);
    const y = from[1] + i * 8 + 6;
    return { kind: 'path', d: pen().M(x, y - 4).C(x + 2.6, y, x + 2.4, y + 3, x, y + 3).C(x - 2.4, y + 3, x - 2.6, y, x, y - 4).Z().d(), fill: C.water, opacity: 0.9 - i * 0.15 };
  });
}

// ---------------------------------------------------------- the plant ---

interface Growth {
  height: number;
  /** [position along the stem 0–1, side -1 left / 1 right, length] */
  leaves: [number, -1 | 1, number][];
  buds: [number, -1 | 1][];
  flowers: [number, number, number][]; // [dx, dy from stem top, size]
  thickness: number;
}

const GROWTH: Record<Exclude<PlantStageKey, 'seed' | 'tree'>, Growth> = {
  sprout: { height: 16, leaves: [[1, -1, 11], [1, 1, 11]], buds: [], flowers: [], thickness: 2.2 },
  seedling: { height: 32, leaves: [[0.45, 1, 14], [0.7, -1, 15], [1, -1, 12], [1, 1, 13]], buds: [], flowers: [], thickness: 2.6 },
  young: {
    height: 52,
    leaves: [[0.25, -1, 17], [0.42, 1, 19], [0.6, -1, 18], [0.76, 1, 16], [1, -1, 13], [1, 1, 14]],
    buds: [],
    flowers: [],
    thickness: 3,
  },
  bud: {
    height: 62,
    leaves: [[0.2, 1, 18], [0.36, -1, 20], [0.52, 1, 20], [0.68, -1, 18], [0.82, 1, 15], [0.92, -1, 13]],
    buds: [[1, 1]],
    flowers: [],
    thickness: 3.2,
  },
  flower: {
    height: 70,
    leaves: [[0.18, -1, 19], [0.32, 1, 21], [0.48, -1, 21], [0.62, 1, 19], [0.76, -1, 16], [0.86, 1, 14]],
    buds: [[0.7, 1]],
    flowers: [[0, -4, 11]],
    thickness: 3.4,
  },
  bloom: {
    height: 78,
    leaves: [[0.16, 1, 20], [0.28, -1, 22], [0.42, 1, 22], [0.55, -1, 20], [0.68, 1, 18], [0.8, -1, 15], [0.9, 1, 13]],
    buds: [],
    flowers: [[0, -4, 12], [-22, 18, 9], [21, 26, 9.5]],
    thickness: 3.6,
  },
};

/** The growth table is drawn a little larger than its numbers, so the plant holds its own against the pot. */
const K = 1.32;

function plantShapes(stage: PlantStageKey, drooping: boolean): ArtShape[] {
  const [ox, oy] = [PLANT_ORIGIN.x, PLANT_ORIGIN.y];
  const leafFill = drooping ? 'grad:leafTired' : 'grad:leaf';
  const leafBack = drooping ? 'grad:leafTiredBack' : 'grad:leafBack';
  const vein = drooping ? '#E6EBC9' : C.sage100;

  if (stage === 'seed') {
    return [
      { kind: 'ellipse', cx: ox, cy: oy - 6, rx: 12, ry: 5, fill: '#6B4636' },
      { kind: 'ellipse', cx: ox + 1, cy: oy - 10, rx: 5.5, ry: 4, fill: C.gold300 },
      { kind: 'ellipse', cx: ox - 0.5, cy: oy - 11.4, rx: 2, ry: 1.1, fill: '#FFF4D6', opacity: 0.9 },
      sparkle([ox + 16, oy - 22], 5, C.gold400),
      sparkle([ox - 14, oy - 30], 3.4, C.gold300, 0.8),
    ];
  }

  if (stage === 'tree') {
    const trunk = drooping ? '#6B4A2E' : '#7A5233';
    const top: Pt = [ox + 2, oy - 64];
    const canopy: [number, number, number, string][] = [
      [-30, 2, 22, 'grad:leafBack'],
      [30, 4, 22, 'grad:leafBack'],
      [-18, -16, 24, leafFill],
      [18, -14, 25, leafFill],
      [0, -28, 24, leafFill],
      [-34, -8, 16, leafFill],
      [36, -6, 15, leafFill],
      [0, 0, 22, leafFill],
    ];
    const blossoms: [number, number, number, string, string][] = [
      [-24, -20, 6.5, C.rose200, C.rose300],
      [14, -30, 7, C.rose300, C.rose200],
      [30, -8, 6, C.rose200, C.rose300],
      [-36, 0, 5.5, C.gold200, C.gold300],
      [4, -6, 6.5, C.rose200, C.rose300],
      [-8, -38, 5.5, C.gold200, C.gold300],
      [24, 10, 5.5, C.rose300, C.rose200],
      [-18, 12, 6, C.rose200, C.rose300],
    ];
    return [
      { kind: 'path', d: pen().M(ox - 5, oy).C(ox - 4, oy - 26, ox + 3, oy - 40, top[0], top[1]).L(top[0] + 6, top[1] + 2).C(ox + 8, oy - 38, ox + 3, oy - 22, ox + 5, oy).Z().d(), fill: trunk },
      { kind: 'path', d: pen().M(ox + 1, oy - 34).Q(ox - 14, oy - 46, ox - 24, oy - 58).d(), stroke: trunk, strokeWidth: 3.2 },
      { kind: 'path', d: pen().M(ox + 3, oy - 42).Q(ox + 18, oy - 52, ox + 26, oy - 62).d(), stroke: trunk, strokeWidth: 3 },
      ...canopy.map(([dx, dy, r, fill]): ArtShape => ({ kind: 'circle', cx: top[0] + dx, cy: top[1] + dy, r, fill })),
      ...blossoms.flatMap(([dx, dy, s, a, b], i) => flower([top[0] + dx, top[1] + dy], s, a, b, C.gold300, i * 17)),
    ];
  }

  const g = GROWTH[stage];
  // Drooping: the stem leans and leaves hang lower. Same plant, tired.
  const lean = drooping ? 10 : 2;
  const base: Pt = [ox, oy];
  const tip: Pt = [ox + lean, oy - g.height * K * (drooping ? 0.92 : 1)];
  const ctrl: Pt = [ox - lean * 0.6, oy - g.height * K * 0.55];
  const shapes: ArtShape[] = [];

  // Leaves behind the stem first (the left-hand ones), then the stem, then the rest.
  const leafAt = ([t, side, len]: [number, -1 | 1, number], back: boolean) => {
    const at = quad(base, ctrl, tip, t);
    const up = side === 1 ? -38 : -142;
    const deg = drooping ? (side === 1 ? 12 : 168) : up + (t === 1 ? (side === 1 ? -12 : 12) : 0);
    return leaf(at, deg, len * K * (drooping ? 0.92 : 1), back ? leafBack : leafFill, vein);
  };
  for (const l of g.leaves) if (l[1] === -1) shapes.push(...leafAt(l, true));
  shapes.push({
    kind: 'path',
    d: pen().M(base[0], base[1]).Q(ctrl[0], ctrl[1], tip[0], tip[1]).d(),
    stroke: drooping ? '#7FA06A' : C.sage600,
    strokeWidth: g.thickness * 1.15,
  });
  for (const l of g.leaves) if (l[1] === 1) shapes.push(...leafAt(l, false));
  for (const [t, side] of g.buds) {
    const at = quad(base, ctrl, tip, t);
    shapes.push(...bud(t === 1 ? [tip[0], tip[1] - 1] : [at[0] + side * 8, at[1] - 6], 7 * K, drooping ? -40 : -90 + side * 14));
    if (t !== 1) shapes.push({ kind: 'path', d: pen().M(at[0], at[1]).Q(at[0] + side * 5, at[1] - 2, at[0] + side * 8, at[1] - 6).d(), stroke: C.sage600, strokeWidth: 1.6 });
  }
  g.flowers.forEach(([dx, dy, size], i) => {
    const at: Pt = [tip[0] + dx * K, tip[1] + dy * K + (drooping ? 6 : 0)];
    if (dx !== 0) {
      const from = quad(base, ctrl, tip, 0.55 + i * 0.1);
      shapes.push({ kind: 'path', d: pen().M(from[0], from[1]).Q((from[0] + at[0]) / 2, at[1] + 6, at[0], at[1]).d(), stroke: C.sage600, strokeWidth: 2 });
    }
    const petals = i === 2 ? [C.gold200, C.gold300] : [C.rose300, C.rose400];
    shapes.push(...flower(at, size * K * (drooping ? 0.85 : 1), petals[0]!, petals[1]!, i === 2 ? C.gold400 : C.gold300, i * 23));
  });
  return shapes;
}

// ---------------------------------------------------------------- scene ---

export interface PlantSceneInput {
  stage: PlantStageKey;
  drooping: boolean;
  daypart: PlantState['daypart'];
  /** Left can belongs to me, right to my partner: colour and whether it's watered today. */
  left: { color: string; deep: string; watered: boolean };
  right: { color: string; deep: string; watered: boolean };
  /** We both watered today: the soil is dark and fresh. */
  fresh: boolean;
}

/** Partner colours for the cans (A rose, B teal). */
export const CAN_COLORS = {
  a: { color: C.rose300, deep: C.rose500 },
  b: { color: C.teal300, deep: C.teal500 },
};

export function plantScene(input: PlantSceneInput): PlantScene {
  const sky = SKY[input.daypart];
  const night = input.daypart === 'night';
  const gradients: ArtGradient[] = [
    { id: 'sky', type: 'linear', coords: [0, 0, 0, 1], stops: [{ offset: 0, color: sky.top }, { offset: 1, color: sky.bottom }] },
    { id: 'hill', type: 'linear', coords: [0, 0, 0, 1], stops: [{ offset: 0, color: sky.hill[0] }, { offset: 1, color: sky.hill[1] }] },
    {
      id: 'glow',
      type: 'radial',
      coords: [0.5, 0.5, 0.5],
      stops: [
        { offset: 0, color: night ? '#FFF6E0' : C.gold200, opacity: night ? 0.55 : 0.9 },
        { offset: 1, color: night ? '#FFF6E0' : C.gold200, opacity: 0 },
      ],
    },
    { id: 'pot', type: 'linear', coords: [0, 0, 1, 0], stops: [{ offset: 0, color: C.plum500 }, { offset: 0.55, color: C.plum600 }, { offset: 1, color: C.plum700 }] },
    { id: 'rim', type: 'linear', coords: [0, 0, 0, 1], stops: [{ offset: 0, color: C.rose300 }, { offset: 1, color: C.rose500 }] },
    { id: 'leaf', type: 'linear', coords: [0, 0, 1, 1], stops: [{ offset: 0, color: C.sage300 }, { offset: 1, color: C.sage500 }] },
    { id: 'leafBack', type: 'linear', coords: [0, 0, 1, 1], stops: [{ offset: 0, color: C.sage400 }, { offset: 1, color: C.sage600 }] },
    { id: 'leafTired', type: 'linear', coords: [0, 0, 1, 1], stops: [{ offset: 0, color: '#BFD39A' }, { offset: 1, color: '#93AE73' }] },
    { id: 'leafTiredBack', type: 'linear', coords: [0, 0, 1, 1], stops: [{ offset: 0, color: '#A9C287' }, { offset: 1, color: '#7F9963' }] },
    { id: 'bud', type: 'linear', coords: [0, 0, 0, 1], stops: [{ offset: 0, color: C.rose300 }, { offset: 1, color: C.rose500 }] },
  ];

  // Sky, the sun or moon in its glow, a few stars at night.
  const sunAt: Pt =
    input.daypart === 'morning' ? [62, 62] : input.daypart === 'day' ? [262, 44] : input.daypart === 'evening' ? [252, 88] : [258, 46];
  const skyShapes: ArtShape[] = [
    { kind: 'path', d: 'M0 0 H320 V200 H0 Z', fill: 'grad:sky' },
    { kind: 'circle', cx: sunAt[0], cy: sunAt[1], r: 46, fill: 'grad:glow' },
  ];
  if (night) {
    skyShapes.push(
      { kind: 'circle', cx: sunAt[0], cy: sunAt[1], r: 14, fill: '#FFF3D6' },
      { kind: 'circle', cx: sunAt[0] - 4, cy: sunAt[1] - 3, r: 3.2, fill: '#EADFC4', opacity: 0.8 },
      { kind: 'circle', cx: sunAt[0] + 5, cy: sunAt[1] + 4, r: 2.2, fill: '#EADFC4', opacity: 0.7 },
      { kind: 'circle', cx: sunAt[0] + 3, cy: sunAt[1] - 6, r: 1.4, fill: '#EADFC4', opacity: 0.7 },
      sparkle([58, 40], 3.6, '#FFF3D6', 0.9),
      sparkle([104, 22], 2.4, '#FFF3D6', 0.7),
      sparkle([206, 30], 2.8, '#FFF3D6', 0.8),
      { kind: 'circle', cx: 34, cy: 74, r: 1.1, fill: '#FFF3D6', opacity: 0.7 },
      { kind: 'circle', cx: 150, cy: 18, r: 1.2, fill: '#FFF3D6', opacity: 0.6 },
      { kind: 'circle', cx: 292, cy: 92, r: 1, fill: '#FFF3D6', opacity: 0.6 },
    );
  } else {
    skyShapes.push({ kind: 'circle', cx: sunAt[0], cy: sunAt[1], r: 15, fill: input.daypart === 'evening' ? C.rose300 : C.gold300 });
    // Two soft clouds.
    for (const [x, y, s] of [[96, 46, 1], [214, 70, 0.75]] as const) {
      skyShapes.push({
        kind: 'path',
        d: pen(tx([x, y], 0, s)).M(-22, 6).C(-24, -2, -14, -6, -8, -3).C(-6, -12, 8, -13, 11, -4).C(18, -6, 24, 0, 22, 6).Z().d(),
        fill: '#FFFFFF',
        opacity: 0.75,
      });
    }
  }

  const ground: ArtShape[] = [
    { kind: 'path', d: 'M0 158 C60 142 110 150 160 152 C214 154 262 140 320 150 V200 H0 Z', fill: 'grad:hill' },
    { kind: 'path', d: 'M0 172 C70 162 130 170 180 168 C236 166 280 160 320 166 V200 H0 Z', fill: sky.hill[1], opacity: 0.55 },
    // Grass tufts.
    ...([[42, 160], [268, 154], [214, 168], [92, 170]] as Pt[]).map(([x, y]): ArtShape => ({
      kind: 'path',
      d: pen().M(x - 4, y).Q(x - 3, y - 6, x - 1, y - 8).M(x, y).Q(x, y - 7, x + 1, y - 10).M(x + 4, y).Q(x + 3, y - 5, x + 4, y - 7).d(),
      stroke: night ? '#3F6B52' : C.sage500,
      strokeWidth: 1.3,
      opacity: 0.8,
    })),
  ];

  const [ox, oy] = [PLANT_ORIGIN.x, PLANT_ORIGIN.y];
  const pot: ArtShape[] = [
    { kind: 'ellipse', cx: ox, cy: 168, rx: 40, ry: 5, fill: C.plum900, opacity: 0.16 },
    { kind: 'path', d: pen().M(ox - 30, oy + 6).L(ox + 30, oy + 6).L(ox + 23, 164).C(ox + 22, 167, ox + 20, 168, ox + 17, 168).L(ox - 17, 168).C(ox - 20, 168, ox - 22, 167, ox - 23, 164).Z().d(), fill: 'grad:pot' },
    { kind: 'path', d: pen().M(ox - 36, oy - 2).C(ox - 36, oy - 5, ox - 34, oy - 6, ox - 31, oy - 6).L(ox + 31, oy - 6).C(ox + 34, oy - 6, ox + 36, oy - 5, ox + 36, oy - 2).L(ox + 36, oy + 4).C(ox + 36, oy + 7, ox + 34, oy + 8, ox + 31, oy + 8).L(ox - 31, oy + 8).C(ox - 34, oy + 8, ox - 36, oy + 7, ox - 36, oy + 4).Z().d(), fill: 'grad:rim' },
    { kind: 'ellipse', cx: ox, cy: oy - 3, rx: 30, ry: 3.2, fill: input.fresh ? '#3B2418' : '#5A3B2E' },
    // A little heart on the pot: the two of us.
    { kind: 'path', d: pen(tx([ox, 146], 0, 0.9)).M(0, 6).C(-9, 0, -8, -7, -3.5, -7).C(-1.5, -7, 0, -5.5, 0, -4).C(0, -5.5, 1.5, -7, 3.5, -7).C(8, -7, 9, 0, 0, 6).Z().d(), fill: C.rose300, opacity: 0.95 },
    { kind: 'path', d: pen().M(ox - 24, oy + 14).L(ox - 18, 160).d(), stroke: '#FFFFFF', strokeWidth: 2, opacity: 0.18 },
  ];

  // Petals drifting from a plant in bloom.
  const petals: ArtShape[] =
    input.stage === 'bloom' || input.stage === 'tree' || input.stage === 'flower'
      ? ([[196, 70, 20], [124, 92, -30]] as [number, number, number][]).map(([x, y, deg]) => ({
          kind: 'path' as const,
          d: pen(tx([x, y], deg)).M(0, 0).C(2, -3, 7, -3, 8, 0).C(7, 3, 2, 3, 0, 0).Z().d(),
          fill: C.rose300,
          opacity: 0.85,
        }))
      : [];

  // A can that's pouring is lifted over the pot's rim; one resting sits on the grass.
  const leftAt: Pt = input.left.watered ? [98, 106] : [66, 140];
  const rightAt: Pt = input.right.watered ? [222, 106] : [254, 140];
  const spout = (at: Pt, mirror: boolean) => tx(at, mirror ? -30 : 30, 1, mirror)([31, -10]);
  const dropShapes = [
    ...(input.left.watered ? drops(spout(leftAt, false), true) : []),
    ...(input.right.watered ? drops(spout(rightAt, true), false) : []),
  ];

  return {
    gradients,
    layers: [
      { id: 'sky', shapes: skyShapes },
      { id: 'ground', shapes: ground },
      { id: 'plant', shapes: plantShapes(input.stage, input.drooping) },
      { id: 'pot', shapes: pot },
      { id: 'petals', shapes: petals },
      { id: 'canLeft', shapes: can(leftAt, input.left.color, input.left.deep, input.left.watered, false) },
      { id: 'canRight', shapes: can(rightAt, input.right.color, input.right.deep, input.right.watered, true) },
      { id: 'drops', shapes: dropShapes },
    ],
  };
}

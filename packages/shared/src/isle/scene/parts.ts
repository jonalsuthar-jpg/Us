import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The board's shapes, made from simple pieces merged into one geometry each
 * with the colours in the vertices, so a forest of trees or every sheep on
 * the island is one draw. Sizes are in board units: a hex is one from its
 * centre to a corner.
 */

export const TILE_TOP = 0.26;

export const COLORS = {
  sea: '#1C6A8A',
  shallow: '#3FB0BE',
  foam: '#EAF6F1',
  sand: '#E8C47A',
  sandDark: '#C9AE72',
  earth: '#6A4A2C',
  wood: '#A47148',
  woodDark: '#6E4A2E',
  cream: '#F3E7CC',
  ink: '#3B2A1E',
  red: '#B5281F',
  // Rich, saturated lands: they have to hold their colour under a bright sun.
  terrain: {
    wood: '#2C7A2A',
    brick: '#B4602F',
    wool: '#6FBF3A',
    grain: '#F0B021',
    ore: '#6F7B88',
    desert: '#EAC679',
  },
} as const;

/** The four seats' colours: red, blue, white, orange. */
export const PLAYER_COLORS = ['#D2412E', '#2E68CF', '#EFE8D8', '#E8902A'] as const;

type Place = { at?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] };

/** One piece: placed, coloured, ready to merge. */
export function piece(g: THREE.BufferGeometry, color: string, { at, rot, scale }: Place = {}): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(at ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))),
    new THREE.Vector3(...(scale ?? [1, 1, 1])),
  );
  const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
  g.dispose();
  const c = new THREE.Color(color);
  const n = out.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.deleteAttribute('uv');
  return out;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) if (p.getAttribute('uv')) p.deleteAttribute('uv');
  const out = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return out;
}

// ---- Land ----------------------------------------------------------------

/** The flat top of a tile, centre to corner: the tiles sit nearly edge to edge, a dark seam between them. */
export const TILE_FACE = 0.955;

/** A hex tile: a bevelled top (white, tinted per tile) on a darker earth side. */
export function tileGeometry() {
  return {
    top: new THREE.CylinderGeometry(TILE_FACE, 0.985, 0.05, 6).translate(0, TILE_TOP - 0.025, 0),
    side: new THREE.CylinderGeometry(0.985, 0.995, TILE_TOP - 0.05, 6).translate(0, (TILE_TOP - 0.05) / 2, 0),
  };
}

export function treeGeometry() {
  return merge([
    piece(new THREE.CylinderGeometry(0.025, 0.035, 0.12, 5), '#5B3B24', { at: [0, 0.06, 0] }),
    piece(new THREE.ConeGeometry(0.13, 0.22, 7), '#1B6327', { at: [0, 0.2, 0] }),
    piece(new THREE.ConeGeometry(0.1, 0.18, 7), '#2A8A33', { at: [0, 0.3, 0] }),
  ]);
}

export function sheepGeometry() {
  return merge([
    piece(new THREE.SphereGeometry(0.085, 8, 6), '#F7F4EC', { at: [0, 0.09, 0], scale: [1.25, 0.9, 0.9] }),
    piece(new THREE.SphereGeometry(0.045, 7, 5), '#2E2A27', { at: [0.11, 0.11, 0] }),
    ...[-0.05, 0.05].flatMap((x) =>
      [-0.04, 0.04].map((z) => piece(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 4), '#2E2A27', { at: [x, 0.03, z] })),
    ),
  ]);
}

export function bushGeometry() {
  return piece(new THREE.IcosahedronGeometry(0.07, 0), '#3F9A2A', { at: [0, 0.05, 0], scale: [1, 0.8, 1] });
}

/** A strip of wheat: a raised row with a seed-head ridge. */
export function wheatGeometry() {
  return merge([
    piece(new THREE.BoxGeometry(0.62, 0.05, 0.09), '#D9970F', { at: [0, 0.025, 0] }),
    piece(new THREE.BoxGeometry(0.6, 0.03, 0.05), '#F7C933', { at: [0, 0.065, 0] }),
  ]);
}

export function clayGeometry() {
  return merge([
    piece(new THREE.SphereGeometry(0.2, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#A93D1B', { scale: [1, 0.55, 1] }),
    piece(new THREE.BoxGeometry(0.1, 0.05, 0.05), '#D4572E', { at: [0.24, 0.025, 0.02] }),
    piece(new THREE.BoxGeometry(0.1, 0.05, 0.05), '#B8442A', { at: [0.24, 0.075, 0.02] }),
    piece(new THREE.BoxGeometry(0.1, 0.05, 0.05), '#D4572E', { at: [0.25, 0.025, 0.09] }),
  ]);
}

export function peakGeometry() {
  return merge([
    piece(new THREE.ConeGeometry(0.26, 0.42, 6), '#5E6A77', { at: [0, 0.21, 0] }),
    piece(new THREE.ConeGeometry(0.1, 0.13, 6), '#F4F6F7', { at: [0, 0.37, 0] }),
  ]);
}

export function rockGeometry() {
  return piece(new THREE.DodecahedronGeometry(0.09, 0), '#87919B', { at: [0, 0.05, 0], scale: [1, 0.7, 1] });
}

export function duneGeometry() {
  return piece(new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#DDA84E', { scale: [1.3, 0.35, 0.8] });
}

export function palmGeometry() {
  const leaves = [0, 1, 2, 3, 4].map((i) =>
    piece(new THREE.BoxGeometry(0.17, 0.012, 0.05), '#2F9A2C', {
      at: [Math.cos((i * 2 * Math.PI) / 5) * 0.07, 0.24, Math.sin((i * 2 * Math.PI) / 5) * 0.07],
      rot: [0, (-i * 2 * Math.PI) / 5, -0.35],
    }),
  );
  return merge([piece(new THREE.CylinderGeometry(0.015, 0.024, 0.25, 5), '#8A6A44', { at: [0, 0.125, 0], rot: [0, 0, 0.12] }), ...leaves]);
}

// ---- Pieces ----------------------------------------------------------------

/*
 * The pieces are shaped like the wooden pieces of a board game: profiles
 * extruded with rounded (bevelled) edges, so light rolls over them. They're
 * white and greys, tinted with the seat's colour by their material: white
 * shows the colour itself, the greys its shades, near-black the doors and
 * windows. Each is built at its size on the board (a hex is one across from
 * centre to corner), standing on y = 0.
 */

/** A flat outline (x across, y up) pushed out to a depth along z, centred, its edges rounded. */
function extruded(points: [number, number][], depth: number, bevel: number) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 2 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}

/** A town: a little house with a steep roof, a door, windows and a chimney. */
export function townGeometry() {
  const w = 0.13;
  const depth = 0.24;
  const parts = [
    piece(extruded([[-w, 0.012], [w, 0.012], [w, 0.2], [0, 0.35], [-w, 0.2]], depth, 0.018), '#FFFFFF'),
    // The roof's two slopes, a shade darker, sitting proud of the walls.
    ...[-1, 1].map((side) =>
      piece(new THREE.BoxGeometry(0.2, 0.022, depth + 0.03), '#B9B9B9', { at: [side * 0.068, 0.282, 0], rot: [0, 0, side * -Math.atan2(0.15, 0.13)] }),
    ),
    piece(new THREE.BoxGeometry(0.04, 0.09, 0.04), '#9A9A9A', { at: [0.07, 0.33, -0.05] }),
    // Door and windows on the front and back.
    ...[1, -1].flatMap((f) => [
      piece(new THREE.BoxGeometry(0.05, 0.085, 0.006), '#262626', { at: [0, 0.055, f * (depth / 2 + 0.002)] }),
      piece(new THREE.BoxGeometry(0.04, 0.035, 0.006), '#262626', { at: [-0.075, 0.14, f * (depth / 2 + 0.002)] }),
      piece(new THREE.BoxGeometry(0.04, 0.035, 0.006), '#262626', { at: [0.075, 0.14, f * (depth / 2 + 0.002)] }),
    ]),
  ];
  return merge(parts);
}

/** A city: a hall with a pitched roof beside a tall keep with battlements, windows and a gate. */
export function cityGeometry() {
  const depth = 0.27;
  const profile: [number, number][] = [
    [-0.27, 0.012],
    [0.27, 0.012],
    [0.27, 0.24],
    [0.125, 0.37],
    [-0.02, 0.24],
    [-0.02, 0.5],
    [-0.065, 0.5],
    [-0.065, 0.455],
    [-0.1, 0.455],
    [-0.1, 0.5],
    [-0.145, 0.5],
    [-0.145, 0.455],
    [-0.18, 0.455],
    [-0.18, 0.5],
    [-0.225, 0.5],
    [-0.225, 0.455],
    [-0.27, 0.455],
    [-0.27, 0.5],
  ];
  const parts = [
    piece(extruded(profile, depth, 0.016), '#FFFFFF'),
    ...[-1, 1].map((side) =>
      piece(new THREE.BoxGeometry(0.2, 0.022, depth + 0.03), '#B9B9B9', { at: [0.125 + side * 0.072, 0.31, 0], rot: [0, 0, side * -Math.atan2(0.13, 0.145)] }),
    ),
    ...[1, -1].flatMap((f) => {
      const z = f * (depth / 2 + 0.002);
      return [
        piece(new THREE.BoxGeometry(0.07, 0.11, 0.006), '#262626', { at: [-0.145, 0.067, z] }),
        piece(new THREE.BoxGeometry(0.03, 0.06, 0.006), '#262626', { at: [-0.2, 0.3, z] }),
        piece(new THREE.BoxGeometry(0.03, 0.06, 0.006), '#262626', { at: [-0.09, 0.3, z] }),
        piece(new THREE.BoxGeometry(0.045, 0.04, 0.006), '#262626', { at: [0.07, 0.14, z] }),
        piece(new THREE.BoxGeometry(0.045, 0.04, 0.006), '#262626', { at: [0.185, 0.14, z] }),
      ];
    }),
    // A pennant on the keep.
    piece(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5), '#7A7A7A', { at: [-0.145, 0.56, 0] }),
    piece(new THREE.BoxGeometry(0.06, 0.035, 0.006), '#FFFFFF', { at: [-0.115, 0.6, 0] }),
  ];
  return merge(parts);
}

/** A road: a wooden bar with rounded edges, laid along a side of a hex. */
export function roadGeometry() {
  return merge([piece(new RoundedBoxGeometry(0.6, 0.085, 0.125, 2, 0.028), '#FFFFFF', { at: [0, 0.0425 + 0.004, 0] })]);
}

/** A soft dark patch under a piece, so it sits on the board rather than floating: vertex alpha, no texture. */
export function contactShadowGeometry(rx: number, rz: number) {
  const n = 24;
  const pos: number[] = [0, 0, 0];
  const col: number[] = [0, 0, 0, 0.5];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos.push(Math.cos(a) * rx, 0, Math.sin(a) * rz);
    col.push(0, 0, 0, 0);
  }
  const index: number[] = [];
  for (let i = 1; i <= n; i++) index.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

/** A small sailing boat, bow along +x. */
export function boatGeometry() {
  const hull = new THREE.CylinderGeometry(0.09, 0.06, 0.34, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
  return merge([
    piece(hull, '#7A4E2C', { at: [0, 0.07, 0], scale: [1, 1, 0.9] }),
    piece(new THREE.BoxGeometry(0.3, 0.01, 0.13), '#A47148', { at: [0, 0.075, 0] }),
    piece(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), '#5B3B24', { at: [0.02, 0.25, 0] }),
    piece(new THREE.ConeGeometry(0.11, 0.26, 3), '#F6EEDB', { at: [0.0, 0.24, 0], scale: [1, 1, 0.12], rot: [0, 0, 0] }),
  ]);
}

/** A little island far out to sea: a hump of green on a sandy foot. */
export function farIslandGeometry() {
  return merge([
    piece(new THREE.CylinderGeometry(1, 1.15, 0.12, 14), '#D9BC7E', { at: [0, 0.06, 0] }),
    piece(new THREE.SphereGeometry(0.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#4E8C4A', { at: [0, 0.1, 0], scale: [1, 0.55, 0.85] }),
    piece(new THREE.ConeGeometry(0.45, 0.7, 7), '#7F8A86', { at: [0.3, 0.45, -0.1] }),
  ]);
}

export function robberGeometry() {
  const profile = [
    [0, 0],
    [0.13, 0],
    [0.14, 0.03],
    [0.1, 0.06],
    [0.115, 0.2],
    [0.08, 0.3],
    [0.05, 0.33],
    [0.085, 0.38],
    [0.09, 0.44],
    [0.06, 0.5],
    [0, 0.52],
  ].map(([x, y]) => new THREE.Vector2(x!, y!));
  return merge([piece(new THREE.LatheGeometry(profile, 14), '#3A3A40', { scale: [1.35, 1.35, 1.35] })]);
}

/** Where the pips sit on each face of a die: +y 1, -y 6, +x 2, -x 5, +z 3, -z 4. */
const PIPS: [number, number][][] = [
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
];
const FACES: { v: number; n: [number, number, number]; u: [number, number, number]; w: [number, number, number] }[] = [
  { v: 1, n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, 1] },
  { v: 6, n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1] },
  { v: 2, n: [1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] },
  { v: 5, n: [-1, 0, 0], u: [0, 1, 0], w: [0, 0, 1] },
  { v: 3, n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] },
  { v: 4, n: [0, 0, -1], u: [1, 0, 0], w: [0, 1, 0] },
];

export function dieGeometry(size = 0.3) {
  const h = size / 2;
  const parts = [piece(new RoundedBoxGeometry(size, size, size, 3, size * 0.14), '#FBF6EA')];
  for (const f of FACES) {
    for (const [a, b] of PIPS[f.v - 1]!) {
      const at: [number, number, number] = [0, 1, 2].map(
        (k) => f.n[k]! * (h + 0.002) + (f.u[k]! * a + f.w[k]! * b) * size * 0.27,
      ) as [number, number, number];
      const pip = new THREE.CylinderGeometry(size * 0.075, size * 0.075, 0.006, 10);
      const rot = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...f.n)),
      );
      parts.push(piece(pip, f.v === 1 ? '#B5281F' : '#2B2522', { at, rot: [rot.x, rot.y, rot.z] }));
    }
  }
  return merge(parts);
}

/** How a die turns so a value faces up (before its spin about the vertical). */
export function dieFacing(value: number): THREE.Quaternion {
  const q = new THREE.Quaternion();
  const x = new THREE.Vector3(1, 0, 0);
  const z = new THREE.Vector3(0, 0, 1);
  switch (value) {
    case 6:
      return q.setFromAxisAngle(x, Math.PI);
    case 2:
      return q.setFromAxisAngle(z, Math.PI / 2);
    case 5:
      return q.setFromAxisAngle(z, -Math.PI / 2);
    case 3:
      return q.setFromAxisAngle(x, -Math.PI / 2);
    case 4:
      return q.setFromAxisAngle(x, Math.PI / 2);
    default:
      return q;
  }
}

/** A plank (or any box) laid from one point to another, sloping if they differ in height. */
function beam(from: THREE.Vector3, to: THREE.Vector3, width: number, depth: number, color: string) {
  const d = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.BoxGeometry(d.length(), depth, width);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  return piece(g, color, { at: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z] });
}

/**
 * A harbour: a little landing stage just off the coast, lying along it, with
 * a plank down to it from each of the harbour's two corners. Built where it
 * stands (board coordinates), from the corners and the way out to sea.
 */
export function harbourGeometry(a: { x: number; y: number }, b: { x: number; y: number }, out: { x: number; y: number }) {
  const parts: THREE.BufferGeometry[] = [];
  const mx = (a.x + b.x) / 2 + out.x * 0.55;
  const mz = (a.y + b.y) / 2 + out.y * 0.55;
  const along = Math.atan2(b.y - a.y, b.x - a.x);
  const deck = 0.14;
  const ca = Math.cos(along);
  const sa = Math.sin(along);
  // The landing stage: planks across it, a darker frame round it.
  parts.push(piece(new THREE.BoxGeometry(0.56, 0.03, 0.34), '#6E4A2E', { at: [mx, deck - 0.012, mz], rot: [0, -along, 0] }));
  for (let i = -3; i <= 3; i++) {
    const u = i * 0.075;
    parts.push(piece(new THREE.BoxGeometry(0.065, 0.02, 0.32), i % 2 ? '#B07B4E' : '#A06C42', { at: [mx + u * ca, deck + 0.012, mz + u * sa], rot: [0, -along, 0] }));
  }
  // Posts down into the water, and two bollards at the sea end.
  for (const [u, v] of [[-0.25, -0.15], [0.25, -0.15], [-0.25, 0.15], [0.25, 0.15], [0, 0.15]] as const) {
    parts.push(piece(new THREE.CylinderGeometry(0.022, 0.026, 0.24, 6), '#5B3B24', { at: [mx + u * ca + v * out.x, 0.04, mz + u * sa + v * out.y] }));
  }
  for (const u of [-0.2, 0.2]) {
    parts.push(piece(new THREE.CylinderGeometry(0.02, 0.024, 0.06, 8), '#3E2A1A', { at: [mx + u * ca + 0.13 * out.x, deck + 0.045, mz + u * sa + 0.13 * out.y] }));
  }
  // A plank from each corner of the coast down to the stage's near edge.
  for (const [c, side] of [[a, -1], [b, 1]] as const) {
    const from = new THREE.Vector3(c.x, TILE_TOP - 0.02, c.y);
    const to = new THREE.Vector3(mx + side * 0.2 * ca - out.x * 0.14, deck + 0.012, mz + side * 0.2 * sa - out.y * 0.14);
    parts.push(beam(from, to, 0.09, 0.03, '#A47148'));
  }
  return merge(parts);
}

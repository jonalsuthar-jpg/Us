import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The board's shapes, made from simple pieces merged into one geometry each
 * with the colours in the vertices, so all the tokens or all the harbours
 * are one draw. Sizes are in board units: a hex is one from its centre to a
 * corner.
 */

export const TILE_TOP = 0.26;

export const COLORS = {
  sea: '#1C6A8A',
  shallow: '#3FB0BE',
  foam: '#EAF6F1',
  sand: '#E4CD94',
  sandDark: '#C9AE72',
  earth: '#7A5A3A',
  wood: '#A47148',
  woodDark: '#6E4A2E',
  cream: '#F3E7CC',
  ink: '#3B2A1E',
  red: '#B5281F',
  terrain: {
    wood: '#3F7D3A',
    brick: '#B9693F',
    wool: '#93C760',
    grain: '#E3BE4C',
    ore: '#8F969C',
    desert: '#E6D095',
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

/** How much of each tile's picture shows: a little gap between tiles, like printed tiles on a table. */
export const TILE_INSET = 0.955;

/**
 * A flat pointy-topped hex lying face up, `r` from centre to corner, with
 * UVs that put a square picture on it the way the art is rendered (corners
 * touching the picture's edges, north at the top). `y` is its height.
 */
export function hexTopGeometry(r = TILE_INSET, y = TILE_TOP) {
  const pos: number[] = [0, y, 0];
  const uv: number[] = [0.5, 0.5];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 90) * Math.PI) / 180;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    pos.push(x, y, z);
    // The picture spans corner to corner (radius 1), north (-z) at its top.
    uv.push(x / 2 + 0.5, -z / 2 + 0.5);
  }
  const index: number[] = [];
  for (let i = 0; i < 6; i++) index.push(0, 1 + ((i + 1) % 6), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A tile's thickness under its picture: a dark earthy edge. */
export function hexRimGeometry() {
  return merge([piece(new THREE.CylinderGeometry(TILE_INSET, TILE_INSET + 0.02, TILE_TOP - 0.03, 6), COLORS.earth, { at: [0, (TILE_TOP - 0.03) / 2, 0] })]);
}

/** The board's frame: a big flat-topped hex of water the island sits in, with a wooden rim. */
export const FRAME_R = 6.25;

export function frameWaterGeometry() {
  const pos: number[] = [0, 0.03, 0];
  const uv: number[] = [0.5, 0.5];
  for (let i = 0; i < 6; i++) {
    const a = (60 * i * Math.PI) / 180;
    const x = Math.cos(a) * FRAME_R;
    const z = Math.sin(a) * FRAME_R;
    pos.push(x, 0.03, z);
    uv.push(x / (2 * FRAME_R) + 0.5, -z / (2 * FRAME_R) + 0.5);
  }
  const index: number[] = [];
  for (let i = 0; i < 6; i++) index.push(0, 1 + ((i + 1) % 6), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function frameRimGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (60 * i * Math.PI) / 180;
    const b = (60 * (i + 1) * Math.PI) / 180;
    const x = (Math.cos(a) + Math.cos(b)) / 2;
    const z = (Math.sin(a) + Math.sin(b)) / 2;
    const len = FRAME_R + 0.12;
    const turn = -Math.atan2(Math.sin(b) - Math.sin(a), Math.cos(b) - Math.cos(a));
    parts.push(piece(new THREE.BoxGeometry(len, 0.14, 0.24), COLORS.woodDark, { at: [x * (FRAME_R + 0.1), 0.07, z * (FRAME_R + 0.1)], rot: [0, turn, 0] }));
    parts.push(piece(new THREE.BoxGeometry(len - 0.05, 0.03, 0.14), COLORS.wood, { at: [x * (FRAME_R + 0.1), 0.15, z * (FRAME_R + 0.1)], rot: [0, turn, 0] }));
  }
  return merge(parts);
}

// ---- Pieces ----------------------------------------------------------------

/** A town: walls and a pitched roof (white and grey, tinted with the seat's colour). */
export function townGeometry() {
  const roof = new THREE.CylinderGeometry(0.105, 0.105, 0.2, 3);
  return merge([
    piece(new THREE.BoxGeometry(0.18, 0.12, 0.17), '#FFFFFF', { at: [0, 0.06, 0] }),
    piece(roof, '#B8B8B8', { at: [0, 0.165, 0], rot: [0, 0, Math.PI / 2], scale: [0.85, 1, 1] }),
  ]);
}

/** A city: a long hall and a tall tower, both roofed. */
export function cityGeometry() {
  return merge([
    piece(new THREE.BoxGeometry(0.3, 0.13, 0.18), '#FFFFFF', { at: [0.04, 0.065, 0] }),
    piece(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 3), '#B8B8B8', { at: [0.04, 0.175, 0], rot: [0, 0, Math.PI / 2], scale: [0.8, 1, 1] }),
    piece(new THREE.BoxGeometry(0.13, 0.27, 0.15), '#F2F2F2', { at: [-0.12, 0.135, 0] }),
    piece(new THREE.ConeGeometry(0.11, 0.13, 4), '#A8A8A8', { at: [-0.12, 0.335, 0], rot: [0, Math.PI / 4, 0] }),
  ]);
}

export function roadGeometry() {
  return merge([piece(new THREE.BoxGeometry(0.58, 0.075, 0.095), '#FFFFFF', { at: [0, 0.0375, 0] })]);
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
  return merge([piece(new THREE.LatheGeometry(profile, 14), '#3A3A40')]);
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

/** A little harbour boat with a white sail, bow along +x. */
export function boatGeometry() {
  const hull = new THREE.CylinderGeometry(0.12, 0.07, 0.36, 10, 1, false, 0, Math.PI);
  return merge([
    // A half-cylinder hull lying along x, open side up.
    piece(hull, '#8A5530', { at: [0, 0.08, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.7] }),
    piece(new THREE.BoxGeometry(0.34, 0.02, 0.15), '#B07B4E', { at: [0, 0.085, 0] }),
    piece(new THREE.ConeGeometry(0.075, 0.12, 8), '#8A5530', { at: [0.22, 0.07, 0], rot: [0, 0, -Math.PI / 2], scale: [1, 1, 0.7] }),
    piece(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 6), '#5E3B24', { at: [0, 0.26, 0] }),
    // The sail: a thin triangle from the mast top to the boom.
    piece(new THREE.CylinderGeometry(0.0, 0.14, 0.26, 3, 1), '#FBF6EA', { at: [0.05, 0.24, 0], scale: [1, 1, 0.08] }),
  ]);
}

/** A mooring line from a boat to the shore, as a row of rope knots. */
export function ropeGeometry(from: [number, number], to: [number, number], y = 0.1) {
  const parts: THREE.BufferGeometry[] = [];
  const [x0, z0] = from;
  const [x1, z1] = to;
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.06));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // A gentle sag in the middle.
    const sag = Math.sin(t * Math.PI) * 0.04;
    parts.push(piece(new THREE.SphereGeometry(0.014, 6, 4), '#E9DCC0', { at: [x0 + (x1 - x0) * t, y + 0.06 * (1 - t) - sag, z0 + (z1 - z0) * t] }));
  }
  return merge(parts);
}

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

/** A hex tile: a bevelled top (white, tinted per tile) on a darker earth side. */
export function tileGeometry() {
  return {
    top: new THREE.CylinderGeometry(0.9, 0.955, 0.06, 6).translate(0, TILE_TOP - 0.03, 0),
    side: new THREE.CylinderGeometry(0.955, 0.985, TILE_TOP - 0.06, 6).translate(0, (TILE_TOP - 0.06) / 2, 0),
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

/** A harbour pier: planks out to a little platform, on posts. Along +x, out to sea. */
export function pierGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    parts.push(piece(new THREE.BoxGeometry(0.42, 0.03, 0.08), '#A47148', { at: [0.2, 0.13, side * 0.22], rot: [0, side * -0.55, 0] }));
  }
  parts.push(piece(new THREE.BoxGeometry(0.34, 0.035, 0.34), '#B07B4E', { at: [0.48, 0.13, 0] }));
  for (const [x, z] of [[0.33, -0.15], [0.33, 0.15], [0.63, -0.15], [0.63, 0.15]] as const) {
    parts.push(piece(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 6), '#6E4A2E', { at: [x, 0.06, z] }));
  }
  return merge(parts);
}

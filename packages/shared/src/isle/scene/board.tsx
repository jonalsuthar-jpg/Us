/**
 * The island on the table: a sunlit sea with foam on the beach, nineteen
 * bevelled land tiles with their forests, sheep, wheat, clay, peaks and
 * dunes, wooden number tokens, harbour piers, everyone's towns, cities and
 * roads (dropping in with a bounce when built), the robber, glowing spots
 * where a piece can go, and two dice that tumble onto a raft and land on the
 * number the game rolled.
 *
 * It only draws the state it's given. Taps are the screen's job: it asks
 * pick() where on the board a tap lands (see IsleBoardApi) and turns that
 * into a move with pickMark (isle/pick.ts).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import type { Quality } from '../../house/scene/materials';
import { mulberry32 } from '../../rng';
import { TOPOLOGY, type Board, type Terrain } from '../board';
import type { Marks } from '../pick';
import type { IsleState } from '../rules';
import { textGeometry } from './glyphs';
import {
  bushGeometry,
  cityGeometry,
  clayGeometry,
  COLORS,
  dieFacing,
  dieGeometry,
  duneGeometry,
  merge,
  palmGeometry,
  peakGeometry,
  piece,
  pierGeometry,
  PLAYER_COLORS,
  roadGeometry,
  robberGeometry,
  rockGeometry,
  sheepGeometry,
  tileGeometry,
  TILE_TOP,
  townGeometry,
  treeGeometry,
  wheatGeometry,
} from './parts';

const SKY = '#A9D8E8';
/** The camera's tilt above the table. */
const PITCH = (56 * Math.PI) / 180;

export interface IsleBoardApi {
  /** Where on the board (board units: x across, y down the table) a point on screen lands, from -1..1 coordinates. */
  pick(ndcX: number, ndcY: number): { x: number; y: number } | null;
  /** Closer (below 1) or further (above 1). */
  zoomBy(factor: number): void;
  /** Slides the view by a share of the screen's height. */
  panBy(dx: number, dy: number): void;
  /** Glides to look at a spot on the board. */
  focus(x: number, y: number): void;
  reset(): void;
}

export interface IsleBoardProps {
  state: IsleState;
  marks?: Marks;
  quality?: Quality;
  onReady?: (api: IsleBoardApi) => void;
  /** The dice have landed (after a roll's tumble). */
  onRolled?: (total: number) => void;
}

function useMaterial(quality: Quality, params: THREE.MeshStandardMaterialParameters = {}) {
  const mat = useMemo(
    () =>
      quality === 'low'
        ? new THREE.MeshLambertMaterial({ vertexColors: true, color: params.color })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, ...params }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quality, params.color],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

/** The last roll's place in the log, so a new one can be told from the one already showing. */
export function lastRoll(s: IsleState): { key: number; d: [number, number] } | null {
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i]!;
    if (e.k === 'roll') return { key: s.n - (s.log.length - 1 - i), d: e.d };
  }
  return null;
}

export function IsleBoard({ state, marks, quality = 'medium', onReady, onRolled }: IsleBoardProps) {
  const glow = useRef<{ total: number; at: number } | null>(null);
  const clock = useThree((t) => t.clock);
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 20, 42]} />
      <Lights quality={quality} />
      <Sea />
      <Island board={state.board} seed={state.seed} robber={state.robber} quality={quality} glow={glow} />
      <Pieces state={state} quality={quality} />
      <Robber hex={state.robber} quality={quality} />
      <MarkSpots marks={marks} />
      <Dice
        state={state}
        quality={quality}
        onLanded={(total) => {
          if (total !== 7) glow.current = { total, at: clock.elapsedTime };
          onRolled?.(total);
        }}
      />
      <CameraRig onReady={onReady} />
    </>
  );
}

// ---- Light, sky and sea ------------------------------------------------------

function Lights({ quality }: { quality: Quality }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.shadow.camera.left = -7;
    l.shadow.camera.right = 7;
    l.shadow.camera.top = 7;
    l.shadow.camera.bottom = -7;
    l.shadow.camera.near = 1;
    l.shadow.camera.far = 30;
    l.shadow.bias = -0.0006;
    l.shadow.normalBias = 0.02;
    l.shadow.camera.updateProjectionMatrix();
  }, []);
  return (
    <>
      <hemisphereLight args={['#DDEEFF', '#6F5B3E', 1.15]} />
      <directionalLight
        ref={sun}
        position={[-6, 11, 7]}
        intensity={2.4}
        color="#FFE6C4"
        castShadow={quality !== 'low'}
        shadow-mapSize-width={quality === 'high' ? 2048 : 1024}
        shadow-mapSize-height={quality === 'high' ? 2048 : 1024}
      />
    </>
  );
}

const SEA_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SEA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  varying vec3 vWorld;
  void main() {
    float r = length(vWorld.xz);
    float a = atan(vWorld.z, vWorld.x);
    vec3 c = mix(uShallow, uDeep, smoothstep(4.7, 8.0, r));
    // Ripples catching the light.
    float w = sin(vWorld.x * 3.1 + uTime * 1.3) * sin(vWorld.z * 2.6 - uTime * 1.05)
            + 0.5 * sin((vWorld.x + vWorld.z) * 5.3 - uTime * 1.9);
    c += w * 0.025 * (1.0 - smoothstep(6.0, 16.0, r));
    // Foam where the waves meet the beach, breathing in and out.
    float shore = 4.72 + 0.06 * sin(a * 9.0 + uTime * 0.7) + 0.05 * sin(uTime * 0.9);
    float band = 1.0 - smoothstep(0.0, 0.14 + 0.05 * sin(uTime * 1.6 + a * 5.0), abs(r - shore - 0.1));
    float edge = 1.0 - smoothstep(0.0, 0.05, abs(r - shore - 0.3 - 0.05 * sin(uTime * 1.2 + a * 7.0)));
    c = mix(c, uFoam, clamp(band * 0.8 + edge * 0.35, 0.0, 1.0));
    c = mix(c, uSky, smoothstep(16.0, 34.0, r));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Sea() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SEA_VERTEX,
        fragmentShader: SEA_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uDeep: { value: new THREE.Color(COLORS.sea) },
          uShallow: { value: new THREE.Color(COLORS.shallow) },
          uFoam: { value: new THREE.Color(COLORS.foam) },
          uSky: { value: new THREE.Color(SKY) },
        },
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => {
    mat.uniforms.uTime!.value = clock.elapsedTime;
  });
  return (
    <mesh material={mat} rotation-x={-Math.PI / 2} position-y={0.02}>
      <planeGeometry args={[90, 90, 1, 1]} />
    </mesh>
  );
}

// ---- The island ----------------------------------------------------------------

/** What grows on each land, and how much of it per hex. */
const DECOR: Record<Terrain, { make: () => THREE.BufferGeometry; n: number; scale?: [number, number] }[]> = {
  wood: [{ make: treeGeometry, n: 9, scale: [0.85, 1.25] }],
  wool: [
    { make: sheepGeometry, n: 4, scale: [0.9, 1.1] },
    { make: bushGeometry, n: 4, scale: [0.7, 1.2] },
  ],
  grain: [],
  brick: [
    { make: clayGeometry, n: 3, scale: [0.8, 1.15] },
    { make: rockGeometry, n: 2, scale: [0.7, 1] },
  ],
  ore: [
    { make: peakGeometry, n: 3, scale: [0.8, 1.25] },
    { make: rockGeometry, n: 3, scale: [0.8, 1.2] },
  ],
  desert: [
    { make: duneGeometry, n: 3, scale: [0.8, 1.2] },
    { make: palmGeometry, n: 2, scale: [0.9, 1.1] },
  ],
};

function Island({
  board,
  seed,
  robber,
  quality,
  glow,
}: {
  board: Board;
  seed: number;
  robber: number;
  quality: Quality;
  glow: RefObject<{ total: number; at: number } | null>;
}) {
  const mat = useMaterial(quality);
  const tileMat = useMaterial(quality, { roughness: 0.92 });
  const built = useMemo(() => buildIsland(board, seed, mat, tileMat), [board, seed, mat, tileMat]);
  useEffect(() => () => built.dispose(), [built]);

  const base = useMemo(() => board.terrain.map((t) => new THREE.Color(COLORS.terrain[t])), [board]);
  const tmp = useMemo(() => new THREE.Color(), []);
  const lit = useRef(false);
  useFrame(({ clock }) => {
    const g = glow.current;
    const t = g ? clock.elapsedTime - g.at : Infinity;
    if (t > 2.2) {
      if (lit.current) {
        base.forEach((c, h) => built.tops.setColorAt(h, c));
        built.tops.instanceColor!.needsUpdate = true;
        lit.current = false;
      }
      return;
    }
    lit.current = true;
    // Two soft pulses on the lands that paid out.
    const pulse = Math.max(0, Math.sin((t / 2.2) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) * (1 - t / 2.2);
    base.forEach((c, h) => {
      const paid = board.numbers[h] === g!.total && h !== robber;
      built.tops.setColorAt(h, paid ? tmp.copy(c).lerp(new THREE.Color('#FFF6C8'), pulse * 0.75) : c);
    });
    built.tops.instanceColor!.needsUpdate = true;
  });

  return (
    <group>
      {built.objects.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </group>
  );
}

function buildIsland(board: Board, seed: number, mat: THREE.Material, tileMat: THREE.Material) {
  const objects: THREE.Object3D[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const { hexes } = TOPOLOGY;

  // The beach under it all, a little uneven at the water's edge.
  const sand = new THREE.CylinderGeometry(4.78, 4.95, 0.16, 56, 1);
  const pos = sand.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.5) continue;
    const a = Math.atan2(z, x);
    const k = 1 + 0.025 * Math.sin(a * 7 + 1.3) + 0.018 * Math.sin(a * 13);
    pos.setXYZ(i, x * k, pos.getY(i), z * k);
  }
  sand.computeVertexNormals();
  const beach = merge([piece(sand, COLORS.sand, { at: [0, 0.08, 0] })]);
  geos.push(beach);
  const beachMesh = new THREE.Mesh(beach, mat);
  beachMesh.receiveShadow = true;
  objects.push(beachMesh);

  // The tiles: shared earth sides, tops tinted per land.
  const tile = tileGeometry();
  const side = merge([piece(tile.side, COLORS.earth)]);
  const top = merge([piece(tile.top, '#FFFFFF')]);
  geos.push(side, top);
  const sides = new THREE.InstancedMesh(side, tileMat, hexes.length);
  const tops = new THREE.InstancedMesh(top, tileMat, hexes.length);
  const m = new THREE.Matrix4();
  hexes.forEach((h, i) => {
    m.makeTranslation(h.x, 0.04, h.y);
    sides.setMatrixAt(i, m);
    tops.setMatrixAt(i, m);
    tops.setColorAt(i, new THREE.Color(COLORS.terrain[board.terrain[i]!]));
  });
  for (const im of [sides, tops]) {
    im.receiveShadow = true;
    im.castShadow = true;
    objects.push(im);
  }

  // What grows on each land.
  const random = mulberry32(seed ^ 0x51ed);
  const spots = new Map<() => THREE.BufferGeometry, { m: THREE.Matrix4[] }>();
  const taken: { x: number; z: number; r: number }[] = [];
  const place = (cx: number, cz: number, r: number) => {
    for (let tries = 0; tries < 30; tries++) {
      const a = random() * Math.PI * 2;
      const d = 0.38 + random() * 0.42;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r)) continue;
      taken.push({ x, z, r });
      return { x, z };
    }
    return null;
  };
  hexes.forEach((h, i) => {
    const land = board.terrain[i]!;
    taken.length = 0;
    // Keep the middle clear for the number token.
    taken.push({ x: h.x, z: h.y, r: 0.28 });
    if (land === 'grain') {
      const turn = random() * Math.PI;
      for (let row = -2; row <= 2; row++) {
        const off = row * 0.15;
        const x = h.x + Math.cos(turn + Math.PI / 2) * off * 1;
        const z = h.y + Math.sin(turn + Math.PI / 2) * off * 1;
        for (const side of [-1, 1]) {
          // Two half-rows either side of the token, shorter towards the hex's edge.
          const len = 1 - Math.abs(row) * 0.22;
          const along = side * 0.42;
          const sx = x + Math.cos(turn) * along;
          const sz = z + Math.sin(turn) * along;
          const mm = new THREE.Matrix4().compose(
            new THREE.Vector3(sx, TILE_TOP + 0.04, sz),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -turn),
            new THREE.Vector3(len * 0.55, 1, 1),
          );
          const list = spots.get(wheatGeometry) ?? { m: [] };
          list.m.push(mm);
          spots.set(wheatGeometry, list);
        }
      }
      return;
    }
    for (const d of DECOR[land]) {
      for (let k = 0; k < d.n; k++) {
        const s = d.scale ? d.scale[0] + random() * (d.scale[1] - d.scale[0]) : 1;
        const at = place(h.x, h.y, 0.11 * s);
        if (!at) continue;
        const mm = new THREE.Matrix4().compose(
          new THREE.Vector3(at.x, TILE_TOP + 0.04, at.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
          new THREE.Vector3(s, s, s),
        );
        const list = spots.get(d.make) ?? { m: [] };
        list.m.push(mm);
        spots.set(d.make, list);
      }
    }
  });
  for (const [make, { m: ms }] of spots) {
    const g = make();
    geos.push(g);
    const im = new THREE.InstancedMesh(g, mat, ms.length);
    ms.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = true;
    im.receiveShadow = true;
    objects.push(im);
  }

  // Number tokens and harbours never move: each lot is merged into one shape, one draw.
  const tokenGeo = new Map<number, THREE.BufferGeometry>();
  const still: THREE.BufferGeometry[] = [];
  const placed = (g: THREE.BufferGeometry, x: number, y: number, z: number, turn = 0) =>
    g.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(turn).setPosition(x, y, z));
  hexes.forEach((h, i) => {
    const n = board.numbers[i];
    if (n == null) return;
    let g = tokenGeo.get(n);
    if (!g) {
      g = tokenGeometry(n);
      tokenGeo.set(n, g);
    }
    still.push(placed(g, h.x, TILE_TOP + 0.002, h.y));
  });
  const pier = pierGeometry();
  for (const port of board.ports) {
    const e = TOPOLOGY.edges[port.edge]!;
    const h = hexes[e.hexes[0]!]!;
    const nx = e.x - h.x;
    const nz = e.y - h.y;
    const len = Math.hypot(nx, nz);
    const ux = nx / len;
    const uz = nz / len;
    still.push(placed(pier, e.x, 0.04, e.y, -Math.atan2(uz, ux)));
    const label = portLabel(port.kind === 'any' ? '3:1' : '2:1', port.kind === 'any' ? COLORS.wood : COLORS.terrain[port.kind]);
    still.push(placed(label, e.x + ux * 0.48, 0.19, e.y + uz * 0.48));
    label.dispose();
  }
  pier.dispose();
  for (const g of tokenGeo.values()) g.dispose();
  const fixtures = merge(still);
  geos.push(fixtures);
  const fixed = new THREE.Mesh(fixtures, mat);
  fixed.castShadow = true;
  fixed.receiveShadow = true;
  objects.push(fixed);

  return {
    objects,
    tops,
    dispose() {
      for (const g of geos) g.dispose();
      for (const o of objects) if (o instanceof THREE.InstancedMesh) o.dispose();
    },
  };
}

const TOKEN_PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function tokenGeometry(n: number) {
  const ink = n === 6 || n === 8 ? COLORS.red : COLORS.ink;
  const pips = TOKEN_PIPS[n]!;
  return merge([
    piece(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 28), '#C9B48B', { at: [0, 0.015, 0] }),
    piece(new THREE.CylinderGeometry(0.29, 0.3, 0.03, 28), COLORS.cream, { at: [0, 0.04, 0] }),
    piece(textGeometry(String(n), n >= 10 ? 0.2 : 0.23, 0.15, 0.012), ink, { at: [0, 0.055, -0.03] }),
    ...Array.from({ length: pips }, (_, i) =>
      piece(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 8), ink, { at: [(i - (pips - 1) / 2) * 0.052, 0.058, 0.17] }),
    ),
  ]);
}

function portLabel(text: string, color: string) {
  return merge([
    piece(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 24), color, { at: [0, 0, 0] }),
    piece(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), COLORS.cream, { at: [0, 0.01, 0] }),
    piece(textGeometry(text, 0.12, 0.16, 0.012), COLORS.ink, { at: [0, 0.028, 0] }),
  ]);
}

// ---- Pieces --------------------------------------------------------------------

function usePlayerMaterials(quality: Quality) {
  const mats = useMemo(
    () =>
      PLAYER_COLORS.map((c) =>
        quality === 'low'
          ? new THREE.MeshLambertMaterial({ vertexColors: true, color: c })
          : new THREE.MeshStandardMaterial({ vertexColors: true, color: c, roughness: 0.55 }),
      ),
    [quality],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  return mats;
}

const shapes = { town: townGeometry(), city: cityGeometry(), road: roadGeometry() };

function Pieces({ state, quality }: { state: IsleState; quality: Quality }) {
  const mats = usePlayerMaterials(quality);
  // Pieces already on the board when it first shows don't drop in.
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return (
    <group>
      {state.roads.map((p, e) => {
        if (p == null) return null;
        const edge = TOPOLOGY.edges[e]!;
        return (
          <Drop key={`r${e}`} x={edge.x} z={edge.y} still={first.current}>
            <mesh geometry={shapes.road} material={mats[p]} rotation-y={-edge.angle} scale={[1, 1.35, 1.3]} castShadow receiveShadow />
          </Drop>
        );
      })}
      {state.towns.map((t, v) => {
        if (!t) return null;
        const vert = TOPOLOGY.verts[v]!;
        return (
          <Drop key={`t${v}${t.city ? 'c' : ''}`} x={vert.x} z={vert.y} still={first.current}>
            <mesh
              geometry={t.city ? shapes.city : shapes.town}
              material={mats[t.p]}
              rotation-y={((v * 47) % 6) * (Math.PI / 3)}
              scale={t.city ? 1.45 : 1.55}
              castShadow
              receiveShadow
            />
          </Drop>
        );
      })}
    </group>
  );
}

/** Drops a new piece in from above with a small bounce. */
function Drop({ x, z, still, children }: { x: number; z: number; still: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(still ? -10 : null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (born.current == null) born.current = clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    if (t > 0.6) {
      g.position.y = TILE_TOP;
      g.scale.setScalar(1);
      return;
    }
    // A fall, then two small bounces.
    const fall = Math.max(0, 1 - t / 0.28);
    const bounce = t > 0.28 ? Math.abs(Math.sin(((t - 0.28) / 0.32) * Math.PI * 2)) * 0.06 * (1 - (t - 0.28) / 0.32) : 0;
    g.position.y = TILE_TOP + fall * fall * 0.9 + bounce;
    const squash = t > 0.26 && t < 0.36 ? 1 - 0.12 * Math.sin(((t - 0.26) / 0.1) * Math.PI) : 1;
    g.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  });
  return (
    <group ref={ref} position={[x, TILE_TOP + (still ? 0 : 0.9), z]}>
      {children}
    </group>
  );
}

const robberShape = robberGeometry();

function Robber({ hex, quality }: { hex: number; quality: Quality }) {
  const mat = useMaterial(quality, { roughness: 0.4, metalness: 0.15 });
  const ref = useRef<THREE.Mesh>(null);
  const from = useRef<{ x: number; z: number; at: number } | null>(null);
  const spot = (h: number) => ({ x: TOPOLOGY.hexes[h]!.x + 0.36, z: TOPOLOGY.hexes[h]!.y - 0.16 });
  const target = spot(hex);
  const last = useRef(hex);
  const clock = useThree((t) => t.clock);
  if (last.current !== hex) {
    const m = ref.current;
    from.current = { x: m?.position.x ?? target.x, z: m?.position.z ?? target.z, at: clock.elapsedTime };
    last.current = hex;
  }
  useFrame(({ clock: c }) => {
    const m = ref.current;
    if (!m) return;
    const f = from.current;
    if (!f) {
      m.position.set(target.x, TILE_TOP, target.z);
      return;
    }
    const t = Math.min(1, (c.elapsedTime - f.at) / 0.7);
    const e = t * t * (3 - 2 * t);
    m.position.set(f.x + (target.x - f.x) * e, TILE_TOP + Math.sin(t * Math.PI) * 0.9, f.z + (target.z - f.z) * e);
    if (t >= 1) from.current = null;
  });
  return <mesh ref={ref} geometry={robberShape} material={mat} position={[target.x, TILE_TOP, target.z]} castShadow />;
}

// ---- Where a piece can go ----------------------------------------------------

const markShapes = {
  vert: new THREE.TorusGeometry(0.12, 0.028, 8, 28).rotateX(Math.PI / 2),
  vertDot: new THREE.CircleGeometry(0.1, 24).rotateX(-Math.PI / 2),
  edge: new THREE.BoxGeometry(0.46, 0.02, 0.11),
  hex: new THREE.RingGeometry(0.72, 0.86, 6, 1, Math.PI / 2).rotateX(-Math.PI / 2),
};

function MarkSpots({ marks }: { marks?: Marks }) {
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#FFF1A0', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    [],
  );
  const soft = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#FFF8D0', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
    [],
  );
  useEffect(
    () => () => {
      mat.dispose();
      soft.dispose();
    },
    [mat, soft],
  );
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const p = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4);
    mat.opacity = 0.55 + 0.4 * p;
    soft.opacity = 0.2 + 0.25 * p;
    group.current?.children.forEach((c) => {
      if (c.userData.pulse) c.scale.setScalar(0.92 + 0.12 * p);
    });
  });
  if (!marks) return null;
  const y = TILE_TOP + 0.05;
  return (
    <group ref={group}>
      {marks.verts?.map((v) => {
        const p = TOPOLOGY.verts[v]!;
        return (
          <group key={`v${v}`} position={[p.x, y, p.y]} userData={{ pulse: true }}>
            <mesh geometry={markShapes.vert} material={mat} renderOrder={5} />
            <mesh geometry={markShapes.vertDot} material={soft} renderOrder={5} />
          </group>
        );
      })}
      {marks.edges?.map((e) => {
        const p = TOPOLOGY.edges[e]!;
        return (
          <mesh
            key={`e${e}`}
            geometry={markShapes.edge}
            material={mat}
            position={[p.x, y, p.y]}
            rotation-y={-p.angle}
            renderOrder={5}
            userData={{ pulse: true }}
          />
        );
      })}
      {marks.hexes?.map((h) => {
        const p = TOPOLOGY.hexes[h]!;
        return <mesh key={`h${h}`} geometry={markShapes.hex} material={mat} position={[p.x, y - 0.03, p.y]} renderOrder={5} />;
      })}
    </group>
  );
}

// ---- Dice ----------------------------------------------------------------------

const TRAY = new THREE.Vector3(6.1, 0, 0.9);
const DIE = 0.3;
const dieShape = dieGeometry(DIE);

function trayGeometry() {
  const parts = [piece(new THREE.BoxGeometry(1.5, 0.08, 1.1), COLORS.wood, { at: [0, 0.1, 0] })];
  for (const z of [-0.5, 0.5]) parts.push(piece(new THREE.BoxGeometry(1.5, 0.1, 0.08), COLORS.woodDark, { at: [0, 0.17, z] }));
  for (const x of [-0.72, 0.72]) parts.push(piece(new THREE.BoxGeometry(0.08, 0.1, 1.1), COLORS.woodDark, { at: [x, 0.17, 0] }));
  for (const z of [-0.25, 0, 0.25]) parts.push(piece(new THREE.BoxGeometry(1.42, 0.005, 0.01), COLORS.woodDark, { at: [0, 0.142, z] }));
  return merge(parts);
}

function Dice({ state, quality, onLanded }: { state: IsleState; quality: Quality; onLanded: (total: number) => void }) {
  const mat = useMaterial(quality, { roughness: 0.35 });
  const tray = useMemo(() => trayGeometry(), []);
  useEffect(() => () => tray.dispose(), [tray]);
  const dice = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const roll = lastRoll(state);
  const shown = useRef<number | null>(roll?.key ?? null);
  const anim = useRef<{ at: number | null; d: [number, number]; spin: number; told: boolean } | null>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;
  if (roll && roll.key !== shown.current) {
    shown.current = roll.key;
    anim.current = { at: null, d: roll.d, spin: roll.key, told: false };
  }
  const values = roll?.d ?? [3, 4];

  // Where each die rests, and how it ends up turned.
  const rest = (i: number, spin: number) => {
    const r = mulberry32(spin * 7 + i);
    return {
      pos: new THREE.Vector3(TRAY.x + (i ? 0.26 : -0.26) + (r() - 0.5) * 0.18, 0.14 + DIE / 2, TRAY.z + (r() - 0.5) * 0.3),
      yaw: r() * Math.PI * 2,
    };
  };

  const q = useMemo(() => new THREE.Quaternion(), []);
  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  const yawQ = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const axis = useMemo(() => [new THREE.Vector3(1, 0.3, 0.6).normalize(), new THREE.Vector3(-0.7, 0.2, 1).normalize()], []);

  useFrame(({ clock }) => {
    const a = anim.current;
    dice.forEach((ref, i) => {
      const m = ref.current;
      if (!m) return;
      const v = a ? a.d[i]! : values[i]!;
      const r = rest(i, a ? a.spin : (shown.current ?? 0));
      yawQ.setFromAxisAngle(up, r.yaw);
      q.copy(yawQ).multiply(dieFacing(v));
      if (!a) {
        m.position.copy(r.pos);
        m.quaternion.copy(q);
        return;
      }
      if (a.at == null) a.at = clock.elapsedTime;
      const t = Math.min(1, (clock.elapsedTime - a.at) / 1.15);
      // Thrown in from the island's side: an arc, a bounce, then settling with the right face up.
      const fly = Math.min(1, t / 0.6);
      const startX = r.pos.x - 1.6;
      const x = startX + (r.pos.x - startX) * (1 - (1 - fly) * (1 - fly));
      const hop = t < 0.6 ? Math.sin(fly * Math.PI) * 0.9 : Math.abs(Math.sin(((t - 0.6) / 0.4) * Math.PI)) * 0.12 * (1 - (t - 0.6) / 0.4);
      m.position.set(x, r.pos.y + Math.max(0, hop), r.pos.z + (1 - fly) * (i ? -0.35 : 0.35));
      spinQ.setFromAxisAngle(axis[i]!, (1 - t) * (1 - t) * Math.PI * 6);
      m.quaternion.copy(spinQ).multiply(q);
    });
    if (a && a.at != null && clock.elapsedTime - a.at >= 1.15) {
      if (!a.told) {
        a.told = true;
        landed.current(a.d[0] + a.d[1]);
      }
      anim.current = null;
    }
  });

  return (
    <group>
      <mesh geometry={tray} material={mat} position={[TRAY.x, 0, TRAY.z]} castShadow receiveShadow />
      {dice.map((ref, i) => (
        <mesh key={i} ref={ref} geometry={dieShape} material={mat} castShadow />
      ))}
    </group>
  );
}

// ---- The camera ----------------------------------------------------------------

function CameraRig({ onReady }: { onReady?: (api: IsleBoardApi) => void }) {
  const camera = useThree((t) => t.camera) as THREE.PerspectiveCamera;
  const size = useThree((t) => t.size);
  const home = () => ({ x: 0.9, z: 0.4, d: size.width / size.height < 1.2 ? 15 : 10 });
  const want = useRef(home());
  const now = useRef({ ...want.current });

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 7);
    const n = now.current;
    const w = want.current;
    n.x += (w.x - n.x) * k;
    n.z += (w.z - n.z) * k;
    n.d += (w.d - n.d) * k;
    camera.position.set(n.x, n.d * Math.sin(PITCH), n.z + n.d * Math.cos(PITCH));
    camera.lookAt(n.x, 0, n.z);
  });

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_TOP);
    const hit = new THREE.Vector3();
    const clampView = () => {
      const w = want.current;
      w.d = Math.min(16, Math.max(5, w.d));
      const r = Math.hypot(w.x, w.z);
      const max = 5.2;
      if (r > max) {
        w.x *= max / r;
        w.z *= max / r;
      }
    };
    onReady?.({
      pick(ndcX, ndcY) {
        camera.updateMatrixWorld();
        ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : null;
      },
      zoomBy(f) {
        want.current.d *= f;
        clampView();
      },
      panBy(dx, dy) {
        const span = 2 * want.current.d * Math.tan(((camera.fov ?? 55) * Math.PI) / 360);
        want.current.x -= dx * span;
        want.current.z -= (dy * span) / Math.sin(PITCH);
        clampView();
      },
      focus(x, y) {
        want.current.x = x;
        want.current.z = y;
        want.current.d = Math.min(want.current.d, 9);
        clampView();
      },
      reset() {
        want.current = home();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, onReady]);

  return null;
}

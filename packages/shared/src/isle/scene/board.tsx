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
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Component, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import type { Quality } from '../../house/scene/materials';
import { mulberry32 } from '../../rng';
import { TOPOLOGY, type Board, type Terrain } from '../board';
import type { Marks, Picked } from '../pick';
import type { IsleState } from '../rules';
import { textGeometry } from './glyphs';
import {
  boatGeometry,
  bushGeometry,
  coastRockGeometry,
  contactShadowGeometry,
  cityGeometry,
  clayGeometry,
  COLORS,
  dieFacing,
  dieGeometry,
  duneGeometry,
  farIslandGeometry,
  harbourGeometry,
  merge,
  palmGeometry,
  peakGeometry,
  piece,
  PLAYER_COLORS,
  roadGeometry,
  robberGeometry,
  rockGeometry,
  sheepGeometry,
  tileGeometry,
  TILE_FACE,
  TILE_TOP,
  townGeometry,
  treeGeometry,
  wheatGeometry,
} from './parts';

const SKY = '#A9D8E8';
/** The camera's tilt above the table: the usual three-quarter view, up to straight down from above. */
const PITCH_LOW = (54 * Math.PI) / 180;
const PITCH_TOP = (89.5 * Math.PI) / 180;
const pitchAt = (tilt: number) => PITCH_LOW + (PITCH_TOP - PITCH_LOW) * tilt;

export interface IsleBoardApi {
  /** Where on the board (board units: x across, y down the table) a point on screen lands, from -1..1 coordinates. */
  pick(ndcX: number, ndcY: number): { x: number; y: number } | null;
  /** Where a spot on the board (board units, on the tiles' tops) shows on screen, in -1..1 coordinates. */
  toScreen(x: number, y: number): { x: number; y: number };
  /** Closer (below 1) or further (above 1). */
  zoomBy(factor: number): void;
  /** Slides the view by a share of the screen's height. */
  panBy(dx: number, dy: number): void;
  /** Tilts towards the top view (positive) or back (negative), by a share of the screen's height. */
  tiltBy(delta: number): void;
  /** Glides to the top view, or back to the usual one; says which it's going to. */
  toggleTop(): 'top' | 'tilted';
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
  /** Pictures for the lands' tiles; a land without one is drawn in 3D. */
  hexArt?: HexArt;
  /** The dice tray beside the island (off when the screen shows its own dice). */
  showDice?: boolean;
  /** The marked spot under the pointer, drawn brighter. */
  hover?: Picked | null;
  /** Room taken by the screen's panels round the edges, in pixels: the island is framed in what's left. */
  inset?: Inset;
}

export interface Inset {
  left: number;
  right: number;
  top: number;
  bottom: number;
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

/**
 * The board. Memoised: the screen around it re-renders often (a hover, a
 * note, a panel), and none of that should touch the scene unless its own
 * props change.
 */
export const IsleBoard = memo(function IsleBoard({ state, marks, quality = 'medium', onReady, onRolled, hexArt, showDice = true, hover = null, inset }: IsleBoardProps) {
  const glow = useRef<{ total: number; at: number } | null>(null);
  const clock = useThree((t) => t.clock);
  const gl = useThree((t) => t.gl);
  // Shadows are drawn again only when something that casts one moves (see shadowsMoved), not every frame.
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, state]);
  const shore = useMemo(() => coastline(), []);
  const outline = useMemo(() => islandOutline(shore, state.board), [shore, state.board]);
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 22, 46]} />
      <Lights quality={quality} />
      <Sea shore={shore} />
      <FarIslands />
      <Island board={state.board} seed={state.seed} robber={state.robber} quality={quality} glow={glow} pictured={hexArt} shore={shore} />
      {hexArt ? <HexPictures board={state.board} art={hexArt} robber={state.robber} glow={glow} /> : null}
      <Boats board={state.board} quality={quality} />
      <Pieces state={state} quality={quality} />
      <Robber hex={state.robber} quality={quality} moving={state.phase === 'robber'} />
      <MarkSpots marks={marks} hover={hover} />
      <Dice
        state={state}
        quality={quality}
        visible={showDice}
        onLanded={(total) => {
          if (total !== 7) glow.current = { total, at: clock.elapsedTime };
          onRolled?.(total);
        }}
      />
      <CameraRig onReady={onReady} beside={showDice} inset={inset} outline={outline} />
    </>
  );
});

/** Something that casts a shadow moved this frame: draw the shadows again. */
const shadowsMoved = (gl: THREE.WebGLRenderer) => {
  gl.shadowMap.needsUpdate = true;
};

// ---- The coast -----------------------------------------------------------------

/** How many points round the coastline (one every 5°). */
const SHORE_N = 72;
/** How far the beach reaches past the tiles' edge. */
const BEACH = 0.3;

const SQRT3_2 = Math.sqrt(3) / 2;
function onLand(x: number, y: number) {
  return TOPOLOGY.hexes.some((h) => {
    const dx = Math.abs(x - h.x);
    const dy = Math.abs(y - h.y);
    return dx <= SQRT3_2 && dx * 0.5 + dy * SQRT3_2 <= SQRT3_2;
  });
}

/**
 * The island's shoreline: for each angle round the middle (board x, y; the
 * scene's x, z), how far out the beach ends. It follows the tiles' outline,
 * widened by the beach and rounded off so it reads as a coast, not a hexagon.
 */
export function coastline(): number[] {
  const edge = Array.from({ length: SHORE_N * 4 }, (_, i) => {
    const a = (i / (SHORE_N * 4)) * Math.PI * 2;
    let r = 7;
    while (r > 0 && !onLand(Math.cos(a) * r, Math.sin(a) * r)) r -= 0.02;
    return r;
  });
  // Widened: the furthest land within a few degrees, so the beach wraps the corners.
  const k = edge.length;
  const wide = edge.map((_, i) => Math.max(...[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => edge[(i + d + k) % k]!)));
  return Array.from({ length: SHORE_N }, (_, j) => {
    let sum = 0;
    for (let d = -3; d <= 3; d++) sum += wide[(j * 4 + d + k) % k]!;
    return sum / 7 + BEACH + 0.04 * Math.sin(j * 1.7) + 0.03 * Math.sin(j * 0.9 + 1);
  });
}

/** The shoreline's radius at an angle (radians, atan2 of the scene's z and x). */
function shoreAt(shore: number[], a: number) {
  const f = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * SHORE_N;
  const i = Math.floor(f);
  const t = f - i;
  return shore[i % SHORE_N]! * (1 - t) + shore[(i + 1) % SHORE_N]! * t;
}

/** The beach: a flat top following the shoreline, sloping down into the water all round. */
function beachGeometry(shore: number[]) {
  const top: number[] = [];
  const skirt: number[] = [];
  const y = 0.16;
  for (let j = 0; j < SHORE_N; j++) {
    const a0 = (j / SHORE_N) * Math.PI * 2;
    const a1 = ((j + 1) / SHORE_N) * Math.PI * 2;
    const r0 = shore[j]!;
    const r1 = shore[(j + 1) % SHORE_N]!;
    const p0 = [Math.cos(a0) * r0, y, Math.sin(a0) * r0];
    const p1 = [Math.cos(a1) * r1, y, Math.sin(a1) * r1];
    const q0 = [Math.cos(a0) * (r0 + 0.3), -0.2, Math.sin(a0) * (r0 + 0.3)];
    const q1 = [Math.cos(a1) * (r1 + 0.3), -0.2, Math.sin(a1) * (r1 + 0.3)];
    top.push(0, y, 0, ...p1, ...p0);
    skirt.push(...p0, ...p1, ...q1, ...p0, ...q1, ...q0);
  }
  const make = (v: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  };
  return merge([piece(make(top), COLORS.sand), piece(make(skirt), COLORS.sandDark)]);
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
      {/* Less flat sky light and a stronger warm sun: deeper colour and real shading. */}
      <hemisphereLight args={['#DDEEFF', '#6F5B3E', 0.8]} />
      <directionalLight
        ref={sun}
        position={[-6, 11, 7]}
        intensity={2.9}
        color="#FFE2B8"
        castShadow={quality !== 'low'}
        shadow-mapSize-width={quality === 'high' ? 2048 : 1024}
        shadow-mapSize-height={quality === 'high' ? 2048 : 1024}
      />
    </>
  );
}

const SEA_VERTEX = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vXZ = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/**
 * The sea, drawn per pixel. Its moving texture is gradient (simplex) noise,
 * which has no grid to show: products of sines along x and z, used before,
 * lay a lattice of square cells over the water. Every fine detail fades out
 * where it gets smaller than about a pixel (fwidth), so far water and the
 * screen's edges never alias into blocks; and the colour is dithered so the
 * soft gradients don't step into bands on an 8-bit screen.
 *
 * No number the GPU sees grows with time. Phone GPUs work out sin() of a
 * large argument coarsely, so a wave written as sin(x * k + time * w) breaks
 * into stepped blocks once time has run a few minutes (worse further from
 * the middle, where x is large): that was the phone's square, flickering
 * sea. Every phase is wrapped to one turn on the CPU (uPhase) and every
 * drift of the noise kept within a small range (uDrift) before it's sent.
 */
const SEA_FRAGMENT = /* glsl */ `
  // Wrapped wave phases (radians, 0..2π): rolling waves, the foam's lap, its breath, the outer foam line.
  uniform vec4 uPhase;
  // How far each layer of noise has drifted, kept small: patches, two ripple layers, light on the sand.
  uniform vec4 uDriftA;
  uniform vec4 uDriftB;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  uniform float uShore[${SHORE_N}];
  varying vec2 vXZ;

  // 2D simplex noise (Ashima Arts / Stefan Gustavson, MIT), -1..1.
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  /** How much of a pattern at this scale survives: 1 while it's several pixels across, fading to 0 by one pixel. */
  float keep(float scale) {
    float px = fwidth(vXZ.x * scale) + fwidth(vXZ.y * scale);
    return 1.0 - smoothstep(0.35, 0.9, px);
  }

  void main() {
    vec2 p = vXZ;
    float r = length(p);
    float a = atan(p.y, p.x);
    // The shoreline here, from the island's outline.
    float f = fract(a / 6.2831853 + 1.0) * ${SHORE_N}.0;
    int i = int(floor(f));
    int j = i + 1 >= ${SHORE_N} ? 0 : i + 1;
    float off = r - mix(uShore[i], uShore[j], fract(f));

    // Turquoise over the sand near the beach, deepening further out, in slow drifting patches.
    float patchy = snoise(p * 0.13 + uDriftA.xy);
    vec3 c = mix(uShallow, uDeep, smoothstep(0.1, 3.3 + patchy * 0.8, off));
    c = mix(c, uDeep * 0.8, smoothstep(5.0, 13.0, off) * (0.55 + 0.15 * patchy));

    // Ripples catching the light: two layers of noise drifting different ways, the finer one fading with distance.
    float near = 1.0 - smoothstep(5.0, 16.0, off);
    float ripple = snoise(p * 0.85 + uDriftA.zw) * 0.6
                 + snoise(p * 2.2 + uDriftB.xy) * 0.4 * keep(2.2);
    c += ripple * 0.035 * near * keep(0.85);

    // Light dancing on the sand under the shallows: the bright ridges where noise crosses zero.
    float n = snoise(p * 2.6 + uDriftB.zw) + 0.5 * snoise(p * 4.1 - uDriftB.wz * 0.8);
    float caustic = pow(1.0 - min(1.0, abs(n)), 7.0) * keep(4.1);
    c += caustic * 0.09 * (1.0 - smoothstep(0.2, 1.9, off));

    // Waves rolling in towards the beach, fading as they come (smoothed below a pixel too). Only near the
    // beach, so the sine's argument stays small.
    float nearBeach = 1.0 - smoothstep(0.3, 1.6, off);
    float rollK = 1.0 - smoothstep(0.3, 0.9, fwidth(off * 9.0));
    float roll = sin(clamp(off, -1.0, 2.0) * 9.0 + uPhase.x + snoise(vec2(a * 2.0, uDriftA.x)) * 0.8);
    c = mix(c, uFoam, smoothstep(0.86, 1.0, roll) * nearBeach * 0.35 * rollK);

    // Foam where the water meets the sand, breathing in and out.
    float lap = 0.05 * sin(a * 9.0 + uPhase.y) + 0.04 * sin(uPhase.z);
    float band = 1.0 - smoothstep(0.0, 0.12 + 0.04 * sin(uPhase.x + a * 5.0), abs(off - 0.12 - lap));
    float edge = 1.0 - smoothstep(0.0, 0.045 + fwidth(off), abs(off - 0.34 - lap - 0.05 * sin(uPhase.w + a * 7.0)));
    c = mix(c, uFoam, clamp(band * 0.85 + edge * 0.4, 0.0, 1.0));

    // Into the haze on the horizon.
    c = mix(c, uSky, smoothstep(16.0, 36.0, r));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Dither: a fraction of a colour step of noise, so smooth gradients don't band. Interleaved gradient
    // noise, which needs no sin() of a large number (the usual sin-hash breaks into blocks on phones).
    float d = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    gl_FragColor.rgb += (d - 0.5) / 255.0;
  }
`;

const TURN = Math.PI * 2;
/** A wave's phase at a time, wrapped to one turn. */
const phase = (t: number, speed: number) => (t * speed) % TURN;
/**
 * How far a layer of noise has drifted, wrapped into a small range. The
 * slowest layers wrap after hours; the fastest after about half an hour,
 * when its ripples shift once, too small and quick to notice.
 */
const drift = (t: number, speed: number) => (t * speed) % 289;

function Sea({ shore }: { shore: number[] }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SEA_VERTEX,
        fragmentShader: SEA_FRAGMENT,
        uniforms: {
          uPhase: { value: new THREE.Vector4() },
          uDriftA: { value: new THREE.Vector4() },
          uDriftB: { value: new THREE.Vector4() },
          uDeep: { value: new THREE.Color(COLORS.sea) },
          uShallow: { value: new THREE.Color(COLORS.shallow) },
          uFoam: { value: new THREE.Color(COLORS.foam) },
          uSky: { value: new THREE.Color(SKY) },
          uShore: { value: shore },
        },
      }),
    [shore],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const u = mat.uniforms;
    (u.uPhase!.value as THREE.Vector4).set(phase(t, 1.6), phase(t, 0.7), phase(t, 0.9), phase(t, 1.2));
    (u.uDriftA!.value as THREE.Vector4).set(drift(t, 0.011), drift(t, -0.008), drift(t, 0.06), drift(t, 0.035));
    (u.uDriftB!.value as THREE.Vector4).set(drift(t, -0.09), drift(t, 0.07), drift(t, 0.13), drift(t, -0.1));
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
  pictured,
  shore,
}: {
  board: Board;
  seed: number;
  robber: number;
  quality: Quality;
  glow: RefObject<{ total: number; at: number } | null>;
  /** Lands with a picture on their tiles: their 3D trees, sheep and so on aren't drawn. */
  pictured?: HexArt;
  shore: number[];
}) {
  const mat = useMaterial(quality);
  const tileMat = useMaterial(quality, { roughness: 0.92 });
  const plain = useMemo(() => new Set((Object.keys(pictured ?? {}) as Terrain[]).filter((t) => pictured?.[t] != null)), [pictured]);
  const built = useMemo(() => buildIsland(board, seed, mat, tileMat, plain, shore), [board, seed, mat, tileMat, plain, shore]);
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

function buildIsland(board: Board, seed: number, mat: THREE.Material, tileMat: THREE.Material, pictured: ReadonlySet<Terrain>, shore: number[]) {
  const objects: THREE.Object3D[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const { hexes } = TOPOLOGY;

  // The beach under it all, following the island's outline.
  const beach = beachGeometry(shore);
  geos.push(beach);
  const beachMesh = new THREE.Mesh(beach, mat);
  beachMesh.receiveShadow = true;
  objects.push(beachMesh);

  // Rocks along the coast in little clusters, kept clear of the harbours.
  {
    const random = mulberry32(seed ^ 0x70c5);
    const harbours = board.ports.map((port) => {
      const e = TOPOLOGY.edges[port.edge]!;
      return Math.atan2(e.y, e.x);
    });
    const rock = coastRockGeometry();
    geos.push(rock);
    const at: THREE.Matrix4[] = [];
    for (let k = 0; k < 46; k++) {
      const a = random() * Math.PI * 2;
      // Most on the water's edge; a few out at sea, standing alone.
      const far = k >= 38;
      const r = shoreAt(shore, a) + (far ? 0.7 + random() * 1.1 : 0.02 + random() * 0.2);
      const sc = far ? 1.3 + random() * 1.1 : 0.6 + random() * 0.9;
      const n = far ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 3);
      if (harbours.some((h) => Math.abs(Math.atan2(Math.sin(a - h), Math.cos(a - h))) < (far ? 0.4 : 0.24))) continue;
      for (let j = 0; j < n; j++) {
        const aj = a + (random() - 0.5) * 0.07;
        const rj = r + (random() - 0.5) * 0.18;
        const sz = sc * (0.45 + random() * 0.6);
        at.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(Math.cos(aj) * rj, 0.02, Math.sin(aj) * rj),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(random(), random() * 6, random())),
            new THREE.Vector3(sz, sz * 0.8, sz),
          ),
        );
      }
    }
    const rocks = new THREE.InstancedMesh(rock, mat, at.length);
    at.forEach((m, i) => rocks.setMatrixAt(i, m));
    rocks.receiveShadow = true;
    rocks.castShadow = true;
    objects.push(rocks);
  }

  // The tiles: shared earth sides, tops tinted per land.
  const tile = tileGeometry();
  const side = merge([piece(tile.side, COLORS.earth)]);
  const top = merge([piece(tile.top, '#FFFFFF')]);
  geos.push(side, top);
  const sides = new THREE.InstancedMesh(side, tileMat, hexes.length);
  const tops = new THREE.InstancedMesh(top, tileMat, hexes.length);
  const m = new THREE.Matrix4();
  hexes.forEach((h, i) => {
    m.makeTranslation(h.x, 0, h.y);
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
    // Its picture shows what grows there.
    if (pictured.has(land)) return;
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
            new THREE.Vector3(sx, TILE_TOP, sz),
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
          new THREE.Vector3(at.x, TILE_TOP, at.z),
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
    still.push(placed(g, h.x, TILE_TOP + 0.008, h.y));
  });
  for (const port of board.ports) {
    const e = TOPOLOGY.edges[port.edge]!;
    const h = hexes[e.hexes[0]!]!;
    const nx = e.x - h.x;
    const nz = e.y - h.y;
    const len = Math.hypot(nx, nz);
    const ux = nx / len;
    const uz = nz / len;
    still.push(harbourGeometry(TOPOLOGY.verts[e.v[0]]!, TOPOLOGY.verts[e.v[1]]!, { x: ux, y: uz }));
    const label = portLabel(port.kind === 'any' ? '3:1' : '2:1', port.kind === 'any' ? COLORS.wood : COLORS.terrain[port.kind]);
    still.push(placed(label, e.x + ux * 0.62, 0.26, e.y + uz * 0.62));
    label.dispose();
  }
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
    piece(new THREE.CylinderGeometry(0.27, 0.28, 0.03, 28), '#7A5A34', { at: [0, 0.015, 0] }),
    piece(new THREE.CylinderGeometry(0.25, 0.26, 0.03, 28), COLORS.cream, { at: [0, 0.04, 0] }),
    piece(textGeometry(String(n), n >= 10 ? 0.18 : 0.2, 0.13, 0.012), ink, { at: [0, 0.055, -0.03] }),
    ...Array.from({ length: pips }, (_, i) =>
      piece(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 8), ink, { at: [(i - (pips - 1) / 2) * 0.046, 0.058, 0.145] }),
    ),
  ]);
}

/** A harbour's sign: its rate on cream, ringed in the colour of the land it takes (wood for any), on a post. */
function portLabel(text: string, color: string) {
  return merge([
    piece(new THREE.CylinderGeometry(0.03, 0.035, 0.26, 6), COLORS.woodDark, { at: [0, -0.12, 0] }),
    piece(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 28), COLORS.ink, { at: [0, 0, 0] }),
    piece(new THREE.CylinderGeometry(0.25, 0.25, 0.045, 28), color, { at: [0, 0.005, 0] }),
    piece(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 28), COLORS.cream, { at: [0, 0.01, 0] }),
    piece(textGeometry(text, 0.15, 0.2, 0.014), COLORS.ink, { at: [0, 0.036, 0] }),
  ]);
}

// ---- Pictures on the tiles -------------------------------------------------------

/** Each land's picture (a pointy-topped hex, top and bottom corners touching the image's edges): a URL, or on a phone a bundled module. */
export type HexArt = Partial<Record<Terrain, string | number>>;

/** The pictures' file names (scripts/build-isle-hexes.mjs). */
export const HEX_FILES: Record<Terrain, string> = { wood: 'forest', wool: 'pasture', grain: 'fields', brick: 'hills', ore: 'mountains', desert: 'desert' };

/** The pictures served from one folder (the web's public/isle/hex). */
export const hexArtAt = (base: string): HexArt =>
  Object.fromEntries((Object.entries(HEX_FILES) as [Terrain, string][]).map(([t, name]) => [t, `${base}/${name}.png`]));

/** How much of each picture shows: just inside its painted rim, so its rounded corners never peek out. */
const PICTURE_ZOOM = 0.97;
/** The tile's flat top (the bevelled top's upper face). */
const TOP_R = TILE_FACE;
/**
 * A little above the tile's top, and drawn pulled towards the camera
 * (polygon offset): phones often have a coarse (16-bit) depth buffer, where a
 * picture lying almost on its tile flickers through it in blocks.
 */
const TOP_Y = TILE_TOP + 0.006;
const LIFTED = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 } as const;

/** A flat hex lying face up with UVs that put a hex picture on it, north at the top. */
function pictureHexGeometry(y = TOP_Y) {
  const pos: number[] = [0, y, 0];
  const uv: number[] = [0.5, 0.5];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 90) * Math.PI) / 180;
    const x = Math.cos(a) * TOP_R;
    const z = Math.sin(a) * TOP_R;
    pos.push(x, y, z);
    uv.push(0.5 + (x / TOP_R) * 0.5 * PICTURE_ZOOM, 0.5 - (z / TOP_R) * 0.5 * PICTURE_ZOOM);
  }
  const index: number[] = [];
  for (let i = 0; i < 6; i++) index.push(0, 1 + ((i + 1) % 6), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/** Keeps a picture that won't load from taking the board with it: that land just stays plain. */
class PictureCatch extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[isle] a tile picture failed', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The pictures on every tile that has one, and their glow when a roll pays them. */
function HexPictures({
  board,
  art,
  robber,
  glow,
}: {
  board: Board;
  art: HexArt;
  robber: number;
  glow: RefObject<{ total: number; at: number } | null>;
}) {
  const lands = (Object.keys(art) as Terrain[]).filter((t) => art[t] != null && board.terrain.includes(t));
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#FFF1B8',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -8,
      }),
    [],
  );
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  const glowShape = useMemo(() => pictureHexGeometry(TOP_Y + 0.003), []);
  useEffect(() => () => glowShape.dispose(), [glowShape]);
  const [lit, setLit] = useState<number[]>([]);
  const litKey = useRef('');
  useFrame(({ clock }) => {
    const g = glow.current;
    const t = g ? clock.elapsedTime - g.at : Infinity;
    const now = t > 2.2 ? [] : board.numbers.flatMap((n, h) => (n === g!.total && h !== robber && art[board.terrain[h]!] != null ? [h] : []));
    if (now.join() !== litKey.current) {
      litKey.current = now.join();
      setLit(now);
    }
    // Two soft pulses of light over the picture.
    glowMat.opacity = t > 2.2 ? 0 : Math.max(0, Math.sin((t / 2.2) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) * (1 - t / 2.2) * 0.5;
  });
  return (
    <group>
      {lands.map((land) => (
        <PictureCatch key={land}>
          <Suspense fallback={null}>
            <LandPictures source={art[land]!} hexes={board.terrain.flatMap((t, h) => (t === land ? [h] : []))} />
          </Suspense>
        </PictureCatch>
      ))}
      {lit.map((h) => (
        <mesh key={h} geometry={glowShape} material={glowMat} position={[TOPOLOGY.hexes[h]!.x, 0, TOPOLOGY.hexes[h]!.y]} renderOrder={2} />
      ))}
    </group>
  );
}

/** One land's picture on all of its tiles, upright (they're painted with a horizon): one draw. */
function LandPictures({ source, hexes }: { source: string | number; hexes: number[] }) {
  // On a phone the source is a bundled module; three's loader there takes it as it is.
  const tex = useLoader(THREE.TextureLoader, source as unknown as string);
  const mat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, ...LIFTED });
  }, [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  const geo = useMemo(() => pictureHexGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(geo, mat, hexes.length);
    const m = new THREE.Matrix4();
    hexes.forEach((h, i) => im.setMatrixAt(i, m.makeTranslation(TOPOLOGY.hexes[h]!.x, 0, TOPOLOGY.hexes[h]!.y)));
    return im;
  }, [geo, mat, hexes]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

// ---- Out at sea -------------------------------------------------------------------

/** Islands on the horizon, half lost in the haze. */
function FarIslands() {
  const geo = useMemo(() => farIslandGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group>
      {(
        [
          [-15, -11, 1.6, 0.4],
          [17, -9, 1.2, 2.1],
          [-18, 6, 1.3, 1.2],
          [14, 13, 1.8, 4],
        ] as const
      ).map(([x, z, s, turn], i) => (
        <mesh key={i} geometry={geo} material={mat} position={[x, -0.05, z]} scale={[s, s * 0.8, s]} rotation-y={turn} />
      ))}
    </group>
  );
}

/** Boats moored off a few harbours, bobbing on the swell. */
function Boats({ board, quality }: { board: Board; quality: Quality }) {
  const mat = useMaterial(quality, { roughness: 0.7 });
  const geo = useMemo(() => boatGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const spots = useMemo(
    () =>
      board.ports.map((port, i) => {
          const e = TOPOLOGY.edges[port.edge]!;
          const h = TOPOLOGY.hexes[e.hexes[0]!]!;
          const len = Math.hypot(e.x - h.x, e.y - h.y);
          const ux = (e.x - h.x) / len;
          const uz = (e.y - h.y) / len;
          // Moored beside the landing stage, alternating sides, lying along the coast.
          const side = i % 2 ? 1 : -1;
          return { x: e.x + ux * 0.75 - uz * 0.5 * side, z: e.y + uz * 0.75 + ux * 0.5 * side, turn: -Math.atan2(uz, ux) + Math.PI / 2, phase: i * 1.7 };
        }),
    [board],
  );
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const ph = spots[i]!.phase;
      m.position.y = 0.0 + Math.sin(t * 1.3 + ph) * 0.015;
      m.rotation.z = Math.sin(t * 1.1 + ph) * 0.05;
      m.rotation.x = Math.sin(t * 0.9 + ph * 2) * 0.04;
    });
  });
  return (
    <group>
      {spots.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]} rotation-y={b.turn}>
          <mesh ref={(m) => void (refs.current[i] = m)} geometry={geo} material={mat} scale={1.25} />
        </group>
      ))}
    </group>
  );
}

// ---- Pieces --------------------------------------------------------------------

/** Painted wood in each seat's colour: a satin finish, a touch of its own colour in the shade so dark sides stay coloured. */
function usePlayerMaterials(quality: Quality) {
  const mats = useMemo(
    () =>
      PLAYER_COLORS.map((c) =>
        quality === 'low'
          ? new THREE.MeshLambertMaterial({ vertexColors: true, color: c })
          : new THREE.MeshStandardMaterial({ vertexColors: true, color: c, roughness: 0.48, metalness: 0, emissive: new THREE.Color(c).multiplyScalar(0.12) }),
      ),
    [quality],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  return mats;
}

const shapes = {
  town: townGeometry(),
  city: cityGeometry(),
  road: roadGeometry(),
  townShadow: contactShadowGeometry(0.24, 0.22),
  cityShadow: contactShadowGeometry(0.4, 0.3),
  roadShadow: contactShadowGeometry(0.4, 0.13),
};

/**
 * A dark edge round each piece (its own shape drawn again, a little larger,
 * from the inside), so it stands out on any picture; and the soft shadow
 * patch it sits on.
 */
function usePieceTrim() {
  const trim = useMemo(() => ({
    edge: new THREE.MeshBasicMaterial({ color: '#1A120A', side: THREE.BackSide }),
    shadow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, ...LIFTED }),
  }), []);
  useEffect(() => () => {
    trim.edge.dispose();
    trim.shadow.dispose();
  }, [trim]);
  return trim;
}

function PieceMesh({ geometry, material, shadow, trim, outline, edgeScale }: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadow: THREE.BufferGeometry;
  trim: ReturnType<typeof usePieceTrim>;
  outline: boolean;
  edgeScale: [number, number, number];
}) {
  return (
    <>
      <mesh geometry={shadow} material={trim.shadow} position-y={0.012} renderOrder={1} />
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {outline ? <mesh geometry={geometry} material={trim.edge} scale={edgeScale} /> : null}
    </>
  );
}

function Pieces({ state, quality }: { state: IsleState; quality: Quality }) {
  const mats = usePlayerMaterials(quality);
  const trim = usePieceTrim();
  const outline = quality !== 'low';
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
            <group rotation-y={-edge.angle}>
              <PieceMesh geometry={shapes.road} material={mats[p]!} shadow={shapes.roadShadow} trim={trim} outline={outline} edgeScale={[1.035, 1.2, 1.18]} />
            </group>
          </Drop>
        );
      })}
      {state.towns.map((t, v) => {
        if (!t) return null;
        const vert = TOPOLOGY.verts[v]!;
        return (
          <Drop key={`t${v}${t.city ? 'c' : ''}`} x={vert.x} z={vert.y} still={first.current} grow={t.city}>
            {/* Front to the viewer, each turned a touch so a row of them doesn't look stamped. */}
            <group rotation-y={(((v * 37) % 7) - 3) * 0.06}>
              <PieceMesh
                geometry={t.city ? shapes.city : shapes.town}
                material={mats[t.p]!}
                shadow={t.city ? shapes.cityShadow : shapes.townShadow}
                trim={trim}
                outline={outline}
                edgeScale={[1.07, 1.045, 1.08]}
              />
            </group>
          </Drop>
        );
      })}
    </group>
  );
}

const rippleShape = new THREE.RingGeometry(0.2, 0.26, 32).rotateX(-Math.PI / 2);

/**
 * Brings a new piece onto the board: dropped in from above with a small
 * bounce, or for a city grown out of the town it replaces, and a ring of
 * light spreading from where it lands.
 */
function Drop({ x, z, still, grow, children }: { x: number; z: number; still: boolean; grow?: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const born = useRef<number | null>(still ? -10 : null);
  const ringMat = useMemo(
    () => (still ? null : new THREE.MeshBasicMaterial({ color: '#FFF1A0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })),
    [still],
  );
  useEffect(() => () => ringMat?.dispose(), [ringMat]);
  useFrame(({ clock, gl }) => {
    const g = ref.current;
    if (!g) return;
    if (born.current == null) born.current = clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    if (t <= 0.75) shadowsMoved(gl);
    const r = ring.current;
    if (r && ringMat) {
      const k = Math.min(1, Math.max(0, (t - (grow ? 0.15 : 0.28)) / 0.6));
      r.visible = k > 0 && k < 1;
      r.scale.setScalar(1 + k * 3);
      ringMat.opacity = (1 - k) * 0.9;
    }
    if (t > 0.7) {
      g.position.y = TILE_TOP;
      g.scale.setScalar(1);
      return;
    }
    if (grow) {
      // Rising out of the town: a swell past full size, then settling.
      const k = Math.min(1, t / 0.45);
      const s = 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.18;
      g.position.y = TILE_TOP;
      g.scale.set(s, 0.4 + 0.6 * k + Math.sin(k * Math.PI) * 0.25, s);
      return;
    }
    // A fall, then two small bounces.
    const fall = Math.max(0, 1 - t / 0.28);
    const bounce = t > 0.28 ? Math.abs(Math.sin(((t - 0.28) / 0.32) * Math.PI * 2)) * 0.06 * Math.max(0, 1 - (t - 0.28) / 0.32) : 0;
    g.position.y = TILE_TOP + fall * fall * 0.9 + bounce;
    const squash = t > 0.26 && t < 0.36 ? 1 - 0.12 * Math.sin(((t - 0.26) / 0.1) * Math.PI) : 1;
    g.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  });
  return (
    <>
      <group ref={ref} position={[x, TILE_TOP + (still || grow ? 0 : 0.9), z]}>
        {children}
      </group>
      {ringMat ? <mesh ref={ring} geometry={rippleShape} material={ringMat} position={[x, TILE_TOP + 0.03, z]} visible={false} renderOrder={4} /> : null}
    </>
  );
}

const robberShape = robberGeometry();

const robberRing = new THREE.RingGeometry(0.3, 0.38, 36).rotateX(-Math.PI / 2);

/** The robber, gliding over in an arc when moved; while it's waiting to be moved, it bobs in a pulsing ring of light. */
function Robber({ hex, quality, moving }: { hex: number; quality: Quality; moving: boolean }) {
  const mat = useMaterial(quality, { roughness: 0.4, metalness: 0.15 });
  const ref = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#FF7A5C', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => ringMat.dispose(), [ringMat]);
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
  useFrame(({ clock: c, gl }) => {
    const m = ref.current;
    if (!m) return;
    const f = from.current;
    if (f || moving) shadowsMoved(gl);
    if (!f) {
      m.position.set(target.x, TILE_TOP, target.z);
      return;
    }
    const t = Math.min(1, (c.elapsedTime - f.at) / 0.7);
    const e = t * t * (3 - 2 * t);
    m.position.set(f.x + (target.x - f.x) * e, TILE_TOP + Math.sin(t * Math.PI) * 0.9, f.z + (target.z - f.z) * e);
    if (t >= 1) from.current = null;
  });
  useFrame(({ clock: c }) => {
    const r = ring.current;
    const m = ref.current;
    if (!r || !m) return;
    r.visible = moving;
    if (!moving) return;
    const p = 0.5 + 0.5 * Math.sin(c.elapsedTime * 4);
    r.position.set(m.position.x, TILE_TOP + 0.02, m.position.z);
    r.scale.setScalar(1 + p * 0.35);
    ringMat.opacity = 0.45 + 0.45 * p;
    if (!from.current) m.position.y = TILE_TOP + 0.06 + Math.sin(c.elapsedTime * 3) * 0.05;
  });
  return (
    <>
      <mesh ref={ref} geometry={robberShape} material={mat} position={[target.x, TILE_TOP, target.z]} castShadow />
      <mesh ref={ring} geometry={robberRing} material={ringMat} visible={false} renderOrder={5} />
    </>
  );
}

// ---- Where a piece can go ----------------------------------------------------

const markShapes = {
  vert: new THREE.TorusGeometry(0.14, 0.03, 8, 28).rotateX(Math.PI / 2),
  vertDot: new THREE.CircleGeometry(0.12, 24).rotateX(-Math.PI / 2),
  edge: new THREE.BoxGeometry(0.5, 0.02, 0.13),
  hex: new THREE.RingGeometry(0.78, 0.92, 6, 1, Math.PI / 2).rotateX(-Math.PI / 2),
};

function MarkSpots({ marks, hover }: { marks?: Marks; hover?: Picked | null }) {
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
  const hot = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
    [],
  );
  useEffect(() => () => hot.dispose(), [hot]);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const p = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4);
    mat.opacity = 0.55 + 0.4 * p;
    soft.opacity = 0.2 + 0.25 * p;
    group.current?.children.forEach((c) => {
      if (c.userData.pulse) c.scale.setScalar(c.userData.hot ? 1.35 : 0.92 + 0.12 * p);
    });
  });
  if (!marks) return null;
  const y = TILE_TOP + 0.05;
  const isHot = (kind: Picked['kind'], i: number) => hover?.kind === kind && hover.i === i;
  return (
    <group ref={group}>
      {marks.verts?.map((v) => {
        const p = TOPOLOGY.verts[v]!;
        const h = isHot('vert', v);
        return (
          <group key={`v${v}`} position={[p.x, y, p.y]} userData={{ pulse: true, hot: h }}>
            <mesh geometry={markShapes.vert} material={h ? hot : mat} renderOrder={5} />
            <mesh geometry={markShapes.vertDot} material={h ? mat : soft} renderOrder={5} />
          </group>
        );
      })}
      {marks.edges?.map((e) => {
        const p = TOPOLOGY.edges[e]!;
        const h = isHot('edge', e);
        return (
          <mesh
            key={`e${e}`}
            geometry={markShapes.edge}
            material={h ? hot : mat}
            position={[p.x, y, p.y]}
            rotation-y={-p.angle}
            renderOrder={5}
            userData={{ pulse: true, hot: h }}
          />
        );
      })}
      {marks.hexes?.map((hx) => {
        const p = TOPOLOGY.hexes[hx]!;
        const h = isHot('hex', hx);
        return <mesh key={`h${hx}`} geometry={markShapes.hex} material={h ? hot : mat} position={[p.x, y - 0.03, p.y]} scale={h ? 1.06 : 1} renderOrder={5} />;
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

function Dice({ state, quality, visible, onLanded }: { state: IsleState; quality: Quality; visible: boolean; onLanded: (total: number) => void }) {
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

  useFrame(({ clock, gl }) => {
    const a = anim.current;
    if (a && visible) shadowsMoved(gl);
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
    <group visible={visible}>
      <mesh geometry={tray} material={mat} position={[TRAY.x, 0, TRAY.z]} castShadow receiveShadow />
      {dice.map((ref, i) => (
        <mesh key={i} ref={ref} geometry={dieShape} material={mat} castShadow />
      ))}
    </group>
  );
}

// ---- The camera ----------------------------------------------------------------

/**
 * The points that must stay in view: the coastline all round (the beach's
 * foot) and every harbour's sign, as x, y (up), z.
 */
function islandOutline(shore: number[], board: Board): THREE.Vector3[] {
  const pts = shore.map((r, j) => {
    const a = (j / shore.length) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * (r + 0.3), 0, Math.sin(a) * (r + 0.3));
  });
  for (const port of board.ports) {
    const e = TOPOLOGY.edges[port.edge]!;
    const h = TOPOLOGY.hexes[e.hexes[0]!]!;
    const len = Math.hypot(e.x - h.x, e.y - h.y);
    const [ux, uz] = [(e.x - h.x) / len, (e.y - h.y) / len];
    for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]] as const) {
      pts.push(new THREE.Vector3(e.x + ux * 0.62 + dx, 0.3, e.y + uz * 0.62 + dz));
    }
  }
  return pts;
}

/**
 * Where the camera stands so the whole island fills a view (its aspect and
 * vertical field of view) without being cut: for each spot to look at along
 * the board's depth, the nearest distance at which every outline point lands
 * inside the view, by projecting them; the nearest of all wins. The near edge
 * looms larger than the far one in a tilted view, so the best spot to look
 * at isn't quite the middle.
 */
function fitView(points: THREE.Vector3[], aspect: number, fov: number, pitch: number, margin = 0.97) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
  const v = new THREE.Vector3();
  const fits = (z: number, d: number) => {
    cam.position.set(0, d * Math.sin(pitch), z + d * Math.cos(pitch));
    cam.lookAt(0, 0, z);
    cam.updateMatrixWorld();
    for (const p of points) {
      v.copy(p).project(cam);
      if (Math.abs(v.x) > margin || Math.abs(v.y) > margin) return false;
    }
    return true;
  };
  let best = { z: 0, d: 40 };
  for (let z = -1.2; z <= 1.21; z += 0.1) {
    let lo = 3;
    let hi = 60;
    if (!fits(z, hi)) continue;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(z, mid)) hi = mid;
      else lo = mid;
    }
    if (hi < best.d) best = { z, d: hi };
  }
  return best;
}

function CameraRig({ onReady, beside = true, inset, outline }: { onReady?: (api: IsleBoardApi) => void; beside?: boolean; inset?: Inset; outline: THREE.Vector3[] }) {
  const camera = useThree((t) => t.camera) as THREE.PerspectiveCamera;
  const size = useThree((t) => t.size);
  const { left = 0, right = 0, top = 0, bottom = 0 } = inset ?? {};
  // The free part of the screen, between the panels.
  const freeW = Math.max(1, size.width - left - right);
  const freeH = Math.max(1, size.height - top - bottom);
  const aspect = freeW / freeH;
  const freeFov = (2 * Math.atan(Math.tan(((camera.fov ?? 45) * Math.PI) / 360) * (freeH / Math.max(1, size.height))) * 180) / Math.PI;
  // With the dice tray beside it the island sits a little left; alone, in the middle and filling the view.
  // Fitted once per size, for the usual view and the top view; tilts between are blended.
  const fits = useMemo(
    () => (beside ? null : [fitView(outline, aspect, freeFov, pitchAt(0)), fitView(outline, aspect, freeFov, pitchAt(1))] as const),
    [beside, outline, aspect, freeFov],
  );
  const home = (tilt = 0) => {
    if (!fits) return { x: 0.9, z: 0.4, d: aspect < 1.2 ? 15 : 10, tilt };
    const [a, b] = fits;
    return { x: 0, z: a.z + (b.z - a.z) * tilt, d: a.d + (b.d - a.d) * tilt, tilt };
  };
  const want = useRef(home());
  const now = useRef({ ...want.current });
  // A new size (the window, or the panels around the board): frame the island again.
  const fitted = useRef(`${freeW}x${freeH}`);
  useEffect(() => {
    const key = `${freeW}x${freeH}`;
    if (fitted.current === key) return;
    fitted.current = key;
    want.current = home(want.current.tilt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freeW, freeH]);
  // The view's middle moved to the middle of the free part: the sea still fills the whole screen.
  useLayoutEffect(() => {
    if (!inset) {
      camera.clearViewOffset();
      return;
    }
    camera.setViewOffset(size.width, size.height, -(left - right) / 2, -(top - bottom) / 2, size.width, size.height);
    camera.updateProjectionMatrix();
  }, [camera, inset, size.width, size.height, left, right, top, bottom]);

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 7);
    const n = now.current;
    const w = want.current;
    n.x += (w.x - n.x) * k;
    n.z += (w.z - n.z) * k;
    n.d += (w.d - n.d) * k;
    n.tilt += (w.tilt - n.tilt) * k;
    const pitch = pitchAt(n.tilt);
    camera.position.set(n.x, n.d * Math.sin(pitch), n.z + n.d * Math.cos(pitch));
    camera.lookAt(n.x, 0, n.z);
  });

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_TOP);
    const hit = new THREE.Vector3();
    const clampView = () => {
      const w = want.current;
      w.d = Math.min(beside ? 16 : Math.max(16, home(w.tilt).d * 1.15), Math.max(5, w.d));
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
      toScreen(x, y) {
        camera.updateMatrixWorld();
        const v = new THREE.Vector3(x, TILE_TOP, y).project(camera);
        return { x: v.x, y: v.y };
      },
      zoomBy(f) {
        want.current.d *= f;
        clampView();
      },
      panBy(dx, dy) {
        const span = 2 * want.current.d * Math.tan(((camera.fov ?? 55) * Math.PI) / 360);
        want.current.x -= dx * span;
        want.current.z -= (dy * span) / Math.sin(pitchAt(want.current.tilt));
        clampView();
      },
      tiltBy(delta) {
        want.current.tilt = Math.min(1, Math.max(0, want.current.tilt + delta * 2.2));
      },
      toggleTop() {
        const top = want.current.tilt < 0.5;
        want.current.tilt = top ? 1 : 0;
        // From above, the board is taller than it is from the side: step back so all of it shows.
        if (top) want.current.d = Math.max(want.current.d, beside ? 12.5 : home(1).d);
        else if (!beside) want.current = home(0);
        clampView();
        return top ? 'top' : 'tilted';
      },
      focus(x, y) {
        want.current.x = x;
        want.current.z = y;
        want.current.d = Math.min(want.current.d, 9);
        clampView();
      },
      reset() {
        want.current = home(want.current.tilt);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, onReady]);

  return null;
}

// ---- Performance ------------------------------------------------------------------

export interface IsleStats {
  fps: number;
  /** Average and slowest frame time over the last second, in ms (the slowest shows stutter). */
  avgMs: number;
  worstMs: number;
  /** Per frame, shadow pass included. */
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Rough GPU memory held by textures (mip levels included), in MB. */
  textureMB: number;
  /** The drawing buffer and the pixel ratio it's drawn at. */
  width: number;
  height: number;
  dpr: number;
  renderer: string;
}

/**
 * Measures the board once a second for a debug panel: frame rate and pacing,
 * draw calls and triangles each frame, what's held on the GPU, and the
 * renderer. Counting is done by hand across a whole frame so the shadow pass
 * shows too.
 */
export function IslePerf({ onStats }: { onStats: (s: IsleStats) => void }) {
  const gl = useThree((t) => t.gl);
  const scene = useThree((t) => t.scene);
  const last = useRef({ at: performance.now(), frames: 0, worst: 0, prev: performance.now(), calls: 0, tris: 0 });
  const renderer = useMemo(() => {
    const c = gl.getContext();
    const ext = c.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER));
  }, [gl]);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    const now = performance.now();
    const l = last.current;
    l.worst = Math.max(l.worst, now - l.prev);
    l.prev = now;
    l.frames++;
    l.calls = gl.info.render.calls;
    l.tris = gl.info.render.triangles;
    gl.info.reset();
    if (now - l.at < 1000) return;
    let bytes = 0;
    const seen = new Set<THREE.Texture>();
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        const tex = (mat as THREE.MeshBasicMaterial).map;
        const img = tex?.image as { width?: number; height?: number } | undefined;
        if (!tex || seen.has(tex) || !img?.width || !img.height) continue;
        seen.add(tex);
        bytes += img.width * img.height * 4 * (tex.generateMipmaps ? 1.33 : 1);
      }
    });
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    onStats({
      fps: Math.round((l.frames * 1000) / (now - l.at)),
      avgMs: (now - l.at) / l.frames,
      worstMs: l.worst,
      calls: l.calls,
      triangles: l.tris,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      textureMB: bytes / 1048576,
      width: size.x,
      height: size.y,
      dpr: gl.getPixelRatio(),
      renderer,
    });
    l.at = now;
    l.frames = 0;
    l.worst = 0;
  });
  return null;
}

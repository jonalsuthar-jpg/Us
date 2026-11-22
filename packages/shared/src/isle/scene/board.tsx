/**
 * The island on the table, like a printed board: nineteen picture tiles
 * (forest, pasture, fields, hills, mountains, desert; two pictures of each,
 * turned this way and that) in a framed sea, wooden number tokens, harbour
 * boats moored to their corners, everyone's towns, cities and roads
 * (dropping in with a bounce when built), the robber, glowing spots where a
 * piece can go, and two dice that tumble onto a raft and land on the number
 * the game rolled. The camera tilts from a three-quarter view to straight
 * down from above.
 *
 * It only draws the state it's given. Taps are the screen's job: it asks
 * pick() where on the board a tap lands (see IsleBoardApi) and turns that
 * into a move with pickMark (isle/pick.ts).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import type { Quality } from '../../house/scene/materials';
import { mulberry32 } from '../../rng';
import { TOPOLOGY, type Board, type Terrain } from '../board';
import type { Marks } from '../pick';
import type { IsleState } from '../rules';
import { textGeometry } from './glyphs';
import {
  boatGeometry,
  cityGeometry,
  COLORS,
  dieFacing,
  dieGeometry,
  frameRimGeometry,
  frameWaterGeometry,
  hexRimGeometry,
  hexTopGeometry,
  merge,
  piece,
  PLAYER_COLORS,
  roadGeometry,
  robberGeometry,
  ropeGeometry,
  TILE_INSET,
  TILE_TOP,
  townGeometry,
} from './parts';

const SKY = '#A9D8E8';
/** The camera's tilt above the table: the usual three-quarter view, up to straight down from above. */
const PITCH_LOW = (62 * Math.PI) / 180;
const PITCH_TOP = (89.5 * Math.PI) / 180;
const pitchAt = (tilt: number) => PITCH_LOW + (PITCH_TOP - PITCH_LOW) * tilt;

export interface IsleBoardApi {
  /** Where on the board (board units: x across, y down the table) a point on screen lands, from -1..1 coordinates. */
  pick(ndcX: number, ndcY: number): { x: number; y: number } | null;
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
  /** The tile pictures; without them the lands show as plain colours. */
  art?: IsleArt;
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

export function IsleBoard({ state, marks, quality = 'medium', onReady, onRolled, art }: IsleBoardProps) {
  const glow = useRef<{ total: number; at: number } | null>(null);
  const clock = useThree((t) => t.clock);
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 20, 42]} />
      <Lights quality={quality} />
      <Sea />
      <Island board={state.board} seed={state.seed} robber={state.robber} quality={quality} glow={glow} art={art} />
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
  uniform vec3 uSky;
  varying vec3 vWorld;
  void main() {
    float r = length(vWorld.xz);
    vec3 c = mix(uShallow, uDeep, smoothstep(6.2, 10.0, r));
    // Ripples catching the light.
    float w = sin(vWorld.x * 3.1 + uTime * 1.3) * sin(vWorld.z * 2.6 - uTime * 1.05)
            + 0.5 * sin((vWorld.x + vWorld.z) * 5.3 - uTime * 1.9);
    c += w * 0.025 * (1.0 - smoothstep(6.0, 16.0, r));
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

/** Where the pictures are: two of each land (rendered by scripts/blender/build_isle_art.py), and the frame's water. */
export interface IsleArt {
  tiles: Partial<Record<Terrain, string[]>>;
  sea?: string;
}

/** The art's file names for each land. */
export const ART_LAND: Record<Terrain, string> = {
  wood: 'forest',
  brick: 'hills',
  wool: 'pasture',
  grain: 'fields',
  ore: 'mountains',
  desert: 'desert',
};

/** The art served from one folder (the web's public/isle/art). */
export function artAt(base: string): IsleArt {
  const tiles: Partial<Record<Terrain, string[]>> = {};
  for (const [t, name] of Object.entries(ART_LAND) as [Terrain, string][]) tiles[t] = [1, 2].map((v) => `${base}/tile_${name}_${v}.jpg`);
  return { tiles, sea: `${base}/sea.jpg` };
}

/** Which of a land's pictures each hex shows, and how it's turned (in sixths): the same on both phones. */
export function tileLooks(board: Board, seed: number): { variant: number; turn: number }[] {
  const random = mulberry32(seed ^ 0xa27);
  return board.terrain.map(() => ({ variant: Math.floor(random() * 2), turn: Math.floor(random() * 6) }));
}

/** Loads a picture into a material when it arrives; the material keeps its plain colour until then. */
function usePicture(url: string | undefined, mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, repeat = 1) {
  const gl = useThree((t) => t.gl);
  useEffect(() => {
    if (!url) return;
    let live = true;
    let tex: THREE.Texture | null = null;
    new THREE.TextureLoader().load(url, (t) => {
      if (!live) return t.dispose();
      tex = t;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      if (repeat !== 1) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
      }
      mat.map = t;
      mat.color.set('#FFFFFF');
      mat.needsUpdate = true;
    });
    return () => {
      live = false;
      tex?.dispose();
    };
  }, [url, mat, gl, repeat]);
}

function Island({
  board,
  seed,
  robber,
  quality,
  glow,
  art,
}: {
  board: Board;
  seed: number;
  robber: number;
  quality: Quality;
  glow: RefObject<{ total: number; at: number } | null>;
  art?: IsleArt;
}) {
  const mat = useMaterial(quality);
  const built = useMemo(() => buildIsland(board, mat), [board, mat]);
  useEffect(() => () => built.dispose(), [built]);

  // One textured group per land and picture.
  const groups = useMemo(() => {
    const looks = tileLooks(board, seed);
    const by = new Map<string, { land: Terrain; variant: number; hexes: number[] }>();
    board.terrain.forEach((land, h) => {
      const key = `${land}${looks[h]!.variant}`;
      const g = by.get(key) ?? { land, variant: looks[h]!.variant, hexes: [] };
      g.hexes.push(h);
      by.set(key, g);
    });
    return { list: [...by.values()], looks };
  }, [board, seed]);

  // The glow over lands that paid out after a roll: soft light added over the picture.
  const glowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#FFF1B8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  const glowShape = useMemo(() => hexTopGeometry(TILE_INSET, TILE_TOP + 0.004), []);
  useEffect(() => () => glowShape.dispose(), [glowShape]);
  const paid = useRef<number[]>([]);
  const [lit, setLit] = useState<number[]>([]);
  useFrame(({ clock }) => {
    const g = glow.current;
    const t = g ? clock.elapsedTime - g.at : Infinity;
    if (t > 2.2) {
      if (paid.current.length) {
        paid.current = [];
        setLit([]);
      }
      glowMat.opacity = 0;
      return;
    }
    const now = board.numbers.flatMap((n, h) => (n === g!.total && h !== robber ? [h] : []));
    if (now.join() !== paid.current.join()) {
      paid.current = now;
      setLit(now);
    }
    // Two soft pulses.
    glowMat.opacity = Math.max(0, Math.sin((t / 2.2) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5) * (1 - t / 2.2) * 0.55;
  });

  return (
    <group>
      {built.objects.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
      <FrameWater url={art?.sea} quality={quality} />
      {groups.list.map((g) => (
        <TileGroup
          key={`${g.land}${g.variant}`}
          land={g.land}
          hexes={g.hexes}
          turns={g.hexes.map((h) => groups.looks[h]!.turn)}
          url={art?.tiles[g.land]?.[g.variant]}
          quality={quality}
        />
      ))}
      {lit.map((h) => (
        <mesh key={h} geometry={glowShape} material={glowMat} position={[TOPOLOGY.hexes[h]!.x, 0, TOPOLOGY.hexes[h]!.y]} renderOrder={2} />
      ))}
    </group>
  );
}

/** Every hex of one land showing the same picture, each turned its own way: one draw. */
function TileGroup({ land, hexes, turns, url, quality }: { land: Terrain; hexes: number[]; turns: number[]; url?: string; quality: Quality }) {
  const mat = useMemo(
    () =>
      quality === 'low'
        ? new THREE.MeshLambertMaterial({ color: COLORS.terrain[land] })
        : new THREE.MeshStandardMaterial({ color: COLORS.terrain[land], roughness: 0.9, metalness: 0 }),
    [land, quality],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  usePicture(url, mat);
  const geo = useMemo(() => hexTopGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(geo, mat, hexes.length);
    const m = new THREE.Matrix4();
    hexes.forEach((h, i) => {
      const hex = TOPOLOGY.hexes[h]!;
      // A pointy hex turned by sixths is still the same hex: the picture just faces another way.
      m.makeRotationY((turns[i]! * Math.PI) / 3).setPosition(hex.x, 0, hex.y);
      im.setMatrixAt(i, m);
    });
    im.receiveShadow = true;
    return im;
  }, [geo, mat, hexes, turns]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

/** The water inside the board's frame, painted, under the tiles. */
function FrameWater({ url, quality }: { url?: string; quality: Quality }) {
  const mat = useMemo(
    () =>
      quality === 'low'
        ? new THREE.MeshLambertMaterial({ color: COLORS.shallow })
        : new THREE.MeshStandardMaterial({ color: COLORS.shallow, roughness: 0.35, metalness: 0.05 }),
    [quality],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  usePicture(url, mat, 3);
  const geo = useMemo(() => frameWaterGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

function buildIsland(board: Board, mat: THREE.Material) {
  const objects: THREE.Object3D[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const { hexes } = TOPOLOGY;

  // The frame's wooden rim.
  const rim = frameRimGeometry();
  geos.push(rim);
  const rimMesh = new THREE.Mesh(rim, mat);
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;
  objects.push(rimMesh);

  // Each tile's thickness under its picture.
  const side = hexRimGeometry();
  geos.push(side);
  const sides = new THREE.InstancedMesh(side, mat, hexes.length);
  const m = new THREE.Matrix4();
  hexes.forEach((h, i) => sides.setMatrixAt(i, m.makeTranslation(h.x, 0.03, h.y)));
  sides.castShadow = true;
  sides.receiveShadow = true;
  objects.push(sides);

  // Number tokens and harbours never move: all of them merged into one shape, one draw.
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
  const boat = boatGeometry();
  for (const port of board.ports) {
    const e = TOPOLOGY.edges[port.edge]!;
    const h = hexes[e.hexes[0]!]!;
    const nx = e.x - h.x;
    const nz = e.y - h.y;
    const len = Math.hypot(nx, nz);
    const ux = nx / len;
    const uz = nz / len;
    // The harbour's sign just off the coast, its boat further out, side on, with a rope to each of the two corners.
    const bx = e.x + ux * 0.86;
    const bz = e.y + uz * 0.86;
    still.push(placed(boat, bx, 0.03, bz, -Math.atan2(uz, ux) + Math.PI / 2));
    for (const v of e.v) {
      const c = TOPOLOGY.verts[v]!;
      still.push(ropeGeometry([bx - ux * 0.08, bz - uz * 0.08], [c.x, c.y], 0.1));
    }
    const label = portLabel(port.kind === 'any' ? '3:1' : '2:1', port.kind === 'any' ? COLORS.wood : COLORS.terrain[port.kind]);
    still.push(placed(label, e.x + ux * 0.5, 0.06, e.y + uz * 0.5));
    label.dispose();
  }
  boat.dispose();
  for (const g of tokenGeo.values()) g.dispose();
  const fixtures = merge(still);
  geos.push(fixtures);
  const fixed = new THREE.Mesh(fixtures, mat);
  fixed.castShadow = true;
  fixed.receiveShadow = true;
  objects.push(fixed);

  return {
    objects,
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
    piece(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 28), color, { at: [0, 0, 0] }),
    piece(new THREE.CylinderGeometry(0.225, 0.225, 0.045, 28), COLORS.cream, { at: [0, 0.012, 0] }),
    piece(textGeometry(text, 0.16, 0.16, 0.014), COLORS.ink, { at: [0, 0.035, 0] }),
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

const TRAY = new THREE.Vector3(7.4, 0, 0.9);
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
  const home = (tilt = 0) => ({ x: 0.9, z: 0.3, d: size.width / size.height < 1.2 ? 16 : 11, tilt });
  const want = useRef(home());
  const now = useRef({ ...want.current });

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
        if (top) want.current.d = Math.max(want.current.d, 13.5);
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

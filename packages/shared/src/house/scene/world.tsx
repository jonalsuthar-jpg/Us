import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  actionFor,
  addedKey,
  addedModel,
  DISH_KEY,
  MUSIC_KEY,
  NOTE_KEY,
  doorFor,
  isOn,
  isOpen,
  itemDef,
  placeItems,
  restingY,
  seatPose,
  SKY_KEY,
  today,
  water,
  type ItemModel,
  type ItemState,
  type LookState,
  type PlacedItem,
} from '../items';
import { findPath, FLOOR_H, floorY, region, regionAt, SPAWN, walkStep, type RegionId, type Waypoint } from '../layout';
import { holdLoses, type Emote, type HousePresence, type Pose, type Together } from '../presence';
import { hoursNow, isNight, skyAt, weatherFor, type Weather } from '../sky';
import { LOOPS, MUSIC_S, nearness, stepSound, type HouseSound } from '../sound';
import type { HouseStore } from '../store';
import { Avatar, bodyAct, DANCE_S, HEART_S, newMotion, WAVE_S, type AvatarRig } from './avatar';
import { useFun, useUnlocked, withMailbox, type FunCmd, type FunHud, type HouseLetters } from './fun';
import { RealAvatar } from './avatar-real';
import { Items, type HousePhoto } from './items';
import { makeMaterials, type Quality } from './materials';
import { HouseColliders, HouseModel, type HouseGroups } from './model';
import { Optional, RealHouse } from './real-house';
import { Sky, Water } from './sky';

/** What a button press asks the house to do. */
export type HouseCmd =
  | { t: 'use' }
  | { t: 'rotate'; by: number }
  | { t: 'paint'; color: string }
  | { t: 'remove' }
  | { t: 'add'; model: ItemModel }
  | { t: 'deselect' }
  /** Walk to a spot (through doors and up stairs), then use the thing there if given. */
  | { t: 'walkTo'; x: number; y: number; z: number; use?: string }
  /** Ask my partner to do something together, or answer them. */
  | { t: 'invite'; kind: Together }
  | { t: 'answer'; yes: boolean }
  /** Take a photo of what's on screen (into Memories). */
  | { t: 'photo' }
  /** Things to do together (scene/fun.tsx): the menu, a pick in its card. */
  | FunCmd;

/**
 * What the screen around the canvas feeds in: the joystick, drags to look
 * around, pinches, taps and buttons. Plain numbers the scene reads every
 * frame, so moving never re-renders React.
 */
export interface HouseControls {
  yaw: number;
  pitch: number;
  dist: number;
  /** The joystick: x right, y down, each -1…1. */
  move: [number, number];
  /** close: behind my shoulder, like a game. above: the dollhouse, cut open. */
  view: CameraView;
  decorate: boolean;
  /** Taps waiting to be handled, in normalised device coordinates. */
  taps: [number, number][];
  emotes: Emote[];
  cmds: HouseCmd[];
}

const VIEWS = {
  // Through my own eyes: pitch is where I look (up is negative), no distance.
  first: { pitch: 0.05, dist: 0, minPitch: -1.3, maxPitch: 1.3, minDist: 0, maxDist: 0 },
  close: { pitch: 0.32, dist: 4.2, minPitch: 0.02, maxPitch: 1.05, minDist: 2, maxDist: 7 },
  far: { pitch: 0.45, dist: 8, minPitch: 0.05, maxPitch: 1.2, minDist: 5, maxDist: 12 },
  above: { pitch: 0.82, dist: 13, minPitch: 0.3, maxPitch: 1.4, minDist: 4, maxDist: 22 },
} as const;

/** The camera button goes round these. */
export const CAMERA_VIEWS = ['first', 'close', 'far', 'above'] as const;
export type CameraView = (typeof CAMERA_VIEWS)[number];
export const CAMERA_LABEL: Record<CameraView, string> = { first: 'My eyes', close: 'Close', far: 'Far', above: 'Whole house' };
export const nextCameraView = (v: CameraView): CameraView => CAMERA_VIEWS[(CAMERA_VIEWS.indexOf(v) + 1) % CAMERA_VIEWS.length]!;

export const createControls = (): HouseControls => ({ yaw: 0, pitch: VIEWS.close.pitch, dist: VIEWS.close.dist, move: [0, 0], view: 'close', decorate: false, taps: [], emotes: [], cmds: [] });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function setView(c: HouseControls, view: HouseControls['view']) {
  c.view = view;
  c.pitch = VIEWS[view].pitch;
  c.dist = VIEWS[view].dist;
}

/** A drag of dx, dy pixels across a view w pixels wide turns the camera. */
export function orbitBy(c: HouseControls, dx: number, dy: number, w: number) {
  const v = VIEWS[c.view];
  c.yaw -= (dx / Math.max(w, 1)) * Math.PI * 1.4;
  c.pitch = clamp(c.pitch + (dy / Math.max(w, 1)) * 2, v.minPitch, v.maxPitch);
}

/** factor > 1 moves in. */
export function zoomBy(c: HouseControls, factor: number) {
  const v = VIEWS[c.view];
  c.dist = clamp(c.dist / factor, v.minDist, v.maxDist);
}

/** A tap at (x, y) in a w × h view. */
export function tapAt(c: HouseControls, x: number, y: number, w: number, h: number) {
  c.taps.push([(x / w) * 2 - 1, -((y / h) * 2 - 1)]);
}

/** What the buttons round the canvas should show. */
export interface HudState {
  /** The action button's label, or null when there's nothing in reach. */
  action: string | null;
  seated: boolean;
  /** What I'm carrying. */
  holding: string | null;
  /** Decorating: the thing picked, and what can be done to it. */
  selected: { key: string; label: string; paint: boolean; added: boolean; moved: boolean } | null;
  /** My partner is close enough to do something together. */
  nearPartner: boolean;
  /** They asked me (answer it), or I asked them (waiting). */
  invite: Together | null;
  asking: Together | null;
  /** At the fridge: a note of theirs to read, or room to leave mine. */
  note: 'read' | 'write' | null;
  /** Things to do together: a card, a line across the top, the screen dark, our moods. */
  fun: FunHud;
}

export interface WorldProps {
  quality: Quality;
  controls: HouseControls;
  presence: HousePresence | null;
  store: HouseStore | null;
  items: ReadonlyMap<string, ItemState>;
  photos: HousePhoto[];
  meId: string;
  partnerId: string;
  partnerName: string;
  mine: LookState;
  theirs: LookState;
  /** Where I am ('Kitchen'), when it changes. */
  onPlace?: (label: string) => void;
  /** Where my partner is, or null when they aren't in, when it changes. */
  onPartnerPlace?: (label: string | null) => void;
  onHud?: (hud: HudState) => void;
  /** Something we did together ("Movie night"). */
  onMoment?: (text: string) => void;
  /** Frames per second, every few seconds. */
  /** Frames per second, and draw calls in the last frame, every few seconds. */
  onFps?: (fps: number, calls: number) => void;
  /** Something went wrong drawing the house; it stops, and this says what. */
  onError?: (error: Error) => void;
  /** Our couple, for today's weather (the same for both of us). */
  coupleId?: string;
  /** The sounds, once the pack has them. */
  sound?: HouseSound | null;
  /** On a call together: we talk with our hands a little. */
  talking?: boolean;
  /** Saves a picture of the house as it's drawn now (into Memories). */
  capture?: (r: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }) => Promise<void>;
  /** The house is in and drawing: time to take the loading screen away. */
  onReady?: () => void;
  /** Where the realistic house is (ground.glb, …). Without it, or until it loads, the box house stands in. */
  houseUrl?: string;
  /** When we paired: what the house has unlocked. */
  pairedAt?: string;
  /** Today's birthday or anniversary ("Ana’s birthday"), for a party. */
  celebrate?: string | null;
  /** Letters for each other (the mailbox). */
  letters?: HouseLetters | null;
  /** Tell my partner, with a push, when they're not here. */
  notify?: (event: 'gift' | 'turn' | 'in' | 'letter') => void;
  /** On a call: how loud each of us is (0…1), kept current by the caller. */
  voice?: { me: number; them: number };
  /** On a call: how loud (0…1) and from which side (-1 left … 1 right) my partner's voice should be, from where they stand. */
  onVoice?: (gain: number, pan: number) => void;
  /** Their camera, on the living-room TV (the web). */
  tvVideo?: MediaStream | null;
}

/**
 * Drawing through expo-gl (React Native), not a browser. Its float render
 * targets don't work (reflection maps and the HDR sky drew garbage), and
 * every draw call costs more, so phones get a lighter version.
 */
const ON_PHONE = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

const SKY_DAY = new THREE.Color('#BFDDF2');
const GOLDEN = new THREE.Color('#F4B98A');
const GREY = new THREE.Color('#9BA7B3');
const SUNSET_LIGHT = new THREE.Color('#FFB070');
/** Where the fireflies drift, over the lawn and the pots. */
const FLIES: [number, number][] = Array.from({ length: 28 }, (_, i) => [-12 + ((i * 37) % 24), 5 + ((i * 53) % 9)]);
const SKY_NIGHT = new THREE.Color('#0D1630');
const REACH = 1.05;
const COOK_S = 6;
const WATER_S = 2.5;
const HUG_S = 3;
/** Louder than this on the call: talking. */
const SPEAKING = 0.035;

type View = 'all' | 'upper' | 'ground';

function viewFor(id: RegionId, y: number): View {
  const r = region(id);
  if (!r.inside) return 'all';
  return y > FLOOR_H / 2 ? 'upper' : 'ground';
}

const floorOf = (y: number): 0 | 1 => (y > FLOOR_H - 0.6 ? 1 : 0);

interface Me {
  pos: THREE.Vector3;
  heading: number;
  at: RegionId;
  path: Waypoint[];
  /** Walk there, then use it. */
  pending: string | null;
  motion: ReturnType<typeof newMotion>;
  rig: AvatarRig | null;
  /** How fast I moved this frame, m/s. */
  speed: number;
  place: string;
  seat: { key: string; i: number; lie: boolean } | null;
  hold: { key: string; since: number } | null;
  /** cook, water or hug, until when (seconds on the clock). */
  doing: { act: 'cook' | 'water' | 'hug' | 'kiss' | 'slow'; until: number; key?: string } | null;
  /** Hand in hand: I lead (my right hand) or follow beside them (my left). */
  hands: { lead: boolean; since: number } | null;
  /** Metres walked since the last footstep. */
  stride: number;
}

/** The house, the two of us, the things in it and the camera. Goes inside a Canvas. */
export function HouseWorld(props: WorldProps) {
  const { quality, controls, presence, store, items, photos, meId, partnerId, partnerName, mine, theirs, onPlace, onPartnerPlace, onHud, onMoment, onFps, onError, onReady, houseUrl, coupleId, sound, talking, capture, pairedAt, celebrate, letters, notify, voice, onVoice, tvVideo } = props;
  const { gl, scene, camera, invalidate } = useThree();
  const mats = useMemo(() => makeMaterials(quality), [quality]);
  useEffect(() => () => mats.dispose(), [mats]);
  const groups = useRef<HouseGroups>({ ground: null, upper: null, roof: null }).current;
  const colliders = useRef<THREE.Group | null>(null);
  const setColliders = useCallback((g: THREE.Group | null) => void (colliders.current = g), []);
  // Sharpness that follows the frame rate (the web): lower to keep near 60 fps, back up when there's room.
  const setDpr = useThree((s) => s.setDpr);
  const maxDpr = useRef(0);
  const pace = useRef({ frames: 0, time: 0, dpr: 0 });
  // The realistic house, once it has loaded into the groups.
  const [real, setReal] = useState(false);
  const onRealReady = useCallback(() => setReal(true), []);
  const opened = useRef({ frames: 0, told: false });
  const objects = useRef(new Map<string, THREE.Object3D>()).current;
  // The clock decides day and night (and the moon button, for a few hours); checked every half minute.
  const [minute, setMinute] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMinute(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // What our days together have unlocked, and what today's dates put out.
  const unlocked = useUnlocked(store, pairedAt, celebrate, minute);
  const lettersWaiting = !!letters?.waiting;
  const placed = useMemo(() => withMailbox(placeItems(items, unlocked), lettersWaiting), [items, unlocked, lettersWaiting]);
  const placedRef = useRef(placed);
  placedRef.current = placed;
  const night = isNight(items.get(SKY_KEY), new Date(minute));
  const weather: Weather = coupleId ? weatherFor(coupleId, today(new Date(minute))) : 'clear';
  const note = items.get(NOTE_KEY);
  const dish = items.get(DISH_KEY)?.on === true;

  // The real sky (sky.tsx), once it has loaded: it takes over the background and the reflections.
  const [sky, setSky] = useState(false);
  const onSkyReady = useCallback(() => setSky(true), []);

  // Until then, reflections from a soft studio light, above low quality.
  useEffect(() => {
    gl.toneMappingExposure = 1.05;
    if (quality === 'low' || sky || ON_PHONE) return;
    let env: THREE.WebGLRenderTarget | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(gl);
      const room = new RoomEnvironment();
      env = pmrem.fromScene(room, 0.04);
      room.dispose();
      pmrem.dispose();
      scene.environment = env.texture;
    } catch {
      // No float render targets on this GPU: lights alone still look fine.
    }
    return () => {
      if (env && scene.environment === env.texture) scene.environment = null;
      env?.dispose();
    };
  }, [gl, scene, quality, sky]);

  // Day or night: the sky, the haze, how bright the world is.
  useEffect(() => {
    const haze = night ? SKY_NIGHT : SKY_DAY;
    scene.fog = new THREE.Fog(haze.clone(), night ? 25 : 35, night ? 70 : 95);
    if (!sky) {
      scene.background = haze.clone();
      scene.environmentIntensity = night ? 0.08 : 0.35;
    }
    invalidate();
  }, [scene, night, invalidate, sky]);

  // Shadows: everything catches them, solid things cast them. Exterior walls cut away in the dollhouse.
  const walls = useRef<{ obj: THREE.Object3D; nx: number; nz: number; upper: boolean }[]>([]);
  useLayoutEffect(() => {
    // Phones: no shadows for now; on expo-gl they speckle the picture.
    const shadows = quality !== 'low' && !ON_PHONE;
    gl.shadowMap.enabled = shadows;
    // On phones the shadows are redrawn every other frame (see the frame); the house itself never moves.
    gl.shadowMap.autoUpdate = !ON_PHONE;
    gl.shadowMap.needsUpdate = true;
    gl.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    walls.current = [];
    for (const g of [groups.ground, groups.upper, groups.roof]) {
      g?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const see = (mesh.material as THREE.Material).transparent;
          mesh.castShadow = shadows && !see;
          mesh.receiveShadow = shadows;
        }
        const cut = o.userData.cut as [number, number] | undefined;
        if (cut) walls.current.push({ obj: o, nx: cut[0], nz: cut[1], upper: g === groups.upper });
      });
    }
  }, [gl, groups, quality, mats, placed, real]);

  const me = useRef<Me>({
    pos: new THREE.Vector3(SPAWN.x + (meId < partnerId ? -0.6 : 0.6), 0, SPAWN.z),
    heading: Math.PI,
    at: SPAWN.region,
    path: [],
    pending: null,
    motion: newMotion(),
    rig: null,
    speed: 0,
    hands: null,
    stride: 0,
    place: '',
    seat: null,
    hold: null,
    doing: null,
  }).current;
  const them = useRef({ pos: new THREE.Vector3(), heading: 0, shown: false, motion: newMotion(), rig: null as AvatarRig | null, stride: 0, wasIn: false, last: new THREE.Vector3(), place: null as string | null, pose: null as Pose | null }).current;
  const target = useRef(new THREE.Vector3(SPAWN.x, 1.1, SPAWN.z)).current;
  const marker = useRef<THREE.Mesh>(null);
  const markerLife = useRef(0);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const tmp = useMemo(() => ({ ndc: new THREE.Vector2(), to: new THREE.Vector3(), look: new THREE.Vector3(), dir: new THREE.Vector3(), cam: new THREE.Vector3() }), []);
  const fps = useRef({ frames: 0, time: 0 });
  const hud = useRef<{ last: string; focus: string | null }>({ last: '', focus: null });
  const decor = useRef<{ key: string | null; draft: { x: number; z: number; ry: number } | null; dirty: boolean }>({ key: null, draft: null, dirty: false }).current;
  const moments = useRef(new Set<string>());
  const sun = useRef<THREE.DirectionalLight>(null);
  const rain = useRef<THREE.Points>(null);
  const flies = useRef<THREE.Points>(null);
  const splashed = useRef(false);
  const skyClock = useRef(0);
  const lightNow = useRef({ daylight: 1, golden: 0, dim: 1, sun: [12, 20, 14] as [number, number, number] });
  const skyReady = sky;
  const music = items.get(MUSIC_KEY)?.on ? items.get(MUSIC_KEY) : undefined;
  const rainGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = quality === 'low' ? 500 : 1200;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = -20 + Math.random() * 40;
      p[i * 3 + 1] = Math.random() * 12;
      p[i * 3 + 2] = 6 + Math.random() * 10;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, [quality]);
  const fliesGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLIES.length * 3), 3));
    return g;
  }, []);
  useEffect(
    () => () => {
      rainGeo.dispose();
      fliesGeo.dispose();
    },
    [rainGeo, fliesGeo],
  );
  const hemi = useRef<THREE.HemisphereLight>(null);
  const stars = useRef<THREE.Points>(null);

  const setMine = useCallback((r: AvatarRig | null) => void (me.rig = r), [me]);
  const setTheirs = useCallback((r: AvatarRig | null) => void (them.rig = r), [them]);

  useEffect(() => {
    if (!presence) return;
    return presence.onEmote((e) => {
      if (e === 'wave') them.motion.wave = WAVE_S;
      else if (e === 'dance') them.motion.dance = DANCE_S;
      else them.motion.heart = HEART_S;
    });
  }, [presence, them]);

  const asks = useRef<{ invite: Together | null; asking: Together | null }>({ invite: null, asking: null }).current;
  useEffect(() => {
    if (!presence) return;
    return presence.onInvite(({ kind, answer }) => {
      if (answer === undefined) asks.invite = kind;
      else if (asks.asking === kind) {
        asks.asking = null;
        if (answer) begin(kind, true);
        else onMoment?.(`${partnerName} said maybe later`);
      }
    });
  }, [presence, asks, partnerName, onMoment]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Start something together; whoever asked leads the walk hand in hand. */
  function begin(kind: Together, asked: boolean) {
    const now = clock.elapsedTime;
    if (me.seat) standUp();
    me.path = [];
    if (kind === 'kiss') {
      me.doing = { act: 'kiss', until: now + 3.5 };
      moment(`kiss:${Math.floor(now / 15)}`, 'A kiss');
    } else if (kind === 'slow') {
      me.doing = { act: 'slow', until: now + 60 };
      moment(`slow:${Math.floor(now / 60)}`, 'Slow dancing');
      if (!music) save(MUSIC_KEY, { on: true, at: new Date().toISOString() });
    } else {
      me.hands = { lead: asked, since: now };
      moment(`hands:${Math.floor(now / 60)}`, 'Hand in hand', false);
    }
  }

  // A note of theirs I haven't read: say so once, on the way in.
  const noted = useRef(false);
  useEffect(() => {
    if (noted.current || !note?.text || note.by === meId || note.read) return;
    noted.current = true;
    onMoment?.('There’s a note on the fridge');
  }, [note, meId, onMoment]);

  useLayoutEffect(() => {
    const s = sun.current;
    if (!s) return;
    const size = quality === 'high' ? 2048 : 1024;
    s.shadow.mapSize.set(size, size);
    Object.assign(s.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
    s.shadow.camera.updateProjectionMatrix();
    s.shadow.bias = -0.0005;
    s.shadow.normalBias = 0.03;
    s.target.position.set(0, 0, 3);
    s.target.updateMatrixWorld();
  }, [quality]);

  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(1 - rnd() * 0.9);
      pts.push(Math.sin(ph) * Math.cos(th) * 60, Math.cos(ph) * 60 + 5, Math.sin(ph) * Math.sin(th) * 60);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => starGeo.dispose(), [starGeo]);

  const moment = (id: string, text: string, hearts = true) => {
    if (moments.current.has(id)) return;
    moments.current.add(id);
    onMoment?.(text);
    sound?.play('chime', 0.45);
    if (hearts) {
      me.motion.heart = HEART_S;
      them.motion.heart = HEART_S;
    }
  };

  const save = (key: string, patch: Partial<ItemState> | null) => {
    if (!store) return;
    if (patch === null) return store.set(key, null);
    store.set(key, { ...(store.get(key) ?? {}), ...patch } as Record<string, unknown>);
  };

  const myFloorY = () => floorY(me.at, me.pos.x);

  const fun = useFun({
    me,
    them,
    meId,
    partnerId,
    partnerName,
    store,
    sound,
    photos,
    night,
    pairedAt,
    celebrate,
    letters,
    unlocked,
    now: () => clock.elapsedTime,
    say: (text) => onMoment?.(text),
    moment,
    notify,
    emote: (e) => controls.emotes.push(e),
    walkTo: (x, y, z, useKey) => controls.cmds.push({ t: 'walkTo', x, y, z, use: useKey }),
    sit: (key) => {
      const it = placedRef.current.find((i) => i.key === key);
      if (it) use(it);
    },
    standUp: () => standUp(),
  });

  /** Things within reach that do something, nearest first. */
  const inReach = (all: PlacedItem[]) => {
    const fy = myFloorY();
    const out: { item: PlacedItem; d: number }[] = [];
    for (const it of all) {
      if (controls.decorate) break;
      if (me.hold?.key === it.key || them.pose?.hk === it.key || fun.flying(it.key)) continue;
      const rel = it.y - fy;
      if (rel < -0.4 || rel > 2.3) continue;
      const r = Math.min(Math.max(it.hw, it.hd), 0.9);
      const d = Math.hypot(it.x - me.pos.x, it.z - me.pos.z) - r;
      if (d <= REACH) out.push({ item: it, d });
    }
    return out.sort((a, b) => a.d - b.d);
  };

  /** What the action button does right now. */
  const focusFor = (all: PlacedItem[]): { label: string; run: () => void } | null => {
    if (fun.playing()) return null;
    const ours = fun.focus();
    if (ours) return ours;
    const p = them.pose;
    if (me.seat) return { label: 'Stand up', run: () => standUp() };
    const day = today();
    const near = inReach(all);
    if (me.hold) {
      const held = itemDef(me.hold.key);
      if (me.hold.key === 'watering_can') {
        const plant = near.find((n) => n.item.kind === 'plant' && n.item.state.watered !== day);
        if (plant) return { label: 'Water the plant', run: () => doWater(plant.item) };
      }
      return { label: `Put down ${held?.label.toLowerCase() ?? 'it'}`, run: () => putDown() };
    }
    if (p && them.shown && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 1.2 && Math.abs(p.y - me.pos.y) < 1) {
      const nearest = near[0];
      if (!nearest || nearest.d > 0.4) return { label: `Hug ${partnerName}`, run: () => doHug() };
    }
    if (dish) {
      const table = all.find((i) => i.key === 'dining_table');
      if (table && Math.hypot(table.x - me.pos.x, table.z - me.pos.z) < 1.9 && floorOf(me.pos.y) === 0) return { label: 'Eat together', run: () => eat() };
    }
    for (const { item } of near) {
      const label = actionFor(item, null, item.state.watered === day);
      if (label) return { label, run: () => use(item) };
    }
    return null;
  };

  const standUp = () => {
    const s = me.seat;
    me.seat = null;
    if (!s) return;
    const item = placedRef.current.find((i) => i.key === s.key);
    if (!item) return;
    // Step off to the front of the seat.
    const fx = me.pos.x + Math.sin(item.ry) * (s.lie ? 0.2 : 0.6);
    const fz = me.pos.z + Math.cos(item.ry) * (s.lie ? 0.2 : 0.6);
    const r = regionAt(fx, item.y + 0.1, fz) ?? regionAt(me.pos.x, item.y + 0.1, me.pos.z);
    if (r) {
      me.at = r.id;
      const [x, z] = [Math.min(Math.max(fx, r.x0), r.x1), Math.min(Math.max(fz, r.z0), r.z1)];
      me.pos.set(x, floorY(r.id, x), z);
    }
  };

  const putDown = () => {
    const h = me.hold;
    if (!h) return;
    me.hold = null;
    const x = me.pos.x + Math.sin(me.heading) * 0.45;
    const z = me.pos.z + Math.cos(me.heading) * 0.45;
    const y = restingY(placedRef.current, x, myFloorY(), z, h.key);
    save(h.key, { x, y, z, ry: me.heading });
  };

  const doWater = (plant: PlacedItem) => {
    me.doing = { act: 'water', until: clock.elapsedTime + WATER_S };
    save(plant.key, water(plant.state, today()));
    if (plant.state.growth === 3) onMoment?.('Your plant is in flower');
  };

  const doHug = () => {
    me.doing = { act: 'hug', until: clock.elapsedTime + HUG_S };
    if (them.pose?.a === 'hug') moment(`hug:${Math.floor(clock.elapsedTime / 10)}`, 'A hug');
  };

  const eat = () => {
    save(DISH_KEY, null);
    me.motion.heart = HEART_S;
    const p = them.pose;
    if (p?.a?.startsWith('sit:chair_')) moment(`dinner:${Math.floor(clock.elapsedTime / 30)}`, 'Dinner together');
  };

  const use = (item: PlacedItem) => {
    switch (item.kind) {
      case 'light':
        sound?.play('click', 0.5);
        return save(item.key, { on: !isOn(item) });
      case 'door':
        sound?.play(item.key === 'fridge' ? 'fridge' : 'door', 0.55);
        return save(item.key, { open: !isOpen(item) });
      case 'tv':
        sound?.play('click', 0.5);
        return save(item.key, { on: !isOn(item) });
      case 'frame': {
        if (!photos.length) return onMoment?.('Add photos to Memories to see them here');
        const at = photos.findIndex((p) => p.path === item.state.photo);
        return save(item.key, { photo: photos[(at + 1) % photos.length]!.path });
      }
      case 'carry':
        me.hold = { key: item.key, since: Date.now() };
        return;
      case 'stove':
        me.heading = item.ry + Math.PI;
        me.doing = { act: 'cook', until: clock.elapsedTime + COOK_S };
        return;
      case 'plant':
        return;
      case 'fun':
        return fun.use(item);
      case 'furniture': {
        if (!item.seats?.length) return;
        const taken = them.pose?.a;
        let best = -1;
        let bestD = Infinity;
        item.seats.forEach((s, i) => {
          if (taken === `${s.lie ? 'lie' : 'sit'}:${item.key}:${i}`) return;
          const sp = seatPose(item, i)!;
          const d = Math.hypot(sp.x - me.pos.x, sp.z - me.pos.z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best < 0) return onMoment?.(`${partnerName} is there`);
        const sp = seatPose(item, best)!;
        me.path = [];
        me.seat = { key: item.key, i: best, lie: sp.lie };
        me.pos.set(sp.x, sp.y, sp.z);
        me.heading = sp.h;
        return;
      }
    }
  };

  const clock = useThree((s) => s.clock);

  const hitItem = (o: THREE.Object3D | null): string | null => {
    for (let at = o; at; at = at.parent) if (typeof at.userData.itemKey === 'string') return at.userData.itemKey as string;
    return null;
  };

  // One frame. An error in it stops the house (and says so) instead of taking the app down.
  const frame = (rawDt: number) => {
    const dt = Math.min(rawDt, 0.1);
    const now = clock.elapsedTime;
    const all = placedRef.current;
    const p = presence?.partner() ?? null;
    them.pose = p;

    // Taps: in the house they walk me somewhere (and use what I tapped);
    // decorating, they pick what to move.
    while (controls.taps.length) {
      const [x, y] = controls.taps.shift()!;
      ray.setFromCamera(tmp.ndc.set(x, y), camera);
      if (fun.tap(ray)) continue;
      const roots = [groups.ground, groups.upper, groups.roof].filter((g): g is THREE.Group => !!g && g.visible);
      const hit = ray.intersectObjects(roots, true).find((h) => shown(h.object) && !h.object.userData.noHit);
      if (!hit) continue;
      const key = hitItem(hit.object);
      const item = key ? all.find((i) => i.key === key) : undefined;
      if (controls.decorate) {
        commitDraft();
        decor.key = item?.movable ? item.key : null;
        decor.draft = null;
        continue;
      }
      if (me.seat) standUp();
      const goal = item ? approach(item) : hit.point;
      const r = regionAt(goal.x, item ? item.y + 0.1 : goal.y, goal.z) ?? regionAt(hit.point.x, hit.point.y, hit.point.z);
      if (!r) continue;
      const path = findPath(me.at, { region: r.id, x: goal.x, z: goal.z });
      if (!path.length) continue;
      me.path = path;
      me.pending = item && actionFor(item, me.hold?.key ?? null, false) ? item.key : null;
      me.doing = null;
      const end = path[path.length - 1]!;
      if (marker.current) {
        marker.current.position.set(end.x, floorY(end.via, end.x) + 0.04, end.z);
        markerLife.current = 0.9;
      }
    }

    for (const cmd of controls.cmds.splice(0)) runCmd(cmd);
    if (!controls.decorate && decor.key) {
      commitDraft();
      decor.key = null;
    }

    for (const e of controls.emotes.splice(0)) {
      if (e === 'wave') me.motion.wave = WAVE_S;
      else if (e === 'dance') {
        me.motion.dance = DANCE_S;
        if (p && them.motion.dance > 0 && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 3) moment(`dance:${Math.floor(now / 20)}`, 'Dancing together');
      } else me.motion.heart = HEART_S;
      presence?.emote(e);
    }

    // The joystick: walk the way it points, from where the camera looks. Decorating, it moves what's picked.
    const [jx, jy] = controls.move;
    const mag = Math.min(1, Math.hypot(jx, jy));
    const fx = -Math.sin(controls.yaw);
    const fz = -Math.cos(controls.yaw);
    const rx = Math.cos(controls.yaw);
    const rz = -Math.sin(controls.yaw);
    const wx = fx * -jy + rx * jx;
    const wz = fz * -jy + rz * jx;
    let moving = false;
    if (controls.decorate && decor.key) {
      if (mag > 0.08) moveSelected(wx / Math.max(mag, 1e-6), wz / Math.max(mag, 1e-6), mag, dt);
      else commitDraft();
    } else if (mag > 0.08) {
      fun.moved();
      if (me.seat) standUp();
      me.path = [];
      me.pending = null;
      me.doing = null;
      if (!me.hands?.lead) me.hands = null;
      const swim = me.at === 'pool';
      const speed = (mag > 0.85 ? 3.6 : 1.0 + 1.9 * mag) * (swim ? 0.55 : 1);
      me.speed = speed;
      const len = Math.hypot(wx, wz) || 1;
      const step = speed * dt;
      const was = me.at;
      const next = walkStep(me.at, me.pos.x, me.pos.z, me.pos.x + (wx / len) * step, me.pos.z + (wz / len) * step);
      if (next.at !== was) openDoorBetween(was, next.at);
      me.pos.x = next.x;
      me.pos.z = next.z;
      me.at = next.at;
      me.heading += angleDiff(me.heading, Math.atan2(wx, wz)) * Math.min(1, dt * 12);
      moving = true;
    }

    // A tapped walk: through the doors and up the stairs.
    let budget = 2.6 * dt * (me.at === 'pool' ? 0.55 : 1);
    if (me.path.length) me.speed = 2.6;
    while (budget > 0 && me.path.length && !me.seat) {
      const wp = me.path[0]!;
      // Each leg of the walk crosses one region: that's where I am.
      if (wp.via !== me.at) {
        openDoorBetween(me.at, wp.via);
        me.at = wp.via;
      }
      const dx = wp.x - me.pos.x;
      const dz = wp.z - me.pos.z;
      const d = Math.hypot(dx, dz);
      moving = true;
      if (d > 0.001) me.heading += angleDiff(me.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
      if (d <= budget) {
        me.pos.x = wp.x;
        me.pos.z = wp.z;
        me.path.shift();
        budget -= d;
      } else {
        me.pos.x += (dx / d) * budget;
        me.pos.z += (dz / d) * budget;
        budget = 0;
      }
    }
    if (!me.path.length && me.pending) {
      const item = all.find((i) => i.key === me.pending);
      me.pending = null;
      if (item) {
        me.heading = Math.atan2(item.x - me.pos.x, item.z - me.pos.z);
        use(item);
      }
    }

    // Standing on the floor (or the stairs), or sitting where I sat.
    if (me.seat) {
      const item = all.find((i) => i.key === me.seat!.key);
      const sp = item && seatPose(item, me.seat.i);
      if (sp) {
        me.pos.set(sp.x, sp.y, sp.z);
        me.heading = sp.h;
      } else me.seat = null;
    } else {
      const via = me.path[0]?.via ?? me.at;
      const groundY = floorY(via, me.pos.x);
      me.pos.y += (groundY - me.pos.y) * Math.min(1, dt * (via === 'stairs' ? 20 : 7));
    }

    // What I'm busy with ends on its own.
    if (me.doing && now >= me.doing.until) {
      if (me.doing.key === 'dinner') fun.cooked();
      else if (me.doing.act === 'cook') {
        if (!dish) save(DISH_KEY, { on: true });
        if (them.pose?.a === 'cook') moment(`cook:${Math.floor(now / 30)}`, 'You cooked together');
        else onMoment?.('Dinner’s on the table');
      }
      me.doing = null;
    }

    // Two of us grabbed the same thing: whoever picked it up first keeps it.
    if (me.hold && p?.hk === me.hold.key && p.hs !== undefined && holdLoses({ since: me.hold.since, me: meId }, { since: p.hs, them: partnerId })) {
      me.hold = null;
      onMoment?.(`${partnerName} has it`);
    }

    // Hand in hand: the one who follows walks beside the one who leads (on their right).
    if (me.hands && !me.hands.lead) {
      if (p && p.a === 'hands:r' && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 3) {
        const rx = -Math.cos(p.h);
        const rz = Math.sin(p.h);
        const tx = p.x + rx * 0.55;
        const tz = p.z + rz * 0.55;
        const r = regionAt(tx, p.y + 0.1, tz);
        if (r) {
          me.pos.x += (tx - me.pos.x) * Math.min(1, dt * 10);
          me.pos.z += (tz - me.pos.z) * Math.min(1, dt * 10);
          me.pos.y = floorY(r.id, me.pos.x);
          me.at = r.id;
        }
        me.heading += angleDiff(me.heading, p.h) * Math.min(1, dt * 10);
        moving = p.m === 1;
        me.speed = p.s ?? 1.4;
      } else if (now - me.hands.since > 2) me.hands = null; // their answer to lead is a moment behind mine
    }
    if (me.hands?.lead && (!p || Math.hypot(p.x - me.pos.x, p.z - me.pos.z) > 3)) me.hands = null;
    // A kiss or a slow dance: turn to each other (and step close for the dance).
    // They hug me: I hug back.
    if (p && p.a === 'hug' && !me.doing && !me.seat && !moving && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 1.4) me.doing = { act: 'hug', until: now + HUG_S };
    const gap = me.doing?.act === 'kiss' ? 0.35 : me.doing?.act === 'hug' ? 0.45 : me.doing?.act === 'slow' ? 0.55 : 0;
    if (p && gap && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 2.5) {
      const dx = p.x - me.pos.x;
      const dz = p.z - me.pos.z;
      me.heading += angleDiff(me.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
      const d = Math.hypot(dx, dz);
      if (d > gap) {
        // Each of us covers half the way.
        const k = Math.min((d - gap) / 2, dt * 1.4) / d;
        const next = walkStep(me.at, me.pos.x, me.pos.z, me.pos.x + dx * k, me.pos.z + dz * k);
        me.pos.x = next.x;
        me.pos.z = next.z;
        me.at = next.at;
      }
    }
    const act = me.seat
      ? `${me.seat.lie ? 'lie' : 'sit'}:${me.seat.key}:${me.seat.i}`
      : me.hands
        ? me.hands.lead
          ? 'hands:r'
          : 'hands:l'
        : me.doing
          ? me.doing.act
          : me.at === 'pool'
            ? 'swim'
            : undefined;
    if (me.rig) {
      me.rig.root.position.copy(me.pos);
      me.rig.root.rotation.y = me.heading;
      me.rig.update(dt, { moving, speed: me.speed, swimming: me.at === 'pool' && !me.seat, act: bodyAct(act), carrying: !!me.hold, talking: talking && !moving && (!voice || voice.me > SPEAKING), lookAt: p && them.shown ? [them.pos.x, them.pos.y + 1.6, them.pos.z] : undefined }, me.motion);
    }
    const label = region(me.at).label;
    if (label !== me.place) {
      me.place = label;
      onPlace?.(label);
    }
    presence?.update({ x: me.pos.x, y: me.pos.y, z: me.pos.z, h: me.heading, m: moving ? 1 : 0, s: moving ? Math.round(me.speed * 10) / 10 : undefined, a: act, hk: me.hold?.key, hs: me.hold?.since });

    // What's cut away in the dollhouse: inside, the floor above and the roof,
    // and the walls between the camera and me drop to a low strip.
    const above = controls.view === 'above' || controls.decorate;
    const view = above ? viewFor(me.at, me.pos.y) : 'all';
    if (groups.upper) groups.upper.visible = view !== 'ground';
    if (groups.roof) groups.roof.visible = view === 'all' && (above || !region(me.at).inside);
    const cx = Math.sin(controls.yaw);
    const cz = Math.cos(controls.yaw);
    for (const w of walls.current) {
      const mineFloor = view === 'upper' ? w.upper : !w.upper;
      const cut = above && view !== 'all' && mineFloor && w.nx * cx + w.nz * cz > 0.3;
      w.obj.scale.y += ((cut ? 0.08 : 1) - w.obj.scale.y) * Math.min(1, dt * 10);
    }

    // My partner, eased between the poses they send.
    if (them.rig) {
      if (p) {
        const to = tmp.to.set(p.x, p.y, p.z);
        if (!them.shown || them.pos.distanceTo(to) > 6) them.pos.copy(to);
        else them.pos.lerp(to, Math.min(1, dt * 9));
        them.heading += angleDiff(them.heading, p.h) * Math.min(1, dt * 10);
        them.shown = true;
        them.rig.root.visible = !(view === 'ground' && them.pos.y > FLOOR_H / 2);
        them.rig.root.position.copy(them.pos);
        them.rig.root.rotation.y = them.heading;
        them.rig.update(dt, { moving: p.m === 1, speed: p.s, swimming: p.a === 'swim', act: bodyAct(p.a), carrying: !!p.hk, talking: talking && p.m !== 1 && (!voice || voice.them > SPEAKING), lookAt: [me.pos.x, me.pos.y + 1.6, me.pos.z] }, them.motion);
      } else {
        them.shown = false;
        them.rig.root.visible = false;
      }
    }
    const theirPlace = p ? (regionAt(p.x, p.y + 0.1, p.z)?.label ?? 'Garden') : null;
    if (theirPlace !== them.place) {
      them.place = theirPlace;
      onPartnerPlace?.(theirPlace);
    }

    // Carried things ride in a hand; the rest stay where they are (or where I'm dragging them).
    for (const it of all) {
      const o = objects.get(it.key);
      if (!o) continue;
      const mineHeld = me.hold?.key === it.key;
      const theirsHeld = !mineHeld && p?.hk === it.key && them.shown;
      if (mineHeld || theirsHeld) {
        const rig = mineHeld ? me.rig : them.rig;
        if (rig) rig.hand(o.position);
        o.rotation.y = mineHeld ? me.heading : them.heading;
      } else if (fun.place(it.key, o)) {
        // Flying: the ball's in the air.
      } else if (decor.key === it.key && decor.draft) {
        o.position.set(decor.draft.x, it.y, decor.draft.z);
        o.rotation.y = decor.draft.ry;
      } else {
        o.position.set(it.x, it.y, it.z);
        o.rotation.y = it.ry;
      }
    }

    // Together moments.
    const tvOn = all.some((i) => i.key === 'tv' && isOn(i));
    if (tvOn && me.seat?.key === 'sofa' && p?.a?.startsWith('sit:sofa:')) moment('movie', 'Movie night');
    const out = (a?: string) => !!a && (a.startsWith('lie:lounger') || a.startsWith('sit:balcony_chair'));
    if (night && out(act) && out(p?.a)) moment('stars', 'Stargazing together');
    if (me.doing?.act === 'hug' && p?.a === 'hug' && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < 1.3) moment(`hug:${Math.floor(now / 10)}`, 'A hug');

    // Footsteps (mine, and theirs quieter with distance), and a splash into the pool.
    if (sound) {
      if (moving && !me.seat && me.at !== 'pool') {
        me.stride += me.speed * dt;
        if (me.stride > (me.speed > 2.5 ? 0.85 : 0.65)) {
          me.stride = 0;
          sound.play(stepSound(me.at), me.speed > 2.5 ? 0.55 : 0.4);
        }
      }
      const inPool = me.at === 'pool';
      if (inPool && !splashed.current) sound.play('splash', 0.6);
      splashed.current = inPool;
      if (p && them.shown) {
        const far = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
        if (p.m === 1 && p.a !== 'swim') {
          them.stride += them.last.distanceTo(them.pos);
          if (them.stride > 0.7) {
            them.stride = 0;
            const r = regionAt(p.x, p.y + 0.1, p.z);
            sound.play(stepSound(r?.id ?? 'living'), 0.4 * nearness(far));
          }
        }
        const theyIn = p.a === 'swim';
        if (theyIn && !them.wasIn) sound.play('splash', 0.6 * nearness(far));
        them.wasIn = theyIn;
      }
      them.last.copy(them.pos);
      // Busy sounds: the pan, the watering can, close by.
      const stove = all.find((i) => i.key === 'counter');
      const cookingNear = (who: { x: number; z: number }, a?: string) => (a === 'cook' && stove ? nearness(Math.hypot(stove.x - who.x, stove.z - who.z)) : 0);
      const sizzle = Math.max(me.doing?.act === 'cook' ? 1 : 0, p ? cookingNear(p, p.a) * nearness(Math.hypot(p.x - me.pos.x, p.z - me.pos.z)) : 0);
      sound.loop('sizzle', sizzle * 0.35);
      sound.loop('pour', me.doing?.act === 'water' ? 0.4 : 0);
      // Outside: birds by day, crickets at night, the rain; softer indoors.
      const indoors = region(me.at).inside ? 0.45 : 1;
      sound.loop('birds', !night && weather !== 'rain' ? 0.22 * indoors : 0);
      sound.loop('crickets', night && weather !== 'rain' ? 0.18 * indoors : 0);
      sound.loop('rain', weather === 'rain' ? 0.35 * indoors : 0);
      sound.loop('music', music ? 0.3 : 0, music ? ((Date.now() - Date.parse(music.at ?? new Date().toISOString())) / 1000) % MUSIC_S : 0);
    }

    // The sun crosses the sky with the clock; the weather dims it.
    skyClock.current -= dt;
    if (skyClock.current <= 0) {
      skyClock.current = 2;
      // Day by the moon button while the clock says night: a full midday sun.
      const clockSky = skyAt(hoursNow());
      const s = !night && clockSky.night ? skyAt(12.5) : clockSky;
      const daylight = night ? 0 : Math.max(s.daylight, 0.35);
      const dim = weather === 'rain' ? 0.4 : weather === 'cloudy' ? 0.65 : weather === 'fog' ? 0.55 : 1;
      lightNow.current = { daylight, golden: night ? 0 : s.golden, dim, sun: s.sun };
      if (sun.current) sun.current.position.set(night ? 12 : s.sun[0], night ? 20 : s.sun[1], night ? 14 : s.sun[2]);
      const sky = night ? SKY_NIGHT : SKY_DAY.clone().lerp(GOLDEN, s.golden * 0.6).lerp(GREY, 1 - dim);
      if (!skyReady) scene.background = sky;
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.copy(sky);
        scene.fog.near = weather === 'fog' ? 4 : night ? 25 : 35;
        scene.fog.far = weather === 'fog' ? 32 : night ? 70 : 95;
      }
      if (skyReady) scene.backgroundIntensity = (night ? 0.6 : 0.5 + 0.5 * s.daylight) * dim;
    }
    const L = lightNow.current;

    // Rain falls round us, and never inside the house.
    if (rain.current) {
      rain.current.visible = weather === 'rain';
      if (weather === 'rain') {
        const pos = rain.current.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - dt * 11;
          if (y < 0) {
            y = 9 + Math.random() * 3;
            let x = me.pos.x + (Math.random() - 0.5) * 24;
            let z = me.pos.z + (Math.random() - 0.5) * 24;
            if (Math.abs(x) < 6.6 && Math.abs(z) < 4.8) x = x < 0 ? -6.8 - Math.random() * 3 : 6.8 + Math.random() * 3;
            pos.setX(i, x);
            pos.setZ(i, z);
          }
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    }
    // Fireflies on a dry night, drifting over the garden.
    if (flies.current) {
      flies.current.visible = night && weather !== 'rain';
      if (flies.current.visible) {
        const pos = flies.current.geometry.attributes.position as THREE.BufferAttribute;
        const t = clock.elapsedTime;
        for (let i = 0; i < pos.count; i++) {
          const b = FLIES[i]!;
          pos.setXYZ(i, b[0] + Math.sin(t * 0.4 + i) * 0.8, 0.6 + Math.sin(t * 0.9 + i * 1.7) * 0.35, b[1] + Math.cos(t * 0.3 + i * 0.7) * 0.8);
        }
        pos.needsUpdate = true;
        (flies.current.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.35;
      }
    }

    // Night: the moon, the stars, the lamps doing the work.
    if (sun.current) {
      sun.current.intensity += ((night ? 0.35 : (quality === 'low' ? 1.6 : 2.4) * L.daylight * L.dim) - sun.current.intensity) * Math.min(1, dt * 3);
      sun.current.color.set(night ? '#9DB4FF' : '#FFF1DC').lerp(SUNSET_LIGHT, L.golden * 0.7);
    }
    // Low quality has no lamp light, so its night keeps more of the sky's glow.
    if (hemi.current) hemi.current.intensity += ((night ? (quality === 'low' ? 0.55 : 0.22) : (quality === 'low' ? 1.1 : 0.7) * (0.6 + 0.4 * L.dim) * Math.max(0.5, L.daylight)) - hemi.current.intensity) * Math.min(1, dt * 3);
    // The night sky photo has its own stars.
    if (stars.current) stars.current.visible = night && !sky;

    if (marker.current) {
      markerLife.current = Math.max(0, markerLife.current - dt);
      marker.current.visible = markerLife.current > 0;
      marker.current.scale.setScalar(0.6 + (0.9 - markerLife.current) * 0.6);
    }

    // Things to do: at the table or the telescope, the camera looks where they need it to.
    const special = !controls.decorate && fun.camera(camera, dt);
    // Through my own eyes: the camera is my head, looking where I drag; I'm not drawn, so I don't see inside myself.
    const firstPerson = controls.view === 'first' && !controls.decorate && !special;
    if (me.rig) me.rig.root.visible = !firstPerson;
    if (firstPerson) {
      const eye = me.seat?.lie ? 0.55 : me.seat ? 1.15 : me.at === 'pool' ? 0.75 : 1.62;
      // Standing still, I turn to face where I look, so my partner sees it.
      if (!moving && !me.seat && !me.doing && !me.hands) me.heading += angleDiff(me.heading, controls.yaw + Math.PI) * Math.min(1, dt * 6);
      target.set(me.pos.x, me.pos.y + eye, me.pos.z);
      const fp = Math.cos(controls.pitch);
      tmp.dir.set(-Math.sin(controls.yaw) * fp, -Math.sin(controls.pitch), -Math.cos(controls.yaw) * fp);
      camera.position.copy(target).addScaledVector(tmp.dir, -0.12);
      camera.lookAt(tmp.cam.copy(target).add(tmp.dir));
    }

    // The camera: behind my shoulder (close or far), pulled in front of any wall behind me.
    const close = !above;
    const lift = close ? (me.seat?.lie ? 0.7 : me.seat ? 1.0 : 1.45) : 1.1;
    if (!firstPerson && !special) target.lerp(tmp.look.set(me.pos.x, me.pos.y + lift, me.pos.z), Math.min(1, dt * (close ? 10 : 6)));
    const cp = Math.cos(controls.pitch);
    if (!firstPerson) tmp.dir.set(Math.sin(controls.yaw) * cp, Math.sin(controls.pitch), Math.cos(controls.yaw) * cp);
    let dist = controls.dist;
    if (close && !firstPerson && !special) {
      ray.set(target, tmp.dir);
      ray.far = dist + 0.3;
      // Against the plain boxes (HouseColliders), not the real house's thousands of triangles.
      const wall = colliders.current ? ray.intersectObjects([colliders.current], true).find((h) => solid(h.object)) : undefined;
      if (wall) dist = Math.max(0.5, wall.distance - 0.25);
      ray.far = Infinity;
    }
    if (!firstPerson && !special) {
      tmp.cam.copy(target).addScaledVector(tmp.dir, dist);
      camera.position.lerp(tmp.cam, close ? Math.min(1, dt * 14) : 1);
      camera.lookAt(target);
    }

    fun.frame(dt);

    // Their voice from where they stand: quieter across the house, from their side of me.
    if (onVoice && talking) {
      const v = voiceAt.current;
      v.t -= dt;
      if (v.t <= 0) {
        v.t = 0.1;
        let gain = 1;
        let pan = 0;
        if (p && them.shown) {
          const dx = them.pos.x - me.pos.x;
          const dz = them.pos.z - me.pos.z;
          const d = Math.hypot(dx, dz) + Math.abs(them.pos.y - me.pos.y) * 1.5;
          gain = Math.max(0.18, Math.min(1, 1.35 / (1 + d / 3)));
          // The camera's right, flat on the floor.
          camera.getWorldDirection(tmp.look);
          const rx = -tmp.look.z;
          const rz = tmp.look.x;
          const rl = Math.hypot(rx, rz) || 1;
          pan = d > 0.3 ? Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / rl / Math.max(Math.hypot(dx, dz), 0.001)) * 0.85)) : 0;
        }
        if (Math.abs(gain - v.gain) > 0.02 || Math.abs(pan - v.pan) > 0.04) {
          v.gain = gain;
          v.pan = pan;
          onVoice(gain, pan);
        }
      }
    }

    // The buttons round the canvas: told only when something changed.
    const focus = focusFor(all);
    hud.current.focus = focus?.label ?? null;
    focusRun.current = focus?.run ?? null;
    const sel = decor.key ? all.find((i) => i.key === decor.key) : undefined;
    const state: HudState = {
      action: controls.decorate ? null : (focus?.label ?? null),
      seated: !!me.seat,
      holding: me.hold ? (itemDef(me.hold.key)?.label ?? null) : null,
      selected: sel ? { key: sel.key, label: sel.label, paint: !!sel.paint, added: !!addedModel(sel.key), moved: items.has(sel.key) } : null,
      nearPartner: !!(them.pose && them.shown && !controls.decorate && Math.hypot(them.pose.x - me.pos.x, them.pose.z - me.pos.z) < 1.8 && Math.abs(them.pose.y - me.pos.y) < 1),
      invite: asks.invite,
      asking: asks.asking,
      note: (() => {
        const fridge = all.find((i) => i.key === 'fridge');
        if (!fridge || controls.decorate || floorOf(me.pos.y) !== 0 || Math.hypot(fridge.x - me.pos.x, fridge.z - me.pos.z) > 1.8) return null;
        return note?.text && note.by && note.by !== meId ? 'read' : 'write';
      })(),
      fun: fun.hud(),
    };
    const sig = JSON.stringify(state);
    if (sig !== hud.current.last) {
      hud.current.last = sig;
      onHud?.(state);
    }

    if (ON_PHONE && gl.shadowMap.enabled && pace.current.frames % 2 === 0) gl.shadowMap.needsUpdate = true;
    const sh = opened.current;
    if (!sh.told && (real || !houseUrl) && ++sh.frames > 8) {
      sh.told = true;
      onReady?.();
    }
    const pc = pace.current;
    pc.frames++;
    pc.time += rawDt;
    if (pc.time >= 2 && typeof document !== 'undefined') {
      const rate = pc.frames / pc.time;
      const now = gl.getPixelRatio();
      if (!maxDpr.current) maxDpr.current = now;
      const next = rate < 50 ? Math.max(0.6, now - 0.25) : rate > 58 && now < maxDpr.current ? Math.min(maxDpr.current, now + 0.125) : now;
      if (next !== now) setDpr(next);
      pc.frames = 0;
      pc.time = 0;
    }
    const f = fps.current;
    f.frames++;
    f.time += rawDt;
    if (f.time >= 3) {
      onFps?.(f.frames / f.time, gl.info.render.calls);
      f.frames = 0;
      f.time = 0;
    }
  };
  const failed = useRef(false);
  // three.js's own drawing can fail too (a GL feature the phone lacks): stop and say so, rather than closing the app.
  useEffect(() => {
    const draw = gl.render.bind(gl);
    gl.render = (scene3d, cam) => {
      if (failed.current) return;
      try {
        draw(scene3d, cam);
      } catch (e) {
        failed.current = true;
        onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    };
    return () => {
      gl.render = draw;
    };
  }, [gl, onError]);
  // Closed: no more frames (a late one would play sounds and send where I am after the house has gone).
  const closed = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      if (sound) for (const l of LOOPS) sound.loop(l, 0);
    };
  }, [sound]);
  useFrame((_, rawDt) => {
    if (failed.current || closed.current) return;
    try {
      frame(rawDt);
    } catch (e) {
      failed.current = true;
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  });

  const focusRun = useRef<(() => void) | null>(null);
  const voiceAt = useRef({ t: 0, gain: 1, pan: 0 });

  /** Everything as the store has it this moment: a command can follow another in the next frame, before React re-renders. */
  const fresh = () => (store ? fun.fresh() : placedRef.current);

  function runCmd(cmd: HouseCmd) {
    const sel = decor.key ? fresh().find((i) => i.key === decor.key) : undefined;
    switch (cmd.t) {
      case 'fun':
      case 'pick':
      case 'closePanel':
        fun.cmd(cmd);
        return;
      case 'use':
        focusRun.current?.();
        return;
      case 'deselect':
        commitDraft();
        decor.key = null;
        return;
      case 'invite':
        asks.asking = cmd.kind;
        presence?.invite(cmd.kind);
        onMoment?.(`Asked ${partnerName}`);
        return;
      case 'answer': {
        const kind = asks.invite;
        asks.invite = null;
        if (!kind) return;
        presence?.answer(kind, cmd.yes);
        if (cmd.yes) begin(kind, false);
        return;
      }
      case 'photo':
        if (!capture) return;
        sound?.play('click', 0.6);
        void capture({ gl, scene, camera })
          .then(() => onMoment?.('Saved to Memories'))
          .catch(() => onMoment?.('Couldn’t save the photo'));
        return;
      case 'walkTo': {
        const r = regionAt(cmd.x, cmd.y + 0.1, cmd.z);
        if (!r) return;
        if (me.seat) standUp();
        me.path = findPath(me.at, { region: r.id, x: cmd.x, z: cmd.z });
        me.pending = cmd.use ?? null;
        me.doing = null;
        return;
      }
      case 'rotate':
        if (!sel) return;
        commitDraft();
        save(sel.key, { x: sel.x, z: sel.z, ry: sel.ry + cmd.by });
        return;
      case 'paint':
        if (sel?.paint) save(sel.key, { color: cmd.color });
        return;
      case 'remove':
        if (!sel) return;
        decor.key = null;
        decor.draft = null;
        // Something we added goes; something that came with the house goes back how it was.
        save(sel.key, null);
        return;
      case 'add': {
        const count = fresh().filter((i) => i.key.startsWith('add:')).length;
        if (count >= 24) return onMoment?.('The house is full');
        const key = addedKey(cmd.model, Math.random().toString(36).slice(2, 10));
        const x = me.pos.x + Math.sin(me.heading) * 1.3;
        const z = me.pos.z + Math.cos(me.heading) * 1.3;
        const r = regionAt(x, myFloorY() + 0.1, z) ? { x, z } : { x: me.pos.x, z: me.pos.z };
        save(key, { x: r.x, y: myFloorY(), z: r.z, ry: me.heading + Math.PI });
        decor.key = key;
        return;
      }
    }
  }

  /** Decorating: slide the picked thing along the floor, keeping it in the house. */
  function moveSelected(dx: number, dz: number, mag: number, dt: number) {
    const sel = fresh().find((i) => i.key === decor.key);
    if (!sel) return;
    const d = decor.draft ?? { x: sel.x, z: sel.z, ry: sel.ry };
    const step = 1.6 * mag * dt;
    // Somewhere you could stand, on its own floor; against a wall it slides along.
    const fits = (x: number, z: number) => {
      const r = regionAt(x, sel.y + 0.1, z);
      return !!r && floorOf(floorY(r.id, x)) === floorOf(sel.y);
    };
    for (const [x, z] of [
      [d.x + dx * step, d.z + dz * step],
      [d.x + dx * step, d.z],
      [d.x, d.z + dz * step],
    ] as const) {
      if (fits(x, z)) {
        d.x = x;
        d.z = z;
        decor.dirty = true;
        break;
      }
    }
    decor.draft = d;
  }

  function commitDraft() {
    if (!decor.key || !decor.draft || !decor.dirty) return;
    save(decor.key, { x: decor.draft.x, z: decor.draft.z, ry: decor.draft.ry });
    decor.dirty = false;
    decor.draft = null;
  }

  /** Crossing a shut door's doorway opens it, like walking up to it would. */
  function openDoorBetween(a: RegionId, b: RegionId) {
    const door = doorFor(a, b, placedRef.current);
    if (door && !isOpen(door)) {
      sound?.play('door', 0.5);
      save(door.key, { open: true });
    }
  }

  /** A spot in front of an item, where I'd stand to use it. */
  function approach(item: PlacedItem): THREE.Vector3 {
    const r = Math.min(Math.max(item.hw, item.hd), 0.9) + 0.45;
    const dx = me.pos.x - item.x;
    const dz = me.pos.z - item.z;
    const d = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(item.x + (dx / d) * r, item.y, item.z + (dz / d) * r);
  }

  const carried = useMemo(() => new Set<string>(), []);
  // Carried things are drawn on the ground floor's layer, so they never hide with a floor.
  carried.clear();
  if (me.hold) carried.add(me.hold.key);
  if (them.pose?.hk) carried.add(them.pose.hk);

  const dishItem: PlacedItem | null = useMemo(() => {
    if (!dish) return null;
    const t = placed.find((i) => i.key === 'dining_table');
    if (!t) return null;
    return { key: DISH_KEY, kind: 'carry', model: 'dish', label: 'Dinner', x: t.x, y: t.y + (t.top ?? 0.78), z: t.z, ry: 0, hw: 0.16, hd: 0.16, state: {} };
  }, [dish, placed]);
  const shownItems = dishItem ? [...placed, dishItem] : placed;

  return (
    <>
      <hemisphereLight ref={hemi} args={['#DCEBFF', '#5F7F45', quality === 'low' ? 1.1 : 0.7]} />
      <directionalLight ref={sun} position={[12, 20, 14]} intensity={quality === 'low' ? 1.6 : 2.4} color="#FFF1DC" castShadow={quality !== 'low' && !ON_PHONE} />
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshLambertMaterial color={night ? '#22351F' : '#6E9650'} />
      </mesh>
      <points ref={rain} geometry={rainGeo} visible={false}>
        <pointsMaterial color="#C9D6E3" size={0.06} transparent opacity={0.55} depthWrite={false} />
      </points>
      <points ref={flies} geometry={fliesGeo} visible={false}>
        <pointsMaterial color="#FFE98A" size={0.12} transparent opacity={0.8} depthWrite={false} fog={false} />
      </points>
      <points ref={stars} geometry={starGeo} visible={night}>
        <pointsMaterial color="#FFFFFF" size={0.35} sizeAttenuation fog={false} />
      </points>
      {houseUrl ? (
        <Optional>
        <Suspense fallback={null}>
          {/* At night the lamps take over; Low quality has none that light, so it keeps more of the baked glow. */}
          <RealHouse base={houseUrl} light={night ? (quality === 'low' ? 0.45 : 0.25) : 1} into={groups} onReady={onRealReady} />
        </Suspense>
        </Optional>
      ) : null}
      {real ? <Water quality={quality} /> : null}
      {houseUrl && !ON_PHONE ? (
        <Optional>
          <Suspense fallback={null}>
            <Sky base={houseUrl} night={night} onReady={onSkyReady} />
          </Suspense>
        </Optional>
      ) : null}
      <HouseColliders mats={mats} into={setColliders} />
      <HouseModel
        mats={mats}
        groups={groups}
        boxes={!real}
        ground={<Items items={shownItems} mats={mats} quality={quality} night={night} photos={photos} objects={objects} selected={decor.key} floor={0} carried={carried} assets={houseUrl} />}
        upper={<Items items={shownItems} mats={mats} quality={quality} night={night} photos={photos} objects={objects} selected={decor.key} floor={1} carried={carried} assets={houseUrl} />}
      />
      <Person look={mine} quality={quality} rigRef={setMine} ringColor="#FFFFFF" base={houseUrl} />
      <Person look={theirs} quality={quality} rigRef={setTheirs} ringColor="#FF8FB0" base={houseUrl} />
      {fun.scene}
      {tvVideo ? <TvVideo stream={tvVideo} tv={placed.find((i) => i.key === 'tv')} /> : null}
      <SpeakRing who={me.pos} level={() => (talking && voice ? voice.me : 0)} />
      <SpeakRing who={them.pos} level={() => (talking && voice && them.shown ? voice.them : 0)} />
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.26, 32]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} />
      </mesh>
    </>
  );
}

/** Their camera on the TV: a video texture over the screen. */
function TvVideo({ stream, tv }: { stream: MediaStream; tv?: PlacedItem }) {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const v = document.createElement('video');
    v.srcObject = stream;
    v.muted = true;
    v.playsInline = true;
    void v.play().catch(() => {});
    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    return { t, v };
  }, [stream]);
  useEffect(
    () => () => {
      if (!tex) return;
      tex.t.dispose();
      tex.v.srcObject = null;
    },
    [tex],
  );
  if (!tex || !tv) return null;
  return (
    <group position={[tv.x, tv.y, tv.z]} rotation={[0, tv.ry, 0]}>
      <mesh position={[0, 1.275, -0.095]}>
        <planeGeometry args={[1.8, 0.85]} />
        <meshBasicMaterial map={tex.t} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Rings rising over whoever's talking. */
function SpeakRing({ who, level }: { who: THREE.Vector3; level: () => number }) {
  const g = useRef<THREE.Mesh>(null);
  const shown = useRef(0);
  useFrame(({ clock }, dt) => {
    const m = g.current;
    if (!m) return;
    shown.current += ((level() > SPEAKING ? 1 : 0) - shown.current) * Math.min(1, dt * 8);
    m.visible = shown.current > 0.05;
    if (!m.visible) return;
    const k = (clock.elapsedTime * 1.6) % 1;
    m.position.set(who.x, who.y + 2.0 + k * 0.25, who.z);
    m.scale.setScalar(0.12 + k * 0.16);
    (m.material as THREE.MeshBasicMaterial).opacity = shown.current * (1 - k) * 0.8;
  });
  return (
    <mesh ref={g} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.8, 1, 24]} />
      <meshBasicMaterial color="#FFFFFF" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** What stops the camera: walls, floors and windows (it would end up outside looking in), not the water. */
function solid(o: THREE.Object3D): boolean {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!m && (!m.transparent || m.opacity < 0.5);
}

/** One of us: a real person once the pack is here (and loaded), the simple figure until then or if it fails. */
function Person({ base, ...p }: { look: LookState; quality: Quality; rigRef: (r: AvatarRig | null) => void; ringColor: string; base?: string }) {
  const simple = <Avatar look={p.look} quality={p.quality} rigRef={p.rigRef} ringColor={p.ringColor} />;
  if (!base) return simple;
  return (
    <Optional fallback={simple}>
      <Suspense fallback={simple}>
        <RealAvatar base={base} look={p.look} rigRef={p.rigRef} ringColor={p.ringColor} />
      </Suspense>
    </Optional>
  );
}

/** Seen on screen: it and everything it sits in are visible. */
function shown(o: THREE.Object3D | null): boolean {
  for (let at = o; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** The shortest turn from a to b. */
function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

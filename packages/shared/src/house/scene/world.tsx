import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { findPath, FLOOR_H, floorY, region, regionAt, SPAWN, type RegionId, type Waypoint } from '../layout';
import type { Emote, HousePresence } from '../presence';
import { Avatar, animateAvatar, HEART_S, newMotion, WAVE_S, type AvatarLook, type AvatarParts } from './avatar';
import { makeMaterials, type Quality } from './materials';
import { HouseModel, type HouseGroups } from './model';

/**
 * What the screen around the canvas feeds in: taps, drags and pinches on
 * mobile, the mouse and keys on the web. Plain numbers the scene reads every
 * frame, so a drag never re-renders React.
 */
export interface HouseControls {
  yaw: number;
  pitch: number;
  dist: number;
  /** Taps waiting to be handled, in normalised device coordinates. */
  taps: [number, number][];
  emotes: Emote[];
}

export const createControls = (): HouseControls => ({ yaw: 0.45, pitch: 0.82, dist: 10, taps: [], emotes: [] });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A drag of dx, dy pixels across a view w pixels wide turns the camera. */
export function orbitBy(c: HouseControls, dx: number, dy: number, w: number) {
  c.yaw -= (dx / Math.max(w, 1)) * Math.PI * 1.4;
  c.pitch = clamp(c.pitch + (dy / Math.max(w, 1)) * 2, 0.3, 1.4);
}

/** factor > 1 moves in. */
export function zoomBy(c: HouseControls, factor: number) {
  c.dist = clamp(c.dist / factor, 4, 22);
}

/** A tap at (x, y) in a w × h view. */
export function tapAt(c: HouseControls, x: number, y: number, w: number, h: number) {
  c.taps.push([(x / w) * 2 - 1, -((y / h) * 2 - 1)]);
}

export interface WorldProps {
  quality: Quality;
  controls: HouseControls;
  presence: HousePresence | null;
  mine: AvatarLook;
  theirs: AvatarLook;
  /** Where I am ('Kitchen'), when it changes. */
  onPlace?: (label: string) => void;
  /** Where my partner is, or null when they aren't in, when it changes. */
  onPartnerPlace?: (label: string | null) => void;
  /** Frames per second, every few seconds. */
  onFps?: (fps: number) => void;
}

const WALK_SPEED = 2.4;
const SKY = '#BFDDF2';

type View = 'all' | 'upper' | 'ground';

function viewFor(id: RegionId, y: number): View {
  const r = region(id);
  if (!r.inside) return 'all';
  return y > FLOOR_H / 2 ? 'upper' : 'ground';
}

/** The house, the two of us and the camera. Goes inside a Canvas. */
export function HouseWorld({ quality, controls, presence, mine, theirs, onPlace, onPartnerPlace, onFps }: WorldProps) {
  const { gl, scene, camera, invalidate } = useThree();
  const mats = useMemo(() => makeMaterials(quality), [quality]);
  useEffect(() => () => mats.dispose(), [mats]);
  const groups = useRef<HouseGroups>({ ground: null, upper: null, roof: null }).current;

  // Sky, haze and, above low quality, reflections from a soft studio light.
  useEffect(() => {
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 35, 95);
    gl.toneMappingExposure = 1.05;
    if (quality === 'low') return;
    let env: THREE.WebGLRenderTarget | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(gl);
      const room = new RoomEnvironment();
      env = pmrem.fromScene(room, 0.04);
      room.dispose();
      pmrem.dispose();
      scene.environment = env.texture;
      scene.environmentIntensity = 0.35;
    } catch {
      // No float render targets on this GPU: lights alone still look fine.
    }
    return () => {
      scene.environment = null;
      env?.dispose();
    };
  }, [gl, scene, quality]);

  // Shadows: everything catches them, solid things cast them.
  const walls = useRef<{ obj: THREE.Object3D; nx: number; nz: number; upper: boolean }[]>([]);
  useLayoutEffect(() => {
    const shadows = quality !== 'low';
    gl.shadowMap.enabled = shadows;
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
  }, [gl, groups, quality, mats]);

  // Low quality draws at most 30 frames a second, on demand.
  useEffect(() => {
    if (quality !== 'low') return;
    const t = setInterval(() => invalidate(), 1000 / 30);
    return () => clearInterval(t);
  }, [quality, invalidate]);

  const me = useRef({
    pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z),
    heading: Math.PI,
    at: SPAWN.region,
    path: [] as Waypoint[],
    motion: newMotion(),
    parts: null as AvatarParts | null,
    place: '',
  }).current;
  const them = useRef({ pos: new THREE.Vector3(), heading: 0, shown: false, motion: newMotion(), parts: null as AvatarParts | null, place: null as string | null }).current;
  const target = useRef(new THREE.Vector3(SPAWN.x, 1.1, SPAWN.z)).current;
  const marker = useRef<THREE.Mesh>(null);
  const markerLife = useRef(0);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  // Reused every frame, so walking makes no garbage.
  const tmp = useMemo(() => ({ ndc: new THREE.Vector2(), to: new THREE.Vector3(), look: new THREE.Vector3() }), []);
  const fps = useRef({ frames: 0, time: 0 });

  const setMine = useCallback((p: AvatarParts | null) => void (me.parts = p), [me]);
  const setTheirs = useCallback((p: AvatarParts | null) => void (them.parts = p), [them]);

  useEffect(() => {
    if (!presence) return;
    return presence.onEmote((e) => {
      if (e === 'wave') them.motion.wave = WAVE_S;
      else them.motion.heart = HEART_S;
    });
  }, [presence, them]);

  const sun = useRef<THREE.DirectionalLight>(null);
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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);

    // A tap walks me there, the way through the doors and up the stairs.
    while (controls.taps.length) {
      const [x, y] = controls.taps.shift()!;
      ray.setFromCamera(tmp.ndc.set(x, y), camera);
      const roots = [groups.ground, groups.upper, groups.roof].filter((g): g is THREE.Group => !!g && g.visible);
      const hit = ray.intersectObjects(roots, true).find((h) => shown(h.object));
      if (!hit) continue;
      const r = regionAt(hit.point.x, hit.point.y, hit.point.z);
      if (!r) continue;
      const path = findPath(me.at, { region: r.id, x: hit.point.x, z: hit.point.z });
      if (!path.length) continue;
      me.path = path;
      const end = path[path.length - 1]!;
      if (marker.current) {
        marker.current.position.set(end.x, floorY(end.via, end.x) + 0.04, end.z);
        markerLife.current = 0.9;
      }
    }

    for (const e of controls.emotes.splice(0)) {
      if (e === 'wave') me.motion.wave = WAVE_S;
      else me.motion.heart = HEART_S;
      presence?.emote(e);
    }

    // Walk.
    let moving = false;
    let budget = WALK_SPEED * dt;
    while (budget > 0 && me.path.length) {
      const wp = me.path[0]!;
      const dx = wp.x - me.pos.x;
      const dz = wp.z - me.pos.z;
      const d = Math.hypot(dx, dz);
      moving = true;
      if (d > 0.001) {
        const want = Math.atan2(dx, dz);
        me.heading += angleDiff(me.heading, want) * Math.min(1, dt * 12);
      }
      if (d <= budget) {
        me.pos.x = wp.x;
        me.pos.z = wp.z;
        me.at = wp.via;
        me.path.shift();
        budget -= d;
      } else {
        me.pos.x += (dx / d) * budget;
        me.pos.z += (dz / d) * budget;
        budget = 0;
      }
    }
    const via = me.path[0]?.via ?? me.at;
    const groundY = floorY(via, me.pos.x);
    me.pos.y += (groundY - me.pos.y) * Math.min(1, dt * (via === 'stairs' ? 20 : 7));
    if (me.parts) {
      me.parts.root.position.copy(me.pos);
      me.parts.root.rotation.y = me.heading;
      animateAvatar(me.parts, me.motion, dt, moving, via === 'pool');
    }
    const label = region(me.at).label;
    if (label !== me.place) {
      me.place = label;
      onPlace?.(label);
    }
    presence?.update({ x: me.pos.x, y: me.pos.y, z: me.pos.z, h: me.heading, m: moving ? 1 : 0 });

    // What's cut away: inside, the floor above and the roof; the walls
    // between the camera and me drop to a low strip.
    const view = viewFor(me.at, me.pos.y);
    if (groups.upper) groups.upper.visible = view !== 'ground';
    if (groups.roof) groups.roof.visible = view === 'all';
    const cx = Math.sin(controls.yaw);
    const cz = Math.cos(controls.yaw);
    for (const w of walls.current) {
      const mineFloor = view === 'upper' ? w.upper : !w.upper;
      const cut = view !== 'all' && mineFloor && w.nx * cx + w.nz * cz > 0.3;
      w.obj.scale.y += ((cut ? 0.08 : 1) - w.obj.scale.y) * Math.min(1, dt * 10);
    }

    // My partner, eased between the poses they send.
    const p = presence?.partner() ?? null;
    if (them.parts) {
      if (p) {
        const to = tmp.to.set(p.x, p.y, p.z);
        if (!them.shown || them.pos.distanceTo(to) > 6) them.pos.copy(to);
        else them.pos.lerp(to, Math.min(1, dt * 9));
        them.heading += angleDiff(them.heading, p.h) * Math.min(1, dt * 10);
        them.shown = true;
        const partnerUp = them.pos.y > FLOOR_H / 2;
        // Not floating in the air over a floor that's cut away.
        them.parts.root.visible = !(view === 'ground' && partnerUp);
        them.parts.root.position.copy(them.pos);
        them.parts.root.rotation.y = them.heading;
        animateAvatar(them.parts, them.motion, dt, p.m === 1, p.y < -0.5);
      } else {
        them.shown = false;
        them.parts.root.visible = false;
      }
    }
    const theirPlace = p ? (regionAt(p.x, p.y, p.z)?.label ?? 'Garden') : null;
    if (theirPlace !== them.place) {
      them.place = theirPlace;
      onPartnerPlace?.(theirPlace);
    }

    if (marker.current) {
      markerLife.current = Math.max(0, markerLife.current - dt);
      marker.current.visible = markerLife.current > 0;
      marker.current.scale.setScalar(0.6 + (0.9 - markerLife.current) * 0.6);
    }

    // The camera follows me from where the controls put it.
    target.lerp(tmp.look.set(me.pos.x, me.pos.y + 1.1, me.pos.z), Math.min(1, dt * 6));
    const cp = Math.cos(controls.pitch);
    camera.position.set(
      target.x + Math.sin(controls.yaw) * cp * controls.dist,
      target.y + Math.sin(controls.pitch) * controls.dist,
      target.z + Math.cos(controls.yaw) * cp * controls.dist,
    );
    camera.lookAt(target);

    const f = fps.current;
    f.frames++;
    f.time += rawDt;
    if (f.time >= 3) {
      onFps?.(f.frames / f.time);
      f.frames = 0;
      f.time = 0;
    }
  });

  return (
    <>
      <hemisphereLight args={['#DCEBFF', '#5F7F45', quality === 'low' ? 1.1 : 0.7]} />
      <directionalLight ref={sun} position={[12, 20, 14]} intensity={quality === 'low' ? 1.6 : 2.4} color="#FFF1DC" castShadow={quality !== 'low'} />
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshLambertMaterial color="#6E9650" />
      </mesh>
      <HouseModel mats={mats} groups={groups} />
      <Avatar look={mine} quality={quality} partsRef={setMine} ringColor="#FFFFFF" />
      <Avatar look={theirs} quality={quality} partsRef={setTheirs} ringColor="#FF8FB0" />
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.18, 0.26, 32]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.85} />
      </mesh>
    </>
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

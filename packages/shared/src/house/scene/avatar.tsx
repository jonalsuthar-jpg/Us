import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Quality } from './materials';

/**
 * One of us, drawn from simple shapes: legs and arms that swing as we walk,
 * a wave, and a heart that floats up. Phase 2 swaps in a rigged model; the
 * parts here are what that model's bones will drive.
 */

export interface AvatarLook {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
}

export const LOOKS: AvatarLook[] = [
  { skin: '#E8B48F', shirt: '#D94F70', pants: '#33415C', hair: '#3B2416' },
  { skin: '#C98E66', shirt: '#3E8E8A', pants: '#2E2E38', hair: '#1E1612' },
];

export interface AvatarParts {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  heart: THREE.Object3D;
  ring: THREE.Object3D;
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.1);
  s.bezierCurveTo(-0.02, -0.06, -0.12, -0.02, -0.12, 0.04);
  s.bezierCurveTo(-0.12, 0.11, -0.03, 0.12, 0, 0.06);
  s.bezierCurveTo(0.03, 0.12, 0.12, 0.11, 0.12, 0.04);
  s.bezierCurveTo(0.12, -0.02, 0.02, -0.06, 0, -0.1);
  return s;
}

export function Avatar({ look, quality, partsRef, ringColor }: { look: AvatarLook; quality: Quality; partsRef: (p: AvatarParts | null) => void; ringColor: string }) {
  const kit = useMemo(() => {
    const mat = (color: string, roughness = 0.8) => (quality === 'low' ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness }));
    return {
      skin: mat(look.skin, 0.7),
      shirt: mat(look.shirt, 0.9),
      pants: mat(look.pants, 0.9),
      hair: mat(look.hair, 0.6),
      heart: new THREE.MeshBasicMaterial({ color: '#FF4D7D', transparent: true, opacity: 0 }),
      ring: new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.55 }),
      limb: new THREE.CapsuleGeometry(1, 1, 4, 10),
      ball: new THREE.SphereGeometry(1, 20, 14),
      heartGeo: new THREE.ExtrudeGeometry(heartShape(), { depth: 0.04, bevelEnabled: false }),
      ringGeo: new THREE.RingGeometry(0.32, 0.4, 32),
    };
  }, [look, quality, ringColor]);

  useEffect(
    () => () => {
      for (const v of Object.values(kit)) (v as THREE.Material | THREE.BufferGeometry).dispose();
    },
    [kit],
  );

  // Refs attach children first, so the scene gets the parts once all are in.
  const parts = useRef<Partial<AvatarParts>>({}).current;
  const set = <K extends keyof AvatarParts>(k: K) => (o: AvatarParts[K] | null) => {
    if (o) parts[k] = o;
  };
  useLayoutEffect(() => {
    partsRef(parts as AvatarParts);
    return () => partsRef(null);
  }, [partsRef, parts, kit]);

  // A limb hangs from its joint: the pivot is at the top.
  const limb = (r: number, len: number, mat: THREE.Material) => (
    <mesh geometry={kit.limb} material={mat} position={[0, -len / 2 - r / 2, 0]} scale={[r, len / 2, r]} castShadow />
  );

  return (
    <group ref={set('root')}>
      <group ref={set('body')}>
        <group ref={set('legL')} position={[-0.1, 0.85, 0]}>
          {limb(0.085, 0.62, kit.pants)}
        </group>
        <group ref={set('legR')} position={[0.1, 0.85, 0]}>
          {limb(0.085, 0.62, kit.pants)}
        </group>
        <mesh geometry={kit.limb} material={kit.shirt} position={[0, 1.15, 0]} scale={[0.2, 0.2, 0.15]} castShadow />
        <group ref={set('armL')} position={[-0.27, 1.38, 0]}>
          {limb(0.06, 0.48, kit.shirt)}
        </group>
        <group ref={set('armR')} position={[0.27, 1.38, 0]}>
          {limb(0.06, 0.48, kit.shirt)}
        </group>
        <mesh geometry={kit.ball} material={kit.skin} position={[0, 1.6, 0]} scale={0.14} castShadow />
        <mesh geometry={kit.ball} material={kit.hair} position={[0, 1.65, -0.02]} scale={[0.15, 0.12, 0.15]} />
      </group>
      <mesh ref={set('heart')} geometry={kit.heartGeo} material={kit.heart} position={[0, 2.0, 0]} scale={1.6} visible={false} />
      <mesh ref={set('ring')} geometry={kit.ringGeo} material={kit.ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} />
    </group>
  );
}

export interface AvatarMotion {
  /** Seconds the walk cycle has run. */
  walk: number;
  /** 0 standing … 1 walking, eased. */
  stride: number;
  /** Seconds left of a wave, a heart or a dance. */
  wave: number;
  heart: number;
  dance: number;
  /** Seconds into whatever I'm doing (cooking, watering, a hug). */
  busy: number;
}

export const newMotion = (): AvatarMotion => ({ walk: 0, stride: 0, wave: 0, heart: 0, dance: 0, busy: 0 });

export const WAVE_S = 2.2;
export const HEART_S = 2.4;
export const DANCE_S = 4;

export interface Doing {
  moving: boolean;
  swimming: boolean;
  /** sit, lie, cook, water, hug, or nothing. */
  act: 'sit' | 'lie' | 'cook' | 'water' | 'hug' | null;
  carrying: boolean;
}

/** What a pose's activity means for the body. */
export function bodyAct(a: string | null | undefined): Doing['act'] {
  if (!a) return null;
  const kind = a.split(':')[0];
  return kind === 'sit' || kind === 'lie' || kind === 'cook' || kind === 'water' || kind === 'hug' ? kind : null;
}

/** Moves the limbs for this frame. */
export function animateAvatar(p: AvatarParts, m: AvatarMotion, dt: number, d: Doing) {
  const { moving, swimming, act, carrying } = d;
  m.stride += ((moving ? 1 : 0) - m.stride) * Math.min(1, dt * 8);
  m.walk += dt * (swimming ? 4 : 9) * Math.max(m.stride, 0.15);
  m.busy = act ? m.busy + dt : 0;
  const swing = Math.sin(m.walk) * 0.7 * m.stride;
  p.root.rotation.order = 'YXZ';
  p.root.rotation.x = act === 'lie' ? -Math.PI / 2 : 0;
  p.body.rotation.set(0, 0, 0);
  p.body.position.set(0, 0, 0);
  p.armL.rotation.set(-swing * 0.8, 0, 0.08);
  p.armR.rotation.set(swing * 0.8, 0, -0.08);
  p.legL.rotation.set(swing, 0, 0);
  p.legR.rotation.set(-swing, 0, 0);
  if (swimming) {
    p.body.rotation.x = 0.9 * m.stride + 0.2;
    p.legL.rotation.x = Math.sin(m.walk * 2) * 0.3;
    p.legR.rotation.x = -Math.sin(m.walk * 2) * 0.3;
    p.armL.rotation.x = -m.walk % (Math.PI * 2);
    p.armR.rotation.x = -(m.walk + Math.PI) % (Math.PI * 2);
    p.body.position.y = 0.55;
  } else if (act === 'sit') {
    // Hips on the seat, legs out in front.
    p.body.position.y = -0.82;
    p.legL.rotation.x = -Math.PI / 2;
    p.legR.rotation.x = -Math.PI / 2;
    p.armL.rotation.x = -0.5;
    p.armR.rotation.x = -0.5;
  } else if (act === 'lie') {
    p.body.position.set(0, 0.12, 0);
    p.armL.rotation.z = 0.25;
    p.armR.rotation.z = -0.25;
  } else {
    p.body.position.y = Math.abs(Math.sin(m.walk)) * 0.04 * m.stride;
  }
  if (act === 'cook') {
    p.armR.rotation.set(-1.2, 0, -0.3 + Math.sin(m.busy * 9) * 0.25);
    p.armL.rotation.set(-0.9, 0, 0.2);
  } else if (act === 'water') {
    p.armR.rotation.set(-1.1 + Math.sin(m.busy * 3) * 0.1, 0, -0.1);
  } else if (act === 'hug') {
    p.armL.rotation.set(-1.45, 0, -0.55);
    p.armR.rotation.set(-1.45, 0, 0.55);
  }
  if (carrying && act !== 'lie' && !swimming) {
    p.armR.rotation.x = -0.95;
    p.armL.rotation.x = Math.min(p.armL.rotation.x, -0.3);
  }
  if (m.dance > 0) {
    m.dance = Math.max(0, m.dance - dt);
    const t = m.dance * 6;
    p.body.rotation.z = Math.sin(t) * 0.18;
    p.body.position.y += Math.abs(Math.sin(t)) * 0.08;
    p.armL.rotation.set(Math.PI - 0.3, 0, 0.4 + Math.sin(t) * 0.3);
    p.armR.rotation.set(Math.PI - 0.3, 0, -0.4 - Math.sin(t) * 0.3);
  }
  if (m.wave > 0) {
    m.wave = Math.max(0, m.wave - dt);
    p.armR.rotation.x = Math.PI;
    p.armR.rotation.z = -0.35 + Math.sin(m.wave * 12) * 0.35;
  }
  const heart = p.heart as THREE.Mesh;
  const mat = heart.material as THREE.MeshBasicMaterial;
  if (m.heart > 0) {
    m.heart = Math.max(0, m.heart - dt);
    const t = 1 - m.heart / HEART_S;
    heart.visible = true;
    heart.position.y = 1.95 + t * 0.7;
    heart.rotation.y += dt * 2;
    mat.opacity = Math.min(1, t * 6, m.heart * 2);
  } else if (heart.visible) {
    heart.visible = false;
  }
}

/** Where the right hand is, in the avatar's own frame, for carrying things. */
export const HAND = { x: 0.22, y: 1.0, z: 0.38 };

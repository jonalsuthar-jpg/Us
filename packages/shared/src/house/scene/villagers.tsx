import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { POND } from '../village';
import { duckAt, VILLAGERS, villagerAt, villagerHello, type Villager } from '../villagers';
import { newMotion, WAVE_S, type AvatarRig } from './avatar';
import { RealAvatar } from './avatar-real';
import { Optional } from './real-house';

/**
 * The village's people and the ducks on the pond, where villagers.ts says
 * they are this moment. Far away they move less often; out of sight they
 * aren't drawn. Come up to someone at work and they turn and say hello.
 */
export function Villagers({ base, near, coupleId, say, show = SHOW_M }: { base: string; near: THREE.Vector3; coupleId: string; say: (text: string) => void; show?: number }) {
  return (
    <>
      {VILLAGERS.map((v) => (
        <OneVillager key={v.id} v={v} base={base} near={near} coupleId={coupleId} say={say} show={show} />
      ))}
      <Ducks near={near} />
    </>
  );
}

/** Beyond this they aren't drawn; beyond NEAR_M they move at 15 frames a second. */
const SHOW_M = 55;
const NEAR_M = 15;
const HELLO_M = 2.6;

function OneVillager({ v, base, near, coupleId, say, show }: { v: Villager; base: string; near: THREE.Vector3; coupleId: string; say: (text: string) => void; show: number }) {
  const rig = useRef<AvatarRig | null>(null);
  const motion = useMemo(newMotion, []);
  const st = useRef({ acc: 0, greeted: 0, close: false }).current;
  useFrame((_, dt) => {
    const r = rig.current;
    if (!r) return;
    const now = Date.now();
    const p = villagerAt(v, now, coupleId);
    const d = p ? Math.hypot(p.x - near.x, p.z - near.z) : Infinity;
    r.root.visible = d < show;
    if (!p || !r.root.visible) return;
    r.root.position.set(p.x, 0, p.z);
    const close = d < HELLO_M;
    // Someone at work turns to face me when I come up.
    r.root.rotation.y = close && !p.moving ? Math.atan2(near.x - p.x, near.z - p.z) : p.h;
    if (close && !st.close && now - st.greeted > 60_000) {
      st.greeted = now;
      motion.wave = WAVE_S;
      if (!p.moving) say(villagerHello(v, now));
    }
    st.close = close;
    st.acc += dt;
    if (d > NEAR_M && st.acc < 1 / 15) return;
    r.update(st.acc, { moving: p.moving, speed: p.speed, swimming: false, act: null, carrying: false, lookAt: d < 6 ? [near.x, near.y + 1.6, near.z] : undefined }, motion);
    st.acc = 0;
  });
  return (
    <Optional>
      <Suspense fallback={null}>
        <RealAvatar base={base} look={v.look} rigRef={(r) => void (rig.current = r)} ringColor="#FFFFFF" ring={false} />
      </Suspense>
    </Optional>
  );
}

/** Four ducks paddling slow circles, bobbing. */
function Ducks({ near }: { near: THREE.Vector3 }) {
  const kit = useMemo(() => {
    const body = new THREE.SphereGeometry(1, 10, 8);
    const beak = new THREE.ConeGeometry(0.04, 0.1, 6);
    return {
      body,
      beak,
      white: new THREE.MeshStandardMaterial({ color: '#F4F1EA', roughness: 0.8 }),
      brown: new THREE.MeshStandardMaterial({ color: '#7A5A3A', roughness: 0.8 }),
      green: new THREE.MeshStandardMaterial({ color: '#2F6B3A', roughness: 0.5 }),
      orange: new THREE.MeshStandardMaterial({ color: '#E8862A', roughness: 0.6 }),
    };
  }, []);
  const ducks = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const now = Date.now();
    const pondNear = Math.hypot((POND.x0 + POND.x1) / 2 - near.x, (POND.z0 + POND.z1) / 2 - near.z) < 60;
    ducks.current.forEach((g, i) => {
      if (!g) return;
      g.visible = pondNear;
      if (!pondNear) return;
      const d = duckAt(i, now, POND);
      g.position.set(d.x, -0.12 + Math.sin(clock.elapsedTime * 2 + i) * 0.015, d.z);
      g.rotation.y = d.h;
    });
  });
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} ref={(g) => void (ducks.current[i] = g)}>
          <mesh geometry={kit.body} material={i % 2 ? kit.white : kit.brown} scale={[0.13, 0.1, 0.2]} position={[0, 0.06, 0]} />
          <mesh geometry={kit.body} material={i % 2 ? kit.white : kit.green} scale={0.07} position={[0, 0.17, 0.15]} />
          <mesh geometry={kit.beak} material={kit.orange} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.16, 0.24]} />
        </group>
      ))}
    </>
  );
}

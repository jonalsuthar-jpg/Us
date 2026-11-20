import { useLoader } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HAIRSTYLES, SKINS, SKIN_TINTS, type LookState } from '../items';
import { animateHeart, heartShape, type AvatarMotion, type AvatarRig, type Doing } from './avatar';
import { plainGlass } from './real-house';

/**
 * One of us as a real person (Quaternius Universal Base Characters, CC0,
 * dressed by scripts/blender/build_characters.py), moved by the Universal
 * Animation Library. The same skeleton for both, so every move fits.
 *
 * What we're doing picks the animation, cross-faded; the few things the
 * library has no clip for (a wave, carrying, a hug) bend the arm bones on
 * top of it.
 */

type Clip = 'Idle_Loop' | 'Idle_Talking_Loop' | 'Walk_Loop' | 'Jog_Fwd_Loop' | 'Sprint_Loop' | 'Sitting_Idle_Loop' | 'Swim_Idle_Loop' | 'Swim_Fwd_Loop' | 'Dance_Loop' | 'Interact' | 'Fixing_Kneeling';

const FADE = 0.25;
const WALK_SPEED = 1.4;

/** What we're doing → which animation, and how fast it plays. */
export function clipFor(d: Doing, m: AvatarMotion): { clip: Clip; speed: number } {
  if (m.dance > 0) return { clip: 'Dance_Loop', speed: 1 };
  if (d.swimming) return { clip: d.moving ? 'Swim_Fwd_Loop' : 'Swim_Idle_Loop', speed: 1 };
  if (d.act === 'sit') return { clip: 'Sitting_Idle_Loop', speed: 1 };
  if (d.act === 'cook') return { clip: 'Interact', speed: 0.8 };
  if (d.act === 'water') return { clip: 'Fixing_Kneeling', speed: 1 };
  if (d.moving) {
    const s = d.speed ?? WALK_SPEED;
    if (s > 3.2) return { clip: 'Sprint_Loop', speed: s / 5 };
    if (s > 2.0) return { clip: 'Jog_Fwd_Loop', speed: s / 3 };
    return { clip: 'Walk_Loop', speed: Math.max(0.6, s / WALK_SPEED) };
  }
  if (d.talking) return { clip: 'Idle_Talking_Loop', speed: 1 };
  return { clip: 'Idle_Loop', speed: 1 };
}

// Bones point along their own +Y (Blender's convention, kept by glTF).
const UP = new THREE.Vector3(0, 1, 0);
const tmp = { q: new THREE.Quaternion(), p: new THREE.Quaternion(), dir: new THREE.Vector3(), cur: new THREE.Vector3(), d: new THREE.Quaternion() };

/** Turn a bone so it points along `dir` (in the avatar's own frame, facing +z; its right is -x). */
function aim(bone: THREE.Object3D | undefined, dir: THREE.Vector3, rootQ: THREE.Quaternion, amount = 1) {
  if (!bone?.parent) return;
  tmp.dir.copy(dir).normalize().applyQuaternion(rootQ);
  bone.getWorldQuaternion(tmp.q);
  tmp.cur.copy(UP).applyQuaternion(tmp.q);
  tmp.d.setFromUnitVectors(tmp.cur, tmp.dir);
  if (amount < 1) tmp.d.slerp(new THREE.Quaternion(), 1 - amount);
  tmp.q.premultiply(tmp.d);
  bone.parent.getWorldQuaternion(tmp.p);
  bone.quaternion.copy(tmp.p.invert().multiply(tmp.q));
  bone.updateMatrixWorld(true);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function RealAvatar({ base, look, rigRef, ringColor }: { base: string; look: LookState; rigRef: (r: AvatarRig | null) => void; ringColor: string }) {
  const body = look.body === 'm' ? 'm' : 'f';
  const [person, moves] = useLoader(GLTFLoader, [`${base}/characters/body_${body}.glb`, `${base}/characters/moves.glb`]);

  // Our own copy (skinned meshes need SkeletonUtils), dressed in our colours.
  const made = useMemo(() => {
    const scene = SkeletonUtils.clone(person!.scene) as THREE.Group;
    const mats: THREE.Material[] = [];
    const style = HAIRSTYLES.includes(look.style as (typeof HAIRSTYLES)[number]) ? look.style : body === 'm' ? 'Hair_SimpleParted' : 'Hair_Long';
    const skinTint = SKIN_TINTS[Math.max(0, SKINS.indexOf(look.skin))] ?? '#FFFFFF';
    const bones: Record<string, THREE.Object3D> = {};
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o;
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (o.name.startsWith('Hair_')) {
        o.visible = o.name === style || (o.name === 'Hair_Beard' && !!look.beard);
      }
      const src = plainGlass(mesh.material as THREE.MeshStandardMaterial);
      const mat = src.clone();
      mats.push(mat);
      const name = src.name;
      if (name === 'Cloth_Top') mat.color.set(look.shirt);
      else if (name === 'Cloth_Bottom') mat.color.set(look.pants);
      else if (name === 'Shoes') mat.color.set(look.shoes ?? '#F2F0EA');
      else if (name.startsWith('MI_Hair')) mat.color.set(look.hair);
      else if (name.startsWith('MI_Superhero')) mat.color.set(skinTint);
      mesh.material = mat;
    });
    return { scene, mats, bones };
  }, [person, look, body]);
  useEffect(() => () => made.mats.forEach((m) => m.dispose()), [made]);

  const mixer = useMemo(() => new THREE.AnimationMixer(made.scene), [made]);
  const actions = useMemo(() => {
    const out = new Map<string, THREE.AnimationAction>();
    for (const clip of moves!.animations) out.set(clip.name, mixer.clipAction(clip));
    return out;
  }, [mixer, moves]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  const root = useRef<THREE.Group>(null);
  const body3d = useRef<THREE.Group>(null);
  const heart = useRef<THREE.Mesh>(null);
  const heartKit = useMemo(
    () => ({ geo: new THREE.ExtrudeGeometry(heartShape(), { depth: 0.04, bevelEnabled: false }), mat: new THREE.MeshBasicMaterial({ color: '#FF4D7D', transparent: true, opacity: 0 }), ring: new THREE.RingGeometry(0.32, 0.4, 32), ringMat: new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.55 }) }),
    [ringColor],
  );
  useEffect(
    () => () => {
      heartKit.geo.dispose();
      heartKit.mat.dispose();
      heartKit.ring.dispose();
      heartKit.ringMat.dispose();
    },
    [heartKit],
  );

  useLayoutEffect(() => {
    const r = root.current;
    const b = body3d.current;
    if (!r || !b) return;
    let playing: THREE.AnimationAction | null = null;
    let waveT = 0;
    const rq = new THREE.Quaternion();
    const rig: AvatarRig = {
      root: r,
      update(dt, d, m) {
        const { clip, speed } = clipFor(d, m);
        const next = actions.get(clip) ?? actions.get('Idle_Loop')!;
        if (next !== playing) {
          next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(FADE).play();
          playing?.fadeOut(FADE);
          playing = next;
        }
        next.setEffectiveTimeScale(speed);
        mixer.update(dt);
        // Lying down: on our back, along the bed (the model's feet are its pivot).
        r.rotation.order = 'YXZ';
        r.rotation.x = d.act === 'lie' ? -Math.PI / 2 : 0;
        b.position.y = d.act === 'lie' ? 0.1 : 0;
        r.updateMatrixWorld(true);
        r.getWorldQuaternion(rq);
        const B = made.bones;
        if (d.carrying && !d.swimming && d.act !== 'lie') {
          aim(B.upperarm_r, V(-0.15, -0.55, 0.8), rq, 0.9);
          aim(B.lowerarm_r, V(-0.05, 0.05, 1), rq, 0.9);
        }
        if (d.act === 'hug') {
          aim(B.upperarm_r, V(-0.3, 0.05, 1), rq);
          aim(B.lowerarm_r, V(0.9, 0.05, 0.4), rq);
          aim(B.upperarm_l, V(0.3, 0.05, 1), rq);
          aim(B.lowerarm_l, V(-0.9, 0.05, 0.4), rq);
        }
        if (m.wave > 0) {
          waveT += dt;
          aim(B.upperarm_r, V(-0.55, 0.85, 0.15), rq);
          aim(B.lowerarm_r, V(-0.2 + Math.sin(waveT * 12) * 0.35, 1, 0.1), rq);
          m.wave = Math.max(0, m.wave - dt);
        } else waveT = 0;
        if (m.dance > 0) m.dance = Math.max(0, m.dance - dt);
        if (heart.current) animateHeart(heart.current, m, dt);
      },
      hand(out) {
        const h = made.bones.hand_r;
        return h ? h.getWorldPosition(out) : r.getWorldPosition(out).setY(r.position.y + 1);
      },
    };
    rigRef(rig);
    return () => rigRef(null);
  }, [rigRef, mixer, actions, made]);

  return (
    <group ref={root}>
      <group ref={body3d}>
        <primitive object={made.scene} />
      </group>
      <mesh ref={heart} geometry={heartKit.geo} material={heartKit.mat} position={[0, 2.1, 0]} scale={1.6} visible={false} />
      <mesh geometry={heartKit.ring} material={heartKit.ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} />
    </group>
  );
}

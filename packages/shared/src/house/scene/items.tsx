import { useFrame, useLoader } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isOn, isOpen, type ItemModel, type PlacedItem } from '../items';
import type { Materials, Quality } from './materials';
import { FunBall, funModel } from './fun-models';
import { REAL_MODELS, type RealModel } from './furniture';
import { B, KitContext, useKit, type MatKey } from './model';
import { Optional, plainGlass } from './real-house';

/**
 * The things in the house, drawn from boxes like the house itself. Each
 * model faces +z in its own frame, standing on y = 0; ItemView turns and
 * moves it to where the item is. Doors swing, lamps glow, the TV and the
 * frames show our photos.
 */

interface Look {
  item: PlacedItem;
  /** Its paint, when we recoloured it. */
  paint?: THREE.Material;
  on: boolean;
  open: boolean;
  night: boolean;
  photos: HousePhoto[];
}

export interface HousePhoto {
  path: string;
  url: string;
}

/** A door leaf that swings round its hinge (x = 0) towards `to`. */
function Swing({ open, to = 1.45, children, x = 0, z = 0 }: { open: boolean; to?: number; children: ReactNode; x?: number; z?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!g.current) return;
    const want = open ? to : 0;
    g.current.rotation.y += (want - g.current.rotation.y) * Math.min(1, dt * 6);
  });
  return (
    <group ref={g} position={[x, 0, z]}>
      {children}
    </group>
  );
}

function Lamp({ on, a, b }: { on: boolean; a: [number, number, number]; b: [number, number, number] }) {
  return <B a={a} b={b} m={on ? 'lamp' : 'lampOff'} />;
}

/** A photo on a plane, or a soft glow while it loads. */
function Photo({ url, w, h, z = 0, y = 0, glow }: { url?: string; w: number; h: number; z?: number; y?: number; glow?: boolean }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return setTex(null);
    let live = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (t) => {
        if (!live) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        setTex(t);
      },
      undefined,
      () => live && setTex(null),
    );
    return () => {
      live = false;
    };
  }, [url]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const mat = useMemo(() => (tex ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: glow ? '#3A5A8C' : '#D9CFC2' })), [tex, glow]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh position={[0, y, z]} material={mat}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

/** Our photos, one after another, while the TV is on. */
function Slideshow({ photos, w, h, z, y }: { photos: HousePhoto[]; w: number; h: number; z: number; y: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % photos.length), 7000);
    return () => clearInterval(t);
  }, [photos.length]);
  return <Photo url={photos[i % Math.max(photos.length, 1)]?.url} w={w} h={h} z={z} y={y} glow />;
}

function hashOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function Model({ look }: { look: Look }): ReactNode {
  const { item, paint, on, open, photos } = look;
  const p = (m: MatKey) => (paint ? { mat: paint } : { m });
  switch (item.model as ItemModel) {
    case 'sofa':
      return (
        <>
          <B a={[-1.3, 0.1, -0.48]} b={[1.3, 0.45, 0.48]} {...p('fabric')} />
          <B a={[-1.3, 0.45, -0.48]} b={[1.3, 0.95, -0.23]} {...p('fabric')} />
          <B a={[-1.3, 0.1, -0.48]} b={[-1.1, 0.7, 0.48]} {...p('fabric')} />
          <B a={[1.1, 0.1, -0.48]} b={[1.3, 0.7, 0.48]} {...p('fabric')} />
          <B a={[-1.05, 0.45, -0.25]} b={[-0.02, 0.58, 0.45]} m="cushion" />
          <B a={[0.02, 0.45, -0.25]} b={[1.05, 0.58, 0.45]} m="cushion" />
          <B a={[-1.25, 0, -0.43]} b={[1.25, 0.1, 0.43]} m="woodDark" />
        </>
      );
    case 'armchair':
      return (
        <>
          <B a={[-0.45, 0.1, -0.45]} b={[0.45, 0.45, 0.45]} {...p('fabricWarm')} />
          <B a={[-0.45, 0.45, -0.45]} b={[0.45, 0.95, -0.25]} {...p('fabricWarm')} />
          <B a={[-0.45, 0.1, -0.45]} b={[-0.33, 0.68, 0.45]} {...p('fabricWarm')} />
          <B a={[0.33, 0.1, -0.45]} b={[0.45, 0.68, 0.45]} {...p('fabricWarm')} />
          <B a={[-0.32, 0.45, -0.24]} b={[0.32, 0.56, 0.42]} m="cushion" />
          <B a={[-0.4, 0, -0.4]} b={[0.4, 0.1, 0.4]} m="woodDark" />
        </>
      );
    case 'beanbag':
      return <Blob paint={paint} />;
    case 'coffeeTable':
      return (
        <>
          <B a={[-0.55, 0.38, -0.35]} b={[0.55, 0.43, 0.35]} m="wood" />
          <B a={[-0.5, 0, -0.3]} b={[0.5, 0.38, 0.3]} m="woodDark" />
        </>
      );
    case 'tvUnit':
      return (
        <>
          <B a={[-1.1, 0, -0.25]} b={[1.1, 0.5, 0.2]} m="woodDark" />
          <TvPanel on={on} photos={photos} />
        </>
      );
    case 'bookshelf':
      return (
        <>
          <B a={[-0.7, 0, -0.2]} b={[0.7, 1.9, -0.17]} {...p('wood')} />
          <B a={[-0.7, 0, -0.2]} b={[-0.66, 1.9, 0.2]} {...p('wood')} />
          <B a={[0.66, 0, -0.2]} b={[0.7, 1.9, 0.2]} {...p('wood')} />
          {[0, 0.47, 0.94, 1.41, 1.86].map((y) => (
            <B key={y} a={[-0.7, y, -0.2]} b={[0.7, y + 0.04, 0.2]} {...p('wood')} />
          ))}
          {[0.04, 0.51, 0.98, 1.45].map((y, r) => (
            <group key={y}>
              {[-0.55, -0.4, -0.27, -0.1, 0.1, 0.3, 0.45].map((x, i) => (
                <B key={x} a={[x, y, -0.15]} b={[x + 0.11, y + 0.3 + ((i + r) % 3) * 0.04, 0.12]} m={(['fabric', 'rug', 'blanket', 'fabricWarm', 'cushion'] as MatKey[])[(i + r) % 5]!} />
              ))}
            </group>
          ))}
        </>
      );
    case 'floorLamp':
      return (
        <>
          <B a={[-0.15, 0, -0.15]} b={[0.15, 0.04, 0.15]} m="metal" />
          <B a={[-0.03, 0.04, -0.03]} b={[0.03, 1.5, 0.03]} m="metal" />
          <Lamp on={on} a={[-0.25, 1.5, -0.25]} b={[0.25, 1.85, 0.25]} />
        </>
      );
    case 'rug':
      return <B a={[-item.hw, 0.001, -item.hd]} b={[item.hw, 0.012, item.hd]} {...p('rug')} />;
    case 'plantPot':
      return (
        <>
          <B a={[-0.25, 0, -0.25]} b={[0.25, 0.45, 0.25]} m="potTerracotta" />
          <B a={[-0.3, 0.45, -0.3]} b={[0.3, 1.3, 0.3]} m="leaves" />
          <B a={[-0.18, 1.3, -0.18]} b={[0.18, 1.55, 0.18]} m="leavesLight" />
        </>
      );
    case 'diningTable':
      return (
        <>
          <B a={[-0.7, 0.72, -0.8]} b={[0.7, 0.78, 0.8]} {...p('wood')} />
          {[
            [-0.6, -0.7],
            [0.52, -0.7],
            [-0.6, 0.62],
            [0.52, 0.62],
          ].map(([x, z]) => (
            <B key={`${x}${z}`} a={[x!, 0, z!]} b={[x! + 0.08, 0.72, z! + 0.08]} m="woodDark" />
          ))}
        </>
      );
    case 'chair':
      return (
        <>
          <B a={[-0.22, 0.42, -0.2]} b={[0.22, 0.47, 0.2]} {...p('wood')} />
          <B a={[-0.2, 0, -0.22]} b={[0.2, 0.95, -0.17]} m="woodDark" />
          <B a={[-0.2, 0, 0.14]} b={[-0.16, 0.42, 0.18]} m="woodDark" />
          <B a={[0.16, 0, 0.14]} b={[0.2, 0.42, 0.18]} m="woodDark" />
        </>
      );
    case 'counter':
      return (
        <>
          <B a={[-2.3, 0, -0.3]} b={[2.3, 0.86, 0.3]} m="woodDark" />
          <B a={[-2.35, 0.86, -0.35]} b={[2.35, 0.92, 0.35]} m="counter" />
          {/* Hob and sink. */}
          <B a={[0.6, 0.92, -0.25]} b={[1.3, 0.93, 0.25]} m="black" />
          {[0.78, 1.12].map((x) => (
            <B key={x} a={[x - 0.1, 0.93, -0.1]} b={[x + 0.1, 0.935, 0.1]} m={on ? 'ember' : 'metal'} />
          ))}
          <B a={[-1.2, 0.88, -0.22]} b={[-0.6, 0.925, 0.22]} m="metal" />
          <B a={[-0.93, 0.92, -0.3]} b={[-0.87, 1.2, -0.26]} m="metal" />
          {/* Cupboard fronts. */}
          {[-1.9, -1.1, -0.3, 0.5, 1.3].map((x) => (
            <B key={x} a={[x + 0.03, 0.08, 0.3]} b={[x + 0.77, 0.8, 0.31]} m="wood" />
          ))}
        </>
      );
    case 'fridge':
      return (
        <>
          <B a={[-0.37, 0, -0.37]} b={[0.37, 2.0, 0.33]} m="fridge" />
          <Swing open={open} to={-1.6} x={0.37} z={0.33}>
            <B a={[-0.74, 0.02, 0]} b={[0, 1.98, 0.05]} m="fridge" />
            <B a={[-0.7, 0.9, 0.05]} b={[-0.66, 1.4, 0.08]} m="metal" />
          </Swing>
          {open ? <B a={[-0.33, 0.4, -0.33]} b={[0.33, 1.9, 0.3]} m="lampBright" /> : null}
        </>
      );
    case 'pendant':
      return (
        <>
          <Lamp on={on} a={[-0.12, 2.2, -0.12]} b={[0.12, 2.4, 0.12]} />
          <B a={[-0.02, 2.4, -0.02]} b={[0.02, 2.85, 0.02]} m="black" />
        </>
      );
    case 'bed':
      return (
        <>
          <B a={[-1.0, 0, -1.1]} b={[1.0, 0.3, 1.1]} {...p('wood')} />
          <B a={[-0.95, 0.3, -1.05]} b={[0.95, 0.55, 1.05]} m="bedding" />
          <B a={[-0.97, 0.55, 0.0]} b={[0.97, 0.6, 1.07]} m="blanket" />
          <B a={[-0.85, 0.55, -1.0]} b={[-0.1, 0.7, -0.6]} m="cushion" />
          <B a={[0.1, 0.55, -1.0]} b={[0.85, 0.7, -0.6]} m="cushion" />
          <B a={[-1.05, 0, -1.12]} b={[1.05, 1.2, -1.0]} {...p('woodDark')} />
        </>
      );
    case 'nightstand':
      return (
        <>
          <B a={[-0.25, 0, -0.25]} b={[0.25, 0.55, 0.25]} m="wood" />
          <B a={[-0.2, 0.3, 0.25]} b={[0.2, 0.48, 0.26]} m="woodDark" />
        </>
      );
    case 'bedLamp':
      return (
        <>
          <B a={[-0.05, 0, -0.05]} b={[0.05, 0.12, 0.05]} m="metal" />
          <Lamp on={on} a={[-0.1, 0.12, -0.1]} b={[0.1, 0.32, 0.1]} />
        </>
      );
    case 'deskLamp':
      return (
        <>
          <B a={[-0.07, 0, -0.07]} b={[0.07, 0.02, 0.07]} m="metal" />
          <B a={[-0.015, 0.02, -0.015]} b={[0.015, 0.38, 0.015]} m="metal" />
          <Lamp on={on} a={[-0.08, 0.32, -0.02]} b={[0.08, 0.42, 0.18]} />
        </>
      );
    case 'wardrobe':
      return (
        <>
          <B a={[-1.1, 0, -0.3]} b={[1.1, 2.1, 0.26]} m="woodDark" />
          {open ? <B a={[-1.0, 0.6, -0.2]} b={[1.0, 1.6, 0.1]} m="fabricWarm" /> : null}
          <Swing open={open} to={-1.5} x={-1.1} z={0.26}>
            <B a={[0, 0.02, 0]} b={[1.08, 2.08, 0.04]} m="wood" />
          </Swing>
          <Swing open={open} to={1.5} x={1.1} z={0.26}>
            <B a={[-1.08, 0.02, 0]} b={[0, 2.08, 0.04]} m="wood" />
          </Swing>
        </>
      );
    case 'desk':
      return (
        <>
          <B a={[-0.85, 0.72, -0.45]} b={[0.85, 0.77, 0.45]} m="wood" />
          <B a={[-0.8, 0, -0.4]} b={[-0.75, 0.72, 0.4]} m="woodDark" />
          <B a={[0.75, 0, -0.4]} b={[0.8, 0.72, 0.4]} m="woodDark" />
          <B a={[-0.3, 0.77, -0.35]} b={[0.3, 1.15, -0.32]} m="black" />
        </>
      );
    case 'balconyChair':
      return (
        <>
          <B a={[-0.3, 0.4, -0.3]} b={[0.3, 0.45, 0.3]} {...p('fabricWarm')} />
          <B a={[-0.3, 0.45, -0.3]} b={[0.3, 0.9, -0.26]} m="metal" />
          <B a={[-0.28, 0, -0.28]} b={[-0.25, 0.4, 0.28]} m="metal" />
          <B a={[0.25, 0, -0.28]} b={[0.28, 0.4, 0.28]} m="metal" />
        </>
      );
    case 'balconyTable':
      return (
        <>
          <B a={[-0.3, 0.45, -0.3]} b={[0.3, 0.5, 0.3]} m="metal" />
          <B a={[-0.05, 0, -0.05]} b={[0.05, 0.45, 0.05]} m="metal" />
        </>
      );
    case 'lounger':
      return (
        <>
          <B a={[-0.35, 0.25, -0.9]} b={[0.35, 0.32, 0.9]} {...p('lounger')} />
          <group position={[0, 0.32, -0.9]} rotation={[-0.75, 0, 0]}>
            <B a={[-0.35, 0, 0]} b={[0.35, 0.07, 0.6]} {...p('lounger')} />
          </group>
          {[-0.8, 0.8].map((z) => (
            <B key={z} a={[-0.33, 0, z - 0.04]} b={[0.33, 0.25, z + 0.04]} m="metal" />
          ))}
        </>
      );
    case 'umbrella':
      return (
        <>
          <B a={[-0.05, 0, -0.05]} b={[0.05, 2.3, 0.05]} m="metal" />
          <B a={[-1, 2.3, -1]} b={[1, 2.42, 1]} {...p('umbrella')} />
          <B a={[-0.6, 2.42, -0.6]} b={[0.6, 2.52, 0.6]} {...p('umbrella')} />
        </>
      );
    case 'frontDoor':
    case 'balconyDoor': {
      const h = item.model === 'frontDoor' ? 2.18 : 2.28;
      return (
        <Swing open={open}>
          <B a={[0, 0, -0.04]} b={[1.2, h, 0.04]} m={item.model === 'frontDoor' ? 'woodDark' : 'glass'} />
          {item.model === 'balconyDoor' ? <B a={[0, 0, -0.05]} b={[1.2, 0.08, 0.05]} m="trim" /> : null}
          <B a={[1.05, 1.0, 0.04]} b={[1.12, 1.06, 0.1]} m="metal" />
          <B a={[1.05, 1.0, -0.1]} b={[1.12, 1.06, -0.04]} m="metal" />
        </Swing>
      );
    }
    case 'mug':
      return (
        <>
          <B a={[-0.045, 0, -0.045]} b={[0.045, 0.1, 0.045]} m="counter" />
          <B a={[0.045, 0.03, -0.01]} b={[0.07, 0.08, 0.01]} m="counter" />
        </>
      );
    case 'book':
      return (
        <>
          <B a={[-0.12, 0, -0.09]} b={[0.12, 0.04, 0.09]} m="rug" />
          <B a={[-0.115, 0.005, -0.085]} b={[0.11, 0.035, 0.085]} m="bedding" />
        </>
      );
    case 'pillow':
      return <B a={[-0.2, 0, -0.2]} b={[0.2, 0.12, 0.2]} m="fabricWarm" />;
    case 'ball':
      return <Ball />;
    case 'teddy':
      return <Teddy />;
    case 'vase':
      return (
        <>
          <B a={[-0.06, 0, -0.06]} b={[0.06, 0.22, 0.06]} m="glass" />
          <B a={[-0.1, 0.22, -0.1]} b={[0.1, 0.36, 0.1]} m="flowers" />
          <B a={[-0.06, 0.2, -0.06]} b={[0.06, 0.24, 0.06]} m="leaves" />
        </>
      );
    case 'breadBag':
      // A paper bag, a loaf peeking out.
      return (
        <>
          <B a={[-0.1, 0, -0.07]} b={[0.1, 0.22, 0.07]} m="cushion" />
          <B a={[-0.06, 0.2, -0.04]} b={[0.07, 0.3, 0.04]} m="fabricWarm" />
        </>
      );
    case 'puriPlate': {
      // A leaf plate, the puris still on it.
      const n = item.state.n ?? 6;
      return (
        <>
          <mesh geometry={plateGeo} material={leafMat} position={[0, 0.01, 0]} />
          {Array.from({ length: n }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return <FunBall key={i} at={[Math.cos(a) * 0.065, 0.04, Math.sin(a) * 0.065]} r={0.028} c="#D9A35B" />;
          })}
        </>
      );
    }
    case 'kulfi':
      return <Kulfi at={item.state.at} />;
    case 'bouquet':
      // Flowers wrapped in paper, held by the stems.
      return (
        <group position={[0, -0.05, 0]}>
          <B a={[-0.04, 0, -0.04]} b={[0.04, 0.2, 0.04]} m="bedding" />
          <group position={[0, -0.05, 0]}>
            <Bouquet />
          </group>
        </group>
      );
    case 'wateringCan':
      return (
        <>
          <B a={[-0.1, 0, -0.07]} b={[0.1, 0.18, 0.07]} m="umbrella" />
          <group position={[0.1, 0.06, 0]} rotation={[0, 0, -0.7]}>
            <B a={[0, -0.015, -0.015]} b={[0.2, 0.015, 0.015]} m="umbrella" />
          </group>
          <B a={[-0.12, 0.12, -0.01]} b={[-0.1, 0.24, 0.01]} m="umbrella" />
        </>
      );
    case 'frame': {
      // The photo we picked, else one of ours that stays the same for this frame.
      const chosen = (item.state.photo && photos.find((ph) => ph.path === item.state.photo)) || photos[hashOf(item.key) % Math.max(photos.length, 1)];
      return (
        <group rotation={[-0.12, 0, 0]}>
          <B a={[-0.22, 0, -0.03]} b={[0.22, 0.32, 0]} m="woodDark" />
          <Photo url={chosen?.url} w={0.36} h={0.24} z={0.002} y={0.16} />
        </group>
      );
    }
    case 'gardenPlant': {
      const g = item.state.growth ?? 0;
      const s = 0.45 + g * 0.16;
      return (
        <>
          <B a={[-0.25, 0, -0.25]} b={[0.25, 0.4, 0.25]} m="potTerracotta" />
          <group position={[0, 0.4, 0]} scale={s}>
            <B a={[-0.3, 0, -0.3]} b={[0.3, 0.8, 0.3]} m="leavesLight" />
            <B a={[-0.2, 0.8, -0.2]} b={[0.2, 1.1, 0.2]} m="leaves" />
            {g >= 3 ? (
              <>
                <B a={[0.15, 0.7, 0.15]} b={[0.3, 0.85, 0.3]} m="flowers" />
                <B a={[-0.3, 0.55, 0.05]} b={[-0.16, 0.7, 0.2]} m="flowers" />
                <B a={[-0.05, 1.05, -0.12]} b={[0.1, 1.2, 0.03]} m="flowers" />
              </>
            ) : null}
          </group>
        </>
      );
    }
    case 'dish':
      return (
        <>
          <B a={[-0.16, 0, -0.16]} b={[0.16, 0.02, 0.16]} m="counter" />
          <B a={[-0.1, 0.02, -0.1]} b={[0.1, 0.08, 0.1]} m="ember" />
          <B a={[-0.03, 0.08, -0.06]} b={[0.06, 0.1, 0.03]} m="leavesLight" />
        </>
      );
  }
  if (item.model === 'villageSeat') return null;
  if (item.model === 'ceilingLight') {
    // The switch by the door, and the light it works, up on the ceiling.
    const [lx, ly, lz] = item.light ?? [0, 2.8, 0];
    return (
      <>
        <B a={[-0.04, 1.15, -0.012]} b={[0.04, 1.27, 0.012]} m="trim" />
        <group position={[lx, ly, lz]}>
          <B a={[-0.22, -0.06, -0.22]} b={[0.22, 0.02, 0.22]} m={on ? 'lamp' : 'lampOff'} />
          <B a={[-0.26, 0.02, -0.26]} b={[0.26, 0.05, 0.26]} m="trim" />
        </group>
      </>
    );
  }
  if (item.model === 'gardenLamp')
    return (
      <>
        <B a={[-0.12, 0, -0.12]} b={[0.12, 0.08, 0.12]} m="black" />
        <B a={[-0.035, 0.08, -0.035]} b={[0.035, 2.15, 0.035]} m="black" />
        <B a={[-0.12, 2.15, -0.12]} b={[0.12, 2.42, 0.12]} m={on && look.night ? 'lamp' : 'lampOff'} />
        <B a={[-0.15, 2.42, -0.15]} b={[0.15, 2.48, 0.15]} m="black" />
      </>
    );
  return funModel(item, on, look.night);
}

/** The TV itself, on its stand or on the real cabinet: our photos when it's on. */
function TvPanel({ on, photos }: { on: boolean; photos: HousePhoto[] }) {
  return (
    <>
      <B a={[-0.95, 0.8, -0.2]} b={[0.95, 1.75, -0.11]} m="black" />
      <B a={[-0.06, 0.5, -0.18]} b={[0.06, 0.8, -0.13]} m="black" />
      {on ? <Slideshow photos={photos} w={1.8} h={0.85} z={-0.105} y={1.275} /> : <B a={[-0.9, 0.85, -0.11]} b={[0.9, 1.7, -0.105]} m="screen" />}
    </>
  );
}

/**
 * A real model (scene/furniture.ts) fitted to the item: stood on the floor
 * and centred, scaled, turned, lifted. A paint colour tints its texture.
 */
function Real({ base, real, color }: { base: string; real: RealModel; color?: string }) {
  const gltf = useLoader(GLTFLoader, `${base}/models/${real.asset}.glb`);
  const obj = useMemo(() => {
    const o = gltf.scene.clone(true);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      plainGlass(mesh.material as THREE.Material);
      if (color) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.set(color);
        mesh.material = mat;
      }
    });
    return o;
  }, [gltf, color]);
  // Paint makes its own materials: free them when it changes.
  useEffect(
    () => () => {
      if (!color) return;
      obj.traverse((m) => ((m as THREE.Mesh).isMesh ? ((m as THREE.Mesh).material as THREE.Material).dispose() : undefined));
    },
    [obj, color],
  );
  return (
    <group rotation={[0, real.yaw ?? 0, 0]} position={[0, real.lift ?? 0, 0]}>
      <group scale={real.scale}>
        <primitive object={obj} position={[-real.cx, -real.bottom, -real.cz]} />
      </group>
    </group>
  );
}

function Blob({ paint }: { paint?: THREE.Material }) {
  const { mats } = useKit();
  const geo = useMemo(() => new THREE.SphereGeometry(1, 20, 14), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={paint ?? mats.fabric} position={[0, 0.28, 0]} scale={[0.45, 0.3, 0.45]} />;
}

function Ball() {
  const { mats } = useKit();
  const geo = useMemo(() => new THREE.SphereGeometry(0.15, 18, 12), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mats.rug} position={[0, 0.15, 0]} />;
}

function Teddy() {
  const { mats } = useKit();
  const geo = useMemo(() => new THREE.SphereGeometry(1, 14, 10), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <>
      <mesh geometry={geo} material={mats.teddy} position={[0, 0.09, 0]} scale={[0.09, 0.1, 0.08]} />
      <mesh geometry={geo} material={mats.teddy} position={[0, 0.23, 0]} scale={0.065} />
      <mesh geometry={geo} material={mats.teddy} position={[-0.05, 0.29, 0]} scale={0.025} />
      <mesh geometry={geo} material={mats.teddy} position={[0.05, 0.29, 0]} scale={0.025} />
    </>
  );
}

export interface ItemsProps {
  items: PlacedItem[];
  mats: Materials;
  quality: Quality;
  night: boolean;
  photos: HousePhoto[];
  /** Where each item's root is, for picking and for carrying in a hand. */
  objects: Map<string, THREE.Object3D>;
  selected: string | null;
  /** Only these floors: 0 ground (and the garden), 1 upstairs. Carried things count as ground. */
  floor: 0 | 1;
  carried: ReadonlySet<string>;
  /** Where the real furniture is (models/<id>.glb). Without it, the box shapes. */
  assets?: string;
}

export function Items({ items, mats, quality, night, photos, objects, selected, floor, carried, assets }: ItemsProps) {
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => () => box.dispose(), [box]);
  const kit = useMemo(() => ({ mats, box }), [mats, box]);
  // One material per paint colour, shared, freed on the way out.
  const paints = useRef(new Map<string, THREE.Material>());
  useEffect(() => {
    const all = paints.current;
    return () => {
      for (const m of all.values()) m.dispose();
      all.clear();
    };
  }, [mats]);
  const paintFor = (color?: string) => {
    if (!color) return undefined;
    let m = paints.current.get(color);
    if (!m) {
      m = quality === 'low' ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
      paints.current.set(color, m);
    }
    return m;
  };

  // Lamp posts are drawn all together (lamp-posts.tsx), not one by one.
  const mine = items.filter((it) => it.model !== 'gardenLamp' && (carried.has(it.key) ? floor === 0 : (it.y > 2 ? 1 : 0) === floor));
  return (
    <KitContext.Provider value={kit}>
      {mine.map((it) => (
        <group
          key={it.key}
          position={[it.x, it.y, it.z]}
          rotation={[0, it.ry, 0]}
          userData={{ itemKey: it.key }}
          ref={(g) => {
            if (g) objects.set(it.key, g);
            else if (objects.get(it.key)?.userData.itemKey === it.key) objects.delete(it.key);
          }}
        >
          <Drawn it={it} assets={assets} look={{ item: it, paint: paintFor(it.state.color), on: isOn(it), open: isOpen(it), night, photos }} />
          {selected === it.key ? <Selection hw={it.hw} hd={it.hd} /> : null}
        </group>
      ))}
    </KitContext.Provider>
  );
}

/** An item as a real model when there is one (box shape while it loads), else its box shape. */
function Drawn({ it, assets, look }: { it: PlacedItem; assets?: string; look: Look }) {
  const real = assets ? REAL_MODELS[it.model] : undefined;
  if (!real || !assets) return <Model look={look} />;
  return (
    <Optional fallback={<Model look={look} />}>
      <Suspense fallback={<Model look={look} />}>
        <Real base={assets} real={real} color={it.state.color} />
        {it.model === 'vase' && freshFlowers(it.state.at) ? <Bouquet /> : null}
        {real.keepScreen ? <TvPanel on={look.on} photos={look.photos} /> : null}
      </Suspense>
    </Optional>
  );
}

const plateGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.02, 14);
const leafMat = new THREE.MeshLambertMaterial({ color: '#5E8E3D' });

/** A kulfi on its stick, going as it's eaten (a minute and a half). */
export const KULFI_S = 90;
function Kulfi({ at }: { at?: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const left = at ? 1 - (Date.now() - Date.parse(at)) / (KULFI_S * 1000) : 1;
    g.current.scale.y = Math.max(0.15, left);
  });
  return (
    <>
      <B a={[-0.006, 0, -0.006]} b={[0.006, 0.08, 0.006]} m="wood" />
      <group ref={g} position={[0, 0.07, 0]}>
        <mesh geometry={kulfiGeo} material={kulfiMat} position={[0, 0.06, 0]} />
      </group>
    </>
  );
}
const kulfiGeo = new THREE.CylinderGeometry(0.018, 0.026, 0.12, 10);
const kulfiMat = new THREE.MeshLambertMaterial({ color: '#F2E3C0' });

/** Flowers bought at the village stall stay fresh in the vase for three days. */
const freshFlowers = (at?: string) => !!at && Date.now() - Date.parse(at) < 3 * 24 * 3600 * 1000;

function Bouquet() {
  const cs = ['#E84A6F', '#FFC93C', '#F2A7B8', '#9B5DE5', '#FFFFFF', '#E84A6F', '#FF8A3D'];
  return (
    <group position={[0, 0.2, 0]}>
      {cs.map((c, i) => {
        const a = (i / cs.length) * Math.PI * 2;
        const r = i % 2 ? 0.07 : 0.035;
        return <FunBall key={i} at={[Math.cos(a) * r, 0.12 + (i % 3) * 0.035, Math.sin(a) * r]} r={0.04} c={c} />;
      })}
      <FunBall at={[0, 0.06, 0]} r={0.05} c="#4F8A3A" />
    </group>
  );
}

/** A glowing outline on the floor round the thing we're moving. */
function Selection({ hw, hd }: { hw: number; hd: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = 0.45 + Math.sin(clock.elapsedTime * 5) * 0.2;
  });
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    const w = hw + 0.12;
    const d = hd + 0.12;
    s.moveTo(-w, -d).lineTo(w, -d).lineTo(w, d).lineTo(-w, d).closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w + 0.06, -d + 0.06).lineTo(-w + 0.06, d - 0.06).lineTo(w - 0.06, d - 0.06).lineTo(w - 0.06, -d + 0.06).closePath();
    s.holes.push(hole);
    return new THREE.ShapeGeometry(s);
  }, [hw, hd]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh ref={ref} geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} userData={{ noHit: true }}>
      <meshBasicMaterial color="#FFD54A" transparent opacity={0.6} depthWrite={false} />
    </mesh>
  );
}


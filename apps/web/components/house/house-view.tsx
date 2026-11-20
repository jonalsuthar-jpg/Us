'use client';

import { Canvas } from '@react-three/fiber';
import { createControls, HouseWorld, LOOKS, orbitBy, QUALITIES, tapAt, useHousePresence, zoomBy, type Emote, type Quality } from '@us/shared/house';
import { useCouple } from '@us/shared/react';
import { Gauge, Hand, Heart, Maximize, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const QUALITY_KEY = 'us.house.quality';
const QUALITY_LABEL: Record<Quality, string> = { low: 'Smooth', medium: 'Balanced', high: 'Best looking' };
const DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

function savedQuality(): Quality {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    if (QUALITIES.includes(q as Quality)) return q as Quality;
  } catch {
    // Private window: pick again next time.
  }
  return 'medium';
}

/**
 * Inside Our House. Click the floor to walk there, drag to look around,
 * scroll or pinch to zoom; the arrow keys turn the camera too, and Escape
 * leaves. Loaded on its own (see app/(app)/house/page.tsx).
 */
export function HouseView() {
  const router = useRouter();
  const { partner, mySlot } = useCouple();
  const { presence } = useHousePresence();
  const controls = useMemo(createControls, []);
  const box = useRef<HTMLDivElement>(null);
  const [quality, setQuality] = useState<Quality>(savedQuality);
  const [place, setPlace] = useState('');
  const [partnerPlace, setPartnerPlace] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const stepped = useRef(false);

  const chooseQuality = useCallback((q: Quality) => {
    setQuality(q);
    stepped.current = true;
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      // Remembered for this visit only.
    }
  }, []);

  // A computer that can't keep up steps down once, in the first few seconds.
  const onFps = useCallback(
    (f: number) => {
      if (stepped.current) return;
      stepped.current = true;
      if (f < 22 && quality !== 'low') chooseQuality(quality === 'high' ? 'medium' : 'low');
    },
    [quality, chooseQuality],
  );

  // Nothing draws in a hidden tab.
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) router.back();
      else if (e.key === 'ArrowLeft') orbitBy(controls, -40, 0, 800);
      else if (e.key === 'ArrowRight') orbitBy(controls, 40, 0, 800);
      else if (e.key === 'ArrowUp') zoomBy(controls, 1.1);
      else if (e.key === 'ArrowDown') zoomBy(controls, 1 / 1.1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controls, router]);

  // One pointer drags the camera or, if it barely moved, is a tap; two pinch.
  const pointers = useRef(new Map<number, { x: number; y: number; sx: number; sy: number }>());
  const pinch = useRef(0);
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.current.size === 2) pinch.current = spread(pointers.current);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const w = box.current?.clientWidth ?? 800;
    if (pointers.current.size === 1) orbitBy(controls, e.clientX - p.x, e.clientY - p.y, w);
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.current.size === 2) {
      const d = spread(pointers.current);
      if (pinch.current > 0) zoomBy(controls, d / pinch.current);
      pinch.current = d;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const el = box.current;
    if (!p || !el || pointers.current.size > 0 || pinch.current > 0) {
      if (pointers.current.size === 0) pinch.current = 0;
      return;
    }
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) {
      const r = el.getBoundingClientRect();
      tapAt(controls, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    }
  };

  const emote = (e: Emote) => controls.emotes.push(e);
  const mine = LOOKS[mySlot === 'a' ? 0 : 1]!;
  const theirs = LOOKS[mySlot === 'a' ? 1 : 0]!;
  const name = partner.display_name;

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#BFDDF2]">
      <div
        ref={box}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => zoomBy(controls, e.deltaY < 0 ? 1.08 : 1 / 1.08)}
      >
        <Canvas
          key={quality}
          shadows={quality !== 'low'}
          dpr={[1, DPR[quality]]}
          frameloop={!visible ? 'never' : quality === 'low' ? 'demand' : 'always'}
          camera={{ fov: 50, near: 0.1, far: 200 }}
          gl={{ antialias: quality === 'high' }}
          // Clicks reach the scene through the handlers above, not R3F's raycasting on every move.
          style={{ pointerEvents: 'none' }}
        >
          <HouseWorld quality={quality} controls={controls} presence={presence} mine={mine} theirs={theirs} onPlace={setPlace} onPartnerPlace={setPartnerPlace} onFps={onFps} />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3">
        <HudButton label="Leave the house" onClick={() => router.back()}>
          <X size={22} />
        </HudButton>
        {place ? <span className="rounded-full bg-black/35 px-3.5 py-2 text-small font-medium text-white">{place}</span> : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
        <span className="flex items-center gap-2 rounded-full bg-black/35 px-3.5 py-2 text-small text-white">
          <span className={partnerPlace ? 'h-2 w-2 rounded-full bg-sage-400' : 'h-2 w-2 rounded-full bg-white/50'} />
          {partnerPlace ? `${name} · ${partnerPlace}` : `${name} isn’t in the house`}
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col gap-3">
        <HudButton label="Wave" onClick={() => emote('wave')} big>
          <Hand size={22} />
        </HudButton>
        <HudButton label="Send a heart" onClick={() => emote('heart')} big>
          <Heart size={22} fill="#FF4D7D" />
        </HudButton>
        <HudButton label={`Picture: ${QUALITY_LABEL[quality]}. Click to change`} onClick={() => chooseQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]!)} big>
          <Gauge size={20} />
          <span className="text-[9px] leading-none">{quality === 'low' ? 'Smooth' : quality === 'medium' ? 'Balanced' : 'Best'}</span>
        </HudButton>
        <HudButton label="Full screen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})} big>
          <Maximize size={20} />
        </HudButton>
      </div>

      <p className="pointer-events-none absolute bottom-4 left-4 hidden text-[12px] text-white/80 drop-shadow md:block">Click to walk · drag to look around · scroll to zoom</p>
    </div>
  );
}

function spread(m: Map<number, { x: number; y: number }>) {
  const [a, b] = [...m.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function HudButton({ label, onClick, big, children }: { label: string; onClick: () => void; big?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`pointer-events-auto flex flex-col items-center justify-center rounded-full bg-black/35 text-white transition hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${big ? 'h-14 w-14' : 'h-11 w-11'}`}
    >
      {children}
    </button>
  );
}

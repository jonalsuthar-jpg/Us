'use client';

/**
 * Dev-only house lab: two houses ("A" and "B") side by side, joined by an
 * in-memory channel, running the same HouseWorld and HousePresence the app
 * uses. Click in either to walk; the other sees you arrive.
 * window.__lab exposes the controls for automated checks.
 */
import { Canvas } from '@react-three/fiber';
import { createControls, HouseWorld, HousePresence, LOOKS, orbitBy, QUALITIES, tapAt, zoomBy, type HouseControls, type HouseEvent, type Quality } from '@us/shared/house';
import { notFound } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

function bus() {
  const listeners = new Map<string, (e: HouseEvent) => void>();
  return (me: string) => ({
    send: (e: HouseEvent) => {
      for (const [who, fn] of listeners) if (who !== me) setTimeout(() => fn(e), 40);
    },
    on: (fn: (e: HouseEvent) => void) => {
      listeners.set(me, fn);
      return () => void listeners.delete(me);
    },
  });
}

function Pane({ who, presence, controls, quality }: { who: 'a' | 'b'; presence: HousePresence; controls: HouseControls; quality: Quality }) {
  const box = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [place, setPlace] = useState('');
  const [other, setOther] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  return (
    <div
      ref={box}
      data-pane={who}
      className="relative h-full flex-1 touch-none overflow-hidden"
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY })}
      onPointerMove={(e) => {
        const d = down.current;
        if (!d) return;
        orbitBy(controls, e.clientX - d.x, e.clientY - d.y, box.current!.clientWidth);
        d.x = e.clientX;
        d.y = e.clientY;
      }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) return;
        const r = box.current!.getBoundingClientRect();
        tapAt(controls, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      }}
      onWheel={(e) => zoomBy(controls, e.deltaY < 0 ? 1.08 : 1 / 1.08)}
    >
      <Canvas key={quality} shadows={quality !== 'low'} dpr={[1, 1.5]} frameloop={quality === 'low' ? 'demand' : 'always'} camera={{ fov: 50, near: 0.1, far: 200 }} style={{ pointerEvents: 'none' }}>
        <HouseWorld quality={quality} controls={controls} presence={presence} mine={LOOKS[who === 'a' ? 0 : 1]!} theirs={LOOKS[who === 'a' ? 1 : 0]!} onPlace={setPlace} onPartnerPlace={setOther} onFps={(f) => setFps(Math.round(f))} />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 font-mono text-[12px] text-white">
        {who.toUpperCase()} · {place} · other: {other ?? '—'} · {fps} fps
      </div>
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button type="button" className="rounded bg-black/50 px-3 py-1.5 text-[12px] text-white" onClick={() => controls.emotes.push('wave')}>
          Wave
        </button>
        <button type="button" className="rounded bg-black/50 px-3 py-1.5 text-[12px] text-white" onClick={() => controls.emotes.push('heart')}>
          Heart
        </button>
      </div>
    </div>
  );
}

export default function HouseLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  const [quality, setQuality] = useState<Quality>('medium');
  const lab = useMemo(() => {
    const wire = bus();
    return { a: new HousePresence('a', wire('a')), b: new HousePresence('b', wire('b')), ca: createControls(), cb: createControls() };
  }, []);
  useEffect(() => {
    (window as unknown as { __lab: unknown }).__lab = lab;
    return () => {
      lab.a.dispose();
      lab.b.dispose();
    };
  }, [lab]);
  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <div className="flex items-center gap-2 bg-plum-900 px-3 py-2 text-[13px] text-white">
        House lab · quality:
        {QUALITIES.map((q) => (
          <button key={q} type="button" onClick={() => setQuality(q)} className={q === quality ? 'rounded bg-white px-2 text-plum-900' : 'rounded px-2 underline'}>
            {q}
          </button>
        ))}
      </div>
      <div className="flex flex-1 gap-1">
        <Pane who="a" presence={lab.a} controls={lab.ca} quality={quality} />
        <Pane who="b" presence={lab.b} controls={lab.cb} quality={quality} />
      </div>
    </div>
  );
}

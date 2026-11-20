'use client';

import { Canvas } from '@react-three/fiber';
import { ADDABLE, HAIRS, HouseWorld, orbitBy, PAINTS, PANTS, QUALITIES, SHIRTS, SKINS, tapAt, useHouseGame, zoomBy, type HouseGame, type LookState, type Quality } from '@us/shared/house';
import { Check, Eye, Gauge, Hand, Heart, House, Maximize, Moon, Music, Paintbrush, Plus, RotateCcw, RotateCw, Shirt, Sun, Trash2, X } from 'lucide-react';
import { housePackBase } from '@us/shared/house/light';
import { useCouple } from '@us/shared/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const QUALITY_KEY = 'us.house.quality';
const QUALITY_LABEL: Record<Quality, string> = { low: 'Smooth', medium: 'Balanced', high: 'Best looking' };
const DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const STICK = 56;

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
 * Inside Our House, played like a game. WASD or the arrows walk (Shift
 * runs), dragging looks around, scrolling zooms, E does whatever's in reach,
 * 1–3 wave, send a heart and dance; Escape leaves. On a touch screen there's
 * a stick bottom left. Loaded on its own (see app/(app)/house/page.tsx).
 */
export function HouseView() {
  const router = useRouter();
  const game = useHouseGame();
  const houseUrl = useHousePackUrl();
  const { controls, hud } = game;
  const box = useRef<HTMLDivElement>(null);
  const [quality, setQuality] = useState<Quality>(savedQuality);
  const [visible, setVisible] = useState(true);
  const [panel, setPanel] = useState<'look' | 'add' | null>(null);
  const [touch, setTouch] = useState(false);
  const stepped = useRef(false);

  useEffect(() => setTouch(window.matchMedia('(pointer: coarse)').matches), []);

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

  // The keyboard: held keys make the stick.
  const { actions } = game;
  useEffect(() => {
    const held = new Set<string>();
    const stick = () => {
      const x = (held.has('d') || held.has('arrowright') ? 1 : 0) - (held.has('a') || held.has('arrowleft') ? 1 : 0);
      const y = (held.has('s') || held.has('arrowdown') ? 1 : 0) - (held.has('w') || held.has('arrowup') ? 1 : 0);
      const run = held.has('shift') ? 1 : 0.6;
      const d = Math.hypot(x, y) || 1;
      controls.move = [(x / d) * run, (y / d) * run];
    };
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' && !document.fullscreenElement) return router.back();
      if (k === 'e' || k === 'enter') return actions.use();
      if (k === '1') return actions.emote('wave');
      if (k === '2') return actions.emote('heart');
      if (k === '3') return actions.emote('dance');
      if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
        held.add(k);
        stick();
      }
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.key.toLowerCase());
      stick();
    };
    const blur = () => {
      held.clear();
      stick();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [controls, router, actions]);

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
          camera={{ fov: 55, near: 0.1, far: 200 }}
          gl={{ antialias: quality === 'high' }}
          // Clicks reach the scene through the handlers above, not R3F's raycasting on every move.
          style={{ pointerEvents: 'none' }}
        >
          <HouseWorld {...game.world} quality={quality} onFps={onFps} houseUrl={houseUrl} />
        </Canvas>
      </div>

      {touch ? <Joystick game={game} /> : null}

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3">
        <HudButton label="Leave the house" onClick={() => router.back()}>
          <X size={22} />
        </HudButton>
        {game.place ? <Chip>{game.place}</Chip> : null}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-2">
        <Chip>
          <span className={game.partnerPlace ? 'h-2 w-2 rounded-full bg-sage-400' : 'h-2 w-2 rounded-full bg-white/50'} />
          {game.partnerPlace ? `${game.partnerName} · ${game.partnerPlace}` : `${game.partnerName} isn’t in the house`}
        </Chip>
        {game.decorate ? <Chip>{hud.selected ? 'Use WASD to slide it' : 'Click something to move it'}</Chip> : null}
        {game.moment ? <span className="rounded-full bg-rose-600/90 px-4 py-2 text-small font-bold text-white">{game.moment}</span> : null}
      </div>

      <div className="pointer-events-none absolute right-4 top-4 flex gap-2">
        <HudButton label={game.view === 'close' ? 'See the whole house' : 'Back behind me'} onClick={game.toggleView}>
          {game.view === 'close' ? <House size={20} /> : <Eye size={20} />}
        </HudButton>
        <HudButton label={game.night ? 'Make it day' : 'Make it night'} onClick={game.toggleNight}>
          {game.night ? <Sun size={20} /> : <Moon size={20} />}
        </HudButton>
        <HudButton label={game.decorate ? 'Done decorating' : 'Decorate'} onClick={() => game.setDecorate(!game.decorate)} on={game.decorate}>
          <Paintbrush size={20} />
        </HudButton>
        <HudButton label="My look" onClick={() => setPanel(panel === 'look' ? null : 'look')} on={panel === 'look'}>
          <Shirt size={20} />
        </HudButton>
        <HudButton label={`Picture: ${QUALITY_LABEL[quality]}. Click to change`} onClick={() => chooseQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]!)}>
          <Gauge size={18} />
        </HudButton>
        <HudButton label="Full screen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
          <Maximize size={18} />
        </HudButton>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 flex items-end gap-3">
        {game.decorate ? (
          <DecorTools game={game} onAdd={() => setPanel(panel === 'add' ? null : 'add')} />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <HudButton label="Wave (1)" onClick={() => actions.emote('wave')} big>
                <Hand size={22} />
              </HudButton>
              <HudButton label="Send a heart (2)" onClick={() => actions.emote('heart')} big>
                <Heart size={22} fill="#FF4D7D" />
              </HudButton>
              <HudButton label="Dance (3)" onClick={() => actions.emote('dance')} big>
                <Music size={22} />
              </HudButton>
            </div>
            {hud.action ? (
              <button
                type="button"
                onClick={actions.use}
                className="pointer-events-auto flex h-[92px] w-[92px] flex-col items-center justify-center gap-0.5 rounded-full border-2 border-white/80 bg-rose-600/90 px-2 text-center text-[12px] font-bold leading-[15px] text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                <span className="line-clamp-3">{hud.action}</span>
                {!touch ? <kbd className="rounded bg-white/25 px-1.5 text-[10px] font-medium">E</kbd> : null}
              </button>
            ) : null}
          </>
        )}
      </div>

      {panel === 'look' ? <LookPanel game={game} onClose={() => setPanel(null)} /> : null}
      {panel === 'add' && game.decorate ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <div className="pointer-events-auto flex max-w-[80%] gap-2 overflow-x-auto rounded-2xl bg-black/55 px-3 py-2">
            {ADDABLE.map((a) => (
              <button
                key={a.model}
                type="button"
                onClick={() => {
                  actions.add(a.model);
                  setPanel(null);
                }}
                className="shrink-0 rounded-full bg-white/90 px-3.5 py-2 text-small font-medium text-ink hover:bg-white"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!touch ? <p className="pointer-events-none absolute bottom-4 left-4 text-[12px] text-white/85 drop-shadow">WASD to walk · Shift to run · drag to look · E to use · scroll to zoom</p> : null}
    </div>
  );
}

/** On a touch screen: walk the way the stick points. All the way out runs. */
function Joystick({ game }: { game: HouseGame }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const d = Math.hypot(dx, dy);
    const k = d > STICK ? STICK / d : 1;
    setKnob({ x: dx * k, y: dy * k });
    game.controls.move = [(dx * k) / STICK, (dy * k) / STICK];
  };
  const end = () => {
    start.current = null;
    setKnob({ x: 0, y: 0 });
    game.controls.move = [0, 0];
  };
  return (
    <div
      aria-label="Walk. Drag to move, all the way out to run"
      className="absolute bottom-6 left-6 flex touch-none items-center justify-center rounded-full border-2 border-white/40 bg-black/20"
      style={{ width: STICK * 2 + 24, height: STICK * 2 + 24 }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        start.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="h-14 w-14 rounded-full border-2 border-white/80 bg-white/45" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function DecorTools({ game, onAdd }: { game: HouseGame; onAdd: () => void }) {
  const sel = game.hud.selected;
  const { actions } = game;
  return (
    <div className="flex flex-col items-end gap-3">
      {sel?.paint ? (
        <div className="pointer-events-auto flex gap-1.5 rounded-full bg-black/35 p-1.5">
          {PAINTS.map((c) => (
            <button key={c} type="button" aria-label={`Paint ${c}`} onClick={() => actions.paint(c)} className="h-7 w-7 rounded-full border-2 border-white/80" style={{ backgroundColor: c }} />
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        {sel ? (
          <>
            <HudButton label="Turn left" onClick={() => actions.rotate(Math.PI / 8)} big>
              <RotateCcw size={22} />
            </HudButton>
            <HudButton label="Turn right" onClick={() => actions.rotate(-Math.PI / 8)} big>
              <RotateCw size={22} />
            </HudButton>
            {sel.added || sel.moved ? (
              <HudButton label={sel.added ? `Take away the ${sel.label.toLowerCase()}` : `Put the ${sel.label.toLowerCase()} back`} onClick={actions.remove} big>
                {sel.added ? <Trash2 size={22} /> : <RotateCcw size={18} />}
              </HudButton>
            ) : null}
            <HudButton label="Done with this" onClick={actions.deselect} big on>
              <Check size={22} />
            </HudButton>
          </>
        ) : null}
        <HudButton label="Add something" onClick={onAdd} big>
          <Plus size={24} />
        </HudButton>
      </div>
    </div>
  );
}

function LookPanel({ game, onClose }: { game: HouseGame; onClose: () => void }) {
  const rows: { key: keyof LookState; label: string; colors: string[] }[] = [
    { key: 'skin', label: 'Skin', colors: SKINS },
    { key: 'hair', label: 'Hair', colors: HAIRS },
    { key: 'shirt', label: 'Top', colors: SHIRTS },
    { key: 'pants', label: 'Trousers', colors: PANTS },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto flex flex-col gap-3 rounded-3xl bg-black/70 p-4 text-white">
        <div className="flex items-center justify-between">
          <span className="font-bold">My look</span>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="w-20 text-small text-white/80">{r.label}</span>
            {r.colors.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${r.label} ${c}`}
                onClick={() => game.setLook({ [r.key]: c })}
                className={cn('h-8 w-8 rounded-full', game.look[r.key] === c ? 'border-[3px] border-white' : 'border border-white/40')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The realistic house's address, once its pack is there; the browser caches the files. */
function useHousePackUrl(): string | undefined {
  const { sb } = useCouple();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    void housePackBase(sb)
      .then(async (base) => ((await fetch(`${base}/manifest.json`)).ok ? base : undefined))
      .then((b) => live && setUrl(b))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb]);
  return url;
}

function spread(m: Map<number, { x: number; y: number }>) {
  const [a, b] = [...m.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-2 rounded-full bg-black/35 px-3.5 py-2 text-small font-medium text-white">{children}</span>;
}

function HudButton({ label, onClick, big, on, children }: { label: string; onClick: () => void; big?: boolean; on?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'pointer-events-auto flex items-center justify-center rounded-full text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        on ? 'bg-rose-600/90 hover:bg-rose-700' : 'bg-black/35 hover:bg-black/50',
        big ? 'h-14 w-14' : 'h-11 w-11',
      )}
    >
      {children}
    </button>
  );
}

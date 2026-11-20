'use client';

import { Canvas } from '@react-three/fiber';
import { ADDABLE, CAMERA_LABEL, CAMERA_VIEWS, HAIRS, HAIRSTYLE_LABEL, HAIRSTYLES, HouseWorld, NOTE_MAX, orbitBy, PAINTS, PANTS, QUALITIES, saveHousePhoto, SHIRTS, SHOES, SKINS, tapAt, TOGETHER, TOGETHER_LABEL, useHouseGame, useHouseLoading, type HouseGame, type HouseSound, type Quality } from '@us/shared/house';
import type * as THREE from 'three';
import { webHouseSound } from '@/lib/house-sound';
import { Aperture, Check, Gauge, Hand, Heart, House, Maximize, Moon, Music, Paintbrush, Phone, PhoneOff, Plus, Radio, RotateCcw, RotateCw, Shirt, StickyNote, Sun, SwitchCamera, Trash2, Volume2, VolumeX, X } from 'lucide-react';
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
  const { sb, couple, me } = useCouple();
  // Sounds come with the pack; the sound button (remembered in this browser) turns them off.
  const [sound, setSound] = useState<HouseSound | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem('us.house.muted') === '1');
    } catch {
      // Private window: sound on.
    }
  }, []);
  useEffect(() => {
    if (!houseUrl) return;
    const s = webHouseSound(houseUrl);
    setSound(s);
    return () => {
      s.dispose();
      setSound(null);
    };
  }, [houseUrl]);
  useEffect(() => sound?.setMaster(muted ? 0 : 1), [sound, muted]);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem('us.house.muted', next ? '1' : '0');
    } catch {
      // As above.
    }
  };
  // Photo mode: drawn once more and read straight away, into Memories.
  const capture = useCallback(
    async ({ gl, scene, camera }: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }) => {
      gl.render(scene, camera);
      const blob = await (await fetch(gl.domElement.toDataURL('image/jpeg', 0.9))).blob();
      await saveHousePhoto(sb, couple.id, me.id, blob, 'image/jpeg');
    },
    [sb, couple.id, me.id],
  );
  const { controls, hud } = game;
  const box = useRef<HTMLDivElement>(null);
  const [quality, setQuality] = useState<Quality>(savedQuality);
  const [visible, setVisible] = useState(true);
  const [panel, setPanel] = useState<'look' | 'add' | 'note' | null>(null);
  const [touch, setTouch] = useState(false);
  // The camera view you last chose, remembered in this browser.
  useEffect(() => {
    try {
      const v = localStorage.getItem('us.house.view');
      if (CAMERA_VIEWS.includes(v as never)) game.chooseView(v as (typeof CAMERA_VIEWS)[number]);
    } catch {
      // Private window.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const nextView = () => {
    game.nextView();
    try {
      localStorage.setItem('us.house.view', CAMERA_VIEWS[(CAMERA_VIEWS.indexOf(game.view) + 1) % CAMERA_VIEWS.length]!);
    } catch {
      // As above.
    }
  };
  // The loading screen stays until the house is in and drawing (or 25 s, whatever happens).
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 25_000);
    return () => clearTimeout(t);
  }, []);
  const loading = useHouseLoading();
  // The first time in, make yourself first.
  const asked = useRef(false);
  useEffect(() => {
    if (game.needsLook && !asked.current) {
      asked.current = true;
      setPanel('look');
    }
  }, [game.needsLook]);
  const stepped = useRef(false);
  const reports = useRef(0);

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
      // The first reports include loading; judge once it has settled.
      reports.current++;
      if (stepped.current || reports.current < 4) return;
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

  const nextViewRef = useRef(nextView);
  nextViewRef.current = nextView;
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
      if (k === 'c') return nextViewRef.current();
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
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const w = box.current?.clientWidth ?? 800;
    if (pointers.current.size === 1) orbitBy(controls, e.clientX - p.x, e.clientY - p.y, w);
    p.x = e.clientX;
    p.y = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const el = box.current;
    if (!p || !el || pointers.current.size > 0) return;
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
      >
        <Canvas
          key={quality}
          shadows={quality !== 'low'}
          dpr={[1, DPR[quality]]}
          frameloop={!visible ? 'never' : 'always'}
          camera={{ fov: 55, near: 0.1, far: 200 }}
          gl={{ antialias: quality === 'high' }}
          // Clicks reach the scene through the handlers above, not R3F's raycasting on every move.
          style={{ pointerEvents: 'none' }}
        >
          <HouseWorld {...game.world} quality={quality} onFps={onFps} houseUrl={houseUrl} onReady={onReady} sound={sound} capture={capture} />
        </Canvas>
      </div>

      {touch ? <Joystick game={game} /> : null}

      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3">
        <HudButton label="Leave the house" onClick={() => router.back()}>
          <X size={22} />
        </HudButton>
        {game.place ? <Chip>{game.place}</Chip> : null}
      </div>

      <div className="pointer-events-none absolute left-4 top-[72px] flex flex-col gap-2">
        <HudButton label={game.inCall ? 'Stop talking' : `Talk to ${game.partnerName}`} onClick={game.toggleTalk} on={game.inCall}>
          {game.inCall ? <PhoneOff size={18} /> : <Phone size={18} />}
        </HudButton>
        <HudButton label={game.music ? 'Turn the speaker off' : 'Play the speaker'} onClick={game.toggleMusic} on={game.music}>
          <Radio size={18} />
        </HudButton>
        <HudButton label={muted ? 'Sound on' : 'Sound off'} onClick={toggleMute}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </HudButton>
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
        <HudButton label={`Camera: ${CAMERA_LABEL[game.view]}. Click for the next view (C)`} onClick={nextView}>
          <span className="flex flex-col items-center leading-none">
            <SwitchCamera size={17} />
            <span className="text-[8px]">{CAMERA_LABEL[game.view]}</span>
          </span>
        </HudButton>
        <HudButton label={game.night ? 'Make it day' : 'Make it night'} onClick={game.toggleNight}>
          {game.night ? <Sun size={20} /> : <Moon size={20} />}
        </HudButton>
        <HudButton label={game.decorate ? 'Done decorating' : 'Decorate'} onClick={() => game.setDecorate(!game.decorate)} on={game.decorate}>
          <Paintbrush size={20} />
        </HudButton>
        <HudButton label="Take a photo (saved to Memories)" onClick={actions.photo}>
          <Aperture size={19} />
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
          <div className="flex flex-col items-end gap-3">
            {hud.nearPartner && !hud.invite && !hud.asking ? (
              <div className="pointer-events-auto flex gap-2">
                {TOGETHER.map((k) => (
                  <button key={k} type="button" onClick={() => actions.invite(k)} className="rounded-full bg-rose-600/85 px-3.5 py-2 text-small font-medium text-white hover:bg-rose-700">
                    {TOGETHER_LABEL[k]}
                  </button>
                ))}
              </div>
            ) : null}
            {hud.note ? (
              <button type="button" onClick={() => setPanel('note')} className="pointer-events-auto flex items-center gap-2 rounded-full bg-gold-500/90 px-3.5 py-2 text-small font-medium text-white">
                <StickyNote size={16} />
                {hud.note === 'read' ? 'Read the note' : 'Leave a note'}
              </button>
            ) : null}
          <div className="flex items-end gap-3">
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
          </div>
          </div>
        )}
      </div>

      <div
        aria-hidden={ready}
        className={cn('pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-[#8FD0EE] to-[#2F6F9A] text-white transition-opacity duration-500', ready ? 'opacity-0' : 'opacity-100')}
      >
        <span className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-white/20">
          <House size={52} strokeWidth={1.6} />
        </span>
        <span className="flex flex-col items-center gap-1.5">
          <span className="text-[24px] font-bold">Opening our house</span>
          <span className="text-small text-white/85">{game.partnerPlace ? `${game.partnerName} is already inside` : 'Lighting the rooms, setting the table'}</span>
        </span>
        <span className="h-2 w-56 overflow-hidden rounded-full bg-white/25">
          <span className="block h-full rounded-full bg-white transition-[width]" style={{ width: `${Math.max(6, Math.round(loading * 100))}%` }} />
        </span>
      </div>

      {hud.invite ? (
        <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/70 py-2 pl-4 pr-2 text-small text-white">
            {`${game.partnerName}: ${TOGETHER_LABEL[hud.invite].toLowerCase()}?`}
            <button type="button" onClick={() => actions.answer(true)} className="rounded-full bg-rose-600 px-4 py-2 font-bold">
              Yes
            </button>
            <button type="button" onClick={() => actions.answer(false)} className="rounded-full bg-white/15 px-4 py-2">
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {panel === 'note' ? <NotePanel game={game} onClose={() => setPanel(null)} /> : null}
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

      {!touch ? <p className="pointer-events-none absolute bottom-4 left-4 text-[12px] text-white/85 drop-shadow">WASD to walk · Shift to run · drag to look · E to use · C to change the camera</p> : null}
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

/** The note on the fridge: theirs to read (and answer), or mine to leave. */
function NotePanel({ game, onClose }: { game: HouseGame; onClose: () => void }) {
  const theirs = game.note?.text && game.note.by !== game.meId ? game.note : null;
  const [writing, setWriting] = useState(!theirs);
  const [text, setText] = useState('');
  useEffect(() => {
    if (theirs) game.readNote();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto flex w-[420px] max-w-[90%] flex-col gap-3 rounded-3xl bg-[#FFF6D9] p-5 text-ink" onKeyDown={(e) => e.stopPropagation()}>
        {!writing && theirs ? (
          <>
            <span className="text-small text-ink-soft">From {game.partnerName}</span>
            <p className="text-lead font-medium">{theirs.text}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setWriting(true)} className="rounded-full bg-rose-600 px-4 py-2 text-small font-bold text-white">
                Write back
              </button>
              <button type="button" onClick={onClose} className="rounded-full bg-black/10 px-4 py-2 text-small">
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="font-bold">A note for {game.partnerName}</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))}
              placeholder="They’ll find it on the fridge"
              autoFocus
              className="min-h-[90px] rounded-2xl bg-white/70 p-3 text-body outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full bg-black/10 px-4 py-2 text-small">
                Cancel
              </button>
              <button
                type="button"
                disabled={!text.trim()}
                onClick={() => {
                  game.leaveNote(text);
                  onClose();
                }}
                className="rounded-full bg-rose-600 px-4 py-2 text-small font-bold text-white disabled:opacity-40"
              >
                Stick it on
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LookPanel({ game, onClose }: { game: HouseGame; onClose: () => void }) {
  const look = game.look;
  const body = look.body ?? 'f';
  const rows: { key: 'skin' | 'hair' | 'shirt' | 'pants' | 'shoes'; label: string; colors: string[] }[] = [
    { key: 'skin', label: 'Skin', colors: SKINS },
    { key: 'hair', label: 'Hair', colors: HAIRS },
    { key: 'shirt', label: 'Top', colors: SHIRTS },
    { key: 'pants', label: 'Trousers', colors: PANTS },
    { key: 'shoes', label: 'Shoes', colors: SHOES },
  ];
  const chip = (on: boolean) => cn('rounded-full px-3 py-1.5 text-small', on ? 'bg-white text-ink' : 'bg-white/15 text-white hover:bg-white/25');
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto flex max-h-[92%] flex-col gap-3 overflow-y-auto rounded-3xl bg-black/75 p-4 text-white">
        <div className="flex items-center justify-between gap-6">
          <span className="font-bold">My look</span>
          <button type="button" aria-label="Done" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 text-small text-white/80">Body</span>
          {(['f', 'm'] as const).map((b) => (
            <button key={b} type="button" onClick={() => game.setLook({ body: b, style: b === 'm' ? 'Hair_SimpleParted' : 'Hair_Long', beard: false })} className={chip(body === b)}>
              {b === 'f' ? 'Woman' : 'Man'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-small text-white/80">Hairstyle</span>
          {HAIRSTYLES.map((h) => (
            <button key={h} type="button" onClick={() => game.setLook({ style: h })} className={chip(look.style === h)}>
              {HAIRSTYLE_LABEL[h]}
            </button>
          ))}
          {body === 'm' ? (
            <button type="button" onClick={() => game.setLook({ beard: !look.beard })} className={chip(!!look.beard)}>
              Beard
            </button>
          ) : null}
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
                className={cn('h-8 w-8 rounded-full', (look[r.key] ?? (r.key === 'shoes' ? SHOES[0] : '')) === c ? 'border-[3px] border-white' : 'border border-white/40')}
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

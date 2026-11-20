'use client';

/**
 * Dev-only house lab: two houses ("A" and "B") side by side, joined by an
 * in-memory channel and an in-memory house_items, running the same
 * HouseWorld, HousePresence and HouseStore the app uses. Click a pane to
 * play it: WASD walks (Shift runs), drag looks, E uses, 1–3 emote, N night,
 * V view, P decorate. window.__lab exposes everything for automated checks.
 */
import { Canvas } from '@react-three/fiber';
import {
  createControls,
  HouseStore,
  HouseWorld,
  HousePresence,
  LOOKS,
  orbitBy,
  QUALITIES,
  setView,
  SKY_KEY,
  StaleHouseError,
  tapAt,
  zoomBy,
  type HouseApi,
  type HouseControls,
  type HouseEvent,
  type HudState,
  type Quality,
} from '@us/shared/house';
import { notFound } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

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

/** house_items with set_house_item's version check, in memory. */
function memoryDb(): HouseApi {
  const rows = new Map<string, { state: Record<string, unknown>; version: number }>();
  return {
    load: async () => [...rows].map(([key, r]) => ({ key, state: r.state, version: r.version })),
    save: async (key, state, version) => {
      await new Promise((r) => setTimeout(r, 60));
      const now = rows.get(key);
      if ((now?.version ?? 0) !== version) throw new StaleHouseError();
      if (!state) {
        rows.delete(key);
        return 0;
      }
      rows.set(key, { state, version: version + 1 });
      return version + 1;
    },
  };
}

function Pane({ who, presence, store, controls, quality, focused, onFocus, houseUrl }: { who: 'a' | 'b'; presence: HousePresence; store: HouseStore; controls: HouseControls; quality: Quality; focused: boolean; onFocus: () => void; houseUrl?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const items = useSyncExternalStore((fn) => store.subscribe(fn), () => store.items(), () => store.items());
  const [place, setPlace] = useState('');
  const [other, setOther] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [moment, setMoment] = useState('');
  const [fps, setFps] = useState(0);
  return (
    <div
      ref={box}
      data-pane={who}
      className={`relative h-full flex-1 touch-none overflow-hidden ${focused ? 'outline outline-2 outline-gold-400' : ''}`}
      onPointerDown={(e) => {
        onFocus();
        down.current = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      }}
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
      <Canvas key={quality} shadows={quality !== 'low'} dpr={[1, 1.5]} frameloop={quality === 'low' ? 'demand' : 'always'} camera={{ fov: 55, near: 0.1, far: 200 }} style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}>
        <HouseWorld
          quality={quality}
          controls={controls}
          presence={presence}
          store={store}
          items={items}
          photos={[]}
          meId={who}
          partnerId={who === 'a' ? 'b' : 'a'}
          partnerName={who === 'a' ? 'B' : 'A'}
          mine={LOOKS[who === 'a' ? 0 : 1]!}
          theirs={LOOKS[who === 'a' ? 1 : 0]!}
          onPlace={setPlace}
          onPartnerPlace={setOther}
          onHud={setHud}
          onMoment={(m) => {
            setMoment(m);
            setTimeout(() => setMoment(''), 3000);
          }}
          onFps={(f) => setFps(Math.round(f))}
          houseUrl={houseUrl}
        />
      </Canvas>
      <div data-hud={who} className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 font-mono text-[12px] text-white">
        {who.toUpperCase()} · {place} · other: {other ?? '—'} · {fps} fps · action: {hud?.action ?? '—'}
        {hud?.holding ? ` · holding ${hud.holding}` : ''}
        {hud?.selected ? ` · picked ${hud.selected.label}` : ''}
        {moment ? ` · ★ ${moment}` : ''}
      </div>
    </div>
  );
}

export default function HouseLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  const [quality, setQuality] = useState<Quality>('medium');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q') as Quality | null;
    if (q && QUALITIES.includes(q)) setQuality(q);
  }, []);
  const [focus, setFocus] = useState<'a' | 'b'>('a');
  // ?real=1: the realistic house from public/house (copy assets-build/house there).
  const [houseUrl, setHouseUrl] = useState<string | undefined>();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('real')) setHouseUrl('/house');
  }, []);
  const lab = useMemo(() => {
    const wire = bus();
    const db = memoryDb();
    const a = new HousePresence('a', wire('a'));
    const b = new HousePresence('b', wire('b'));
    const sa = new HouseStore(db, (op) => a.sendItem(op));
    const sb = new HouseStore(db, (op) => b.sendItem(op));
    a.onItem((op) => sa.receive(op));
    b.onItem((op) => sb.receive(op));
    void sa.load();
    void sb.load();
    return { a, b, sa, sb, ca: createControls(), cb: createControls() };
  }, []);
  // ?scene=… plays a scripted scene, for screenshots without hands.
  useEffect(() => {
    const scene = new URLSearchParams(window.location.search).get('scene');
    const at = (ms: number, fn: () => void) => setTimeout(fn, ms);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = (steps: [number, () => void][]) => steps.forEach(([ms, fn]) => timers.push(at(ms, fn)));
    const { ca, cb, sa } = lab;
    if (scene === 'movie')
      run([
        [800, () => sa.set(SKY_KEY, { on: true })],
        [900, () => sa.set('tv', { on: true })],
        [1000, () => ca.cmds.push({ t: 'walkTo', x: -2.3, y: 0, z: -0.5, use: 'sofa' })],
        [1500, () => cb.cmds.push({ t: 'walkTo', x: -2.3, y: 0, z: 0.6, use: 'sofa' })],
        [9000, () => ((ca.yaw = -Math.PI / 2 + 0.5), (ca.pitch = 0.45), (cb.yaw = Math.PI / 2 + 0.3))],
      ]);
    if (scene === 'carry')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 4.8, y: 0, z: -1.3, use: 'mug' })],
        [1200, () => cb.cmds.push({ t: 'walkTo', x: 2.6, y: 0, z: 3.3 })],
        [16000, () => ca.cmds.push({ t: 'walkTo', x: 3.1, y: 0, z: 0.55 })],
        [21000, () => ((ca.yaw = 0.8), ca.cmds.push({ t: 'use' }))],
        [23000, () => ca.cmds.push({ t: 'walkTo', x: 2.0, y: 0, z: -2.0 })],
        [24000, () => ((cb.yaw = Math.PI * 0.75), (cb.pitch = 0.5))],
      ]);
    if (scene === 'decor')
      run([
        [800, () => ((ca.decorate = true), setView(ca, 'above'))],
        [1000, () => ca.cmds.push({ t: 'add', model: 'armchair' })],
        [1500, () => ca.cmds.push({ t: 'paint', color: '#E3C44F' })],
        [1800, () => (ca.move = [0.5, -0.6])],
        [2600, () => (ca.move = [0, 0])],
        [3000, () => ca.cmds.push({ t: 'rotate', by: Math.PI / 4 })],
        [3500, () => ca.cmds.push({ t: 'add', model: 'plantPot' })],
      ]);
    if (scene === 'upstairs')
      run([
        [800, () => sa.set(SKY_KEY, { on: true })],
        [900, () => sa.set('bed_lamp', { on: true })],
        [1000, () => ca.cmds.push({ t: 'walkTo', x: -3.3, y: 3, z: -0.4, use: 'bed' })],
        [1400, () => cb.cmds.push({ t: 'walkTo', x: -3.5, y: 3, z: 5.0 })],
        [14000, () => ((ca.yaw = 1.1), (ca.pitch = 0.6), (cb.yaw = Math.PI), (cb.pitch = 0.25))],
      ]);
    if (scene === 'pool')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 5, y: -1, z: 9 })],
        [1000, () => cb.cmds.push({ t: 'walkTo', x: 4.4, y: 0, z: 11.3, use: 'lounger_1' })],
        [9000, () => ((ca.yaw = 2.6), (ca.pitch = 0.5), (cb.yaw = Math.PI + 0.4), (cb.pitch = 0.45))],
      ]);
    return () => timers.forEach(clearTimeout);
  }, [lab]);

  // The lab's two of us live as long as the page (Strict Mode runs effects twice, so no dispose here).
  useEffect(() => {
    (window as unknown as { __lab: unknown }).__lab = lab;
  }, [lab]);

  // The keyboard plays whichever pane was clicked last.
  useEffect(() => {
    const held = new Set<string>();
    const c = () => (focus === 'a' ? lab.ca : lab.cb);
    const store = () => (focus === 'a' ? lab.sa : lab.sb);
    const stick = () => {
      const x = (held.has('d') ? 1 : 0) - (held.has('a') ? 1 : 0);
      const y = (held.has('s') ? 1 : 0) - (held.has('w') ? 1 : 0);
      const run = held.has('shift') ? 1 : 0.6;
      const d = Math.hypot(x, y) || 1;
      c().move = [(x / d) * run, (y / d) * run];
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'e') c().cmds.push({ t: 'use' });
      else if (k === '1') c().emotes.push('wave');
      else if (k === '2') c().emotes.push('heart');
      else if (k === '3') c().emotes.push('dance');
      else if (k === 'n') store().set(SKY_KEY, { on: !(store().items().get(SKY_KEY)?.on === true) });
      else if (k === 'v') setView(c(), c().view === 'close' ? 'above' : 'close');
      else if (k === 'p') c().decorate = !c().decorate;
      else if (['w', 'a', 's', 'd', 'shift'].includes(k)) {
        held.add(k);
        stick();
      }
    };
    const up = (e: KeyboardEvent) => {
      held.delete(e.key.toLowerCase());
      stick();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      lab.ca.move = [0, 0];
      lab.cb.move = [0, 0];
    };
  }, [focus, lab]);

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <div className="flex items-center gap-2 bg-plum-900 px-3 py-2 text-[13px] text-white">
        House lab · playing {focus.toUpperCase()} · WASD walk · Shift run · E use · 1–3 emote · N night · V view · P decorate · quality:
        {QUALITIES.map((q) => (
          <button key={q} type="button" onClick={() => setQuality(q)} className={q === quality ? 'rounded bg-white px-2 text-plum-900' : 'rounded px-2 underline'}>
            {q}
          </button>
        ))}
      </div>
      <div className="flex flex-1 gap-1">
        <Pane who="a" presence={lab.a} store={lab.sa} controls={lab.ca} quality={quality} focused={focus === 'a'} onFocus={() => setFocus('a')} houseUrl={houseUrl} />
        <Pane who="b" presence={lab.b} store={lab.sb} controls={lab.cb} quality={quality} focused={focus === 'b'} onFocus={() => setFocus('b')} houseUrl={houseUrl} />
      </div>
    </div>
  );
}

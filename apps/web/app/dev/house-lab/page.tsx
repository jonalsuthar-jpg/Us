'use client';

/**
 * Dev-only house lab: two houses ("A" and "B") side by side, joined by an
 * in-memory channel and an in-memory house_items, running the same
 * HouseWorld, HousePresence and HouseStore the app uses. Click a pane to
 * play it: WASD walks (Shift runs), drag looks, E uses, 1–3 emote, N night,
 * V view, P decorate. window.__lab exposes everything for automated checks.
 */
import { Canvas, useThree } from '@react-three/fiber';
import {
  createControls,
  HouseStore,
  HouseWorld,
  HousePresence,
  LOOKS,
  orbitBy,
  QUALITIES,
  nextCameraView,
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
        <SceneHandle who={who} />
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
          onFps={(f, calls) => setFps(`${Math.round(f)} · ${calls} calls` as unknown as number)}
          houseUrl={houseUrl}
          pairedAt={PAIRED}
        />
      </Canvas>
      <div data-hud={who} className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 font-mono text-[12px] text-white">
        {who.toUpperCase()} · {place} · other: {other ?? '—'} · {fps} fps · action: {hud?.action ?? '—'}
        {hud?.holding ? ` · holding ${hud.holding}` : ''}
        {hud?.selected ? ` · picked ${hud.selected.label}` : ''}
        {moment ? ` · ★ ${moment}` : ''}
        {hud?.fun.banner ? ` · ▸ ${hud.fun.banner}` : ''}
        {hud?.fun.panel ? ` · [${hud.fun.panel.title}: ${hud.fun.panel.text ?? ''}]` : ''}
      </div>
    </div>
  );
}

/** Together long enough that the house has everything. */
const PAIRED = new Date(Date.now() - 400 * 86_400_000).toISOString();

// ?phone=1: the house behaves as on a phone (no shadows, nearer drawing), to measure it.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('phone')) (window as unknown as { __US_PHONE__?: boolean }).__US_PHONE__ = true;

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
    if (scene === 'together')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: -3.0, y: 0, z: 8.2 })],
        [800, () => cb.cmds.push({ t: 'walkTo', x: -3.0, y: 0, z: 7.4 })],
        [7000, () => ca.cmds.push({ t: 'use' })],
        [11000, () => ca.cmds.push({ t: 'invite', kind: 'kiss' })],
        [12000, () => cb.cmds.push({ t: 'answer', yes: true })],
        [17000, () => ca.cmds.push({ t: 'invite', kind: 'hands' })],
        [18000, () => cb.cmds.push({ t: 'answer', yes: true })],
        [19000, () => (ca.move = [0, -0.6])],
        [23000, () => (ca.move = [0, 0])],
      ]);
    if (scene === 'slow')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: -3.0, y: 0, z: 8.2 })],
        [800, () => cb.cmds.push({ t: 'walkTo', x: -3.0, y: 0, z: 7.4 })],
        [7000, () => ca.cmds.push({ t: 'invite', kind: 'slow' })],
        [8000, () => cb.cmds.push({ t: 'answer', yes: true })],
      ]);
    if (scene === 'first')
      run([
        [500, () => setView(ca, 'first')],
        [500, () => setView(cb, 'far')],
        [600, () => sa.set(SKY_KEY, { on: false, at: new Date().toISOString() })],
        [1500, () => (ca.yaw = Math.PI * 0.75)],
      ]);
    if (scene === 'chess')
      run([
        [800, () => ca.cmds.push({ t: 'pick', id: 'chess' })],
        [1200, () => cb.cmds.push({ t: 'walkTo', x: 4.6, y: 0, z: 1.95, use: 'chair_3' })],
        [16000, () => ca.cmds.push({ t: 'pick', id: 'board' })],
        [17000, () => {
          const g = sa.get('game') as { s: { fen: string } } | null;
          if (g) sa.set('game', { ...g, s: { ...g.s, fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', last: ['b8', 'c6'] } });
        }],
        [19000, () => ca.taps.push([0.05, -0.3])],
      ]);
    if (scene === 'ludo')
      run([
        [800, () => ca.cmds.push({ t: 'pick', id: 'ludo' })],
        [1200, () => cb.cmds.push({ t: 'walkTo', x: 4.6, y: 0, z: 1.95, use: 'chair_3' })],
        [16000, () => ca.cmds.push({ t: 'pick', id: 'board' })],
        [17000, () => {
          const g = sa.get('game') as { s: Record<string, unknown> } | null;
          if (g) sa.set('game', { ...g, s: { ...g.s, pos: [[5, 30], [-1, 12]], dice: null, turn: 0 } });
        }],
        [18000, () => ca.cmds.push({ t: 'pick', id: 'roll' })],
      ]);
    if (scene === 'gifts')
      run([
        [800, () => cb.cmds.push({ t: 'pick', id: 'leave:flowers' })],
        [900, () => cb.cmds.push({ t: 'pick', id: 'leave:heart' })],
        [1000, () => cb.cmds.push({ t: 'pick', id: 'leave:box' })],
        [1100, () => cb.cmds.push({ t: 'pick', id: 'send', text: 'For the best weekend ever 💛' })],
        [1500, () => ca.cmds.push({ t: 'walkTo', x: -3.2, y: 0, z: 2.3 })],
        [1600, () => cb.cmds.push({ t: 'walkTo', x: -3.0, y: 0, z: 7.5 })],
        [9000, () => ((ca.yaw = 0), (ca.pitch = 0.4))],
        [11000, () => ca.cmds.push({ t: 'use' })],
      ]);
    if (scene === 'dinner')
      run([
        [700, () => sa.set(SKY_KEY, { on: true, at: new Date().toISOString() })],
        [800, () => sa.set('dinner', { recipe: 'pasta', step: 4, first: 'a', second: 'b', done: true, at: new Date().toISOString() })],
        [850, () => sa.set('dish', { on: true })],
        [1000, () => ca.cmds.push({ t: 'walkTo', x: 1.6, y: 0, z: 1.25, use: 'chair_1' })],
        [1200, () => cb.cmds.push({ t: 'walkTo', x: 4.6, y: 0, z: 1.95, use: 'chair_4' })],
        [12000, () => ((ca.yaw = -Math.PI / 2 - 0.4), (ca.pitch = 0.35), (cb.yaw = Math.PI / 2 + 0.5))],
      ]);
    if (scene === 'garden')
      run([
        [700, () => sa.set(SKY_KEY, { on: true, at: new Date().toISOString() })],
        [800, () => sa.set('garden_bed_1', { crop: 'tomato', days: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'] })],
        [800, () => sa.set('garden_bed_2', { crop: 'sunflower', days: ['2026-11-01', '2026-11-02', '2026-11-03'] })],
        [800, () => sa.set('garden_bed_3', { crop: 'tulip', days: ['2026-11-01'] })],
        [900, () => sa.set('fire_pit', { on: true })],
        [1000, () => ca.cmds.push({ t: 'walkTo', x: -6.3, y: 0, z: 14, use: 'log_bench' })],
        [1200, () => cb.cmds.push({ t: 'walkTo', x: -10.4, y: 0, z: 11 })],
        [12000, () => ((ca.yaw = Math.PI + 0.3), (ca.pitch = 0.35), (cb.yaw = -Math.PI / 2 - 0.3), (cb.pitch = 0.4))],
      ]);
    if (scene === 'tub')
      run([
        [700, () => sa.set(SKY_KEY, { on: true, at: new Date().toISOString() })],
        [1000, () => ca.cmds.push({ t: 'walkTo', x: 9.2, y: 0, z: 9, use: 'hot_tub' })],
        [1200, () => cb.cmds.push({ t: 'walkTo', x: 9.2, y: 0, z: 9.6, use: 'hot_tub' })],
        [14000, () => ((ca.yaw = -Math.PI / 2 - 0.5), (ca.pitch = 0.45), (cb.yaw = Math.PI * 0.75), (cb.pitch = 0.3))],
      ]);
    if (scene === 'ball')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: -5, y: 0, z: 9.5, use: 'ball' })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: -9, y: 0, z: 12 })],
        [16000, () => ca.cmds.push({ t: 'use' })],
        [16450, () => cb.cmds.push({ t: 'use' })],
        [19000, () => cb.cmds.push({ t: 'use' })],
        [19500, () => ca.cmds.push({ t: 'use' })],
      ]);
    if (scene === 'seek')
      run([
        [800, () => cb.cmds.push({ t: 'walkTo', x: -3.0, y: 0, z: 6.6 })],
        [800, () => ca.cmds.push({ t: 'walkTo', x: -2.0, y: 0, z: 6.6 })],
        [8000, () => ca.cmds.push({ t: 'pick', id: 'seek' })],
        [9000, () => ca.cmds.push({ t: 'walkTo', x: 4.5, y: 0, z: 2.5 })],
      ]);
    if (scene === 'scope')
      run([
        [700, () => sa.set(SKY_KEY, { on: true, at: new Date().toISOString() })],
        [800, () => ca.cmds.push({ t: 'pick', id: 'stars' })],
      ]);
    // The village: out through the gate, to the square, the café and the park.
    if (scene === 'gate')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 5, y: 0, z: 27 })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: 5.4, y: 0, z: 24 })],
        [20000, () => ((ca.yaw = 0.15), (ca.pitch = 0.28), (cb.yaw = Math.PI), (cb.pitch = 0.3))],
      ]);
    if (scene === 'square')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: -1, y: 0, z: 40, use: 'bench_2' })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: -6, y: 0, z: 40 })],
        [30000, () => ((ca.yaw = 0.2), (ca.pitch = 0.3), (cb.yaw = -2.2), (cb.pitch = 0.22))],
      ]);
    if (scene === 'cafe')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 14.3, y: 0, z: 41, use: 'cafe_chair_0_a' })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: 15.7, y: 0, z: 41, use: 'cafe_chair_0_b' })],
        [40000, () => ((ca.yaw = -Math.PI / 2 - 0.6), (ca.pitch = 0.3), (cb.yaw = Math.PI / 2 + 0.5), (cb.pitch = 0.25))],
      ]);
    if (scene === 'park')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 35, y: 0, z: 56, use: 'bench_4' })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: 42, y: 0, z: 48 })],
        [55000, () => ((ca.yaw = -Math.PI / 2 + 0.3), (ca.pitch = 0.25), (cb.yaw = 0.4), (cb.pitch = 0.3))],
      ]);
    if (scene === 'temple')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: -52.5, y: 0, z: 55.5 })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: -55, y: 0, z: 49 })],
        [62000, () => ((ca.yaw = Math.PI - 0.5), (ca.pitch = 0.2), (cb.yaw = Math.PI + 0.15), (cb.pitch = 0.2))],
      ]);
    if (scene === 'beach')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 19.25, y: 0.3, z: 110.4 })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: 8, y: 0, z: 94 })],
        [62000, () => ((ca.yaw = 0.3), (ca.pitch = 0.22), (cb.yaw = -0.4), (cb.pitch = 0.2))],
      ]);
    if (scene === 'boat')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 20.2, y: 0.3, z: 109.5 })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: 19.4, y: 0.3, z: 108.6 })],
        [60000, () => ca.cmds.push({ t: 'use' })],
        [61500, () => cb.cmds.push({ t: 'use' })],
        [63000, () => ca.cmds.push({ t: 'use' })],
        [67000, () => ca.cmds.push({ t: 'use' })],
        [72000, () => ((ca.yaw = 0.6), (ca.pitch = 0.3), (cb.yaw = 2.4), (cb.pitch = 0.35))],
      ]);
    if (scene === 'hill')
      run([
        [800, () => ca.cmds.push({ t: 'walkTo', x: 80.2, y: 6, z: 51.5, use: 'hill_bench' })],
        [900, () => cb.cmds.push({ t: 'walkTo', x: 81, y: 6, z: 57 })],
        [62000, () => ((ca.yaw = Math.PI / 2 + 0.2), (ca.pitch = 0.18), (cb.yaw = Math.PI / 2 - 0.3), (cb.pitch = 0.15))],
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
      else if (k === 'v') setView(c(), nextCameraView(c().view));
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

/** The lab's scenes, for counting what's drawn (window.__scenes.a / .b). */
function SceneHandle({ who }: { who: string }) {
  const scene = useThree((st) => st.scene);
  useEffect(() => {
    const w = window as unknown as { __scenes?: Record<string, unknown> };
    w.__scenes = { ...(w.__scenes ?? {}), [who]: scene };
  }, [scene, who]);
  return null;
}

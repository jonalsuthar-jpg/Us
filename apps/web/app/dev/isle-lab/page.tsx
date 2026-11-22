'use client';

/**
 * Dev-only Isle lab: the board with a game the hard bots play on their own,
 * to look at the art and the animations. Space pauses or plays, N steps one
 * move, R starts a new island, M shows where the next town could go; the
 * wheel zooms, dragging pans, a click says what's under it.
 * ?seed=… picks the island, ?q=low|medium|high the quality, ?at=… plays that
 * many moves straight away, ?paused=1 starts paused, ?marks=1 shows the town
 * spots. window.__isle exposes the game for checks.
 * ?table=1 shows the whole game screen instead, with Asha played by hand
 * (?at= plays everyone, Asha too, before handing over; ?mine=1 then plays on
 * until Asha has rolled on her own turn).
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { QUALITIES, type Quality } from '@us/shared/house';
import {
  apply,
  hardMove,
  IsleBoard,
  newGame,
  nearestEdge,
  nearestHex,
  nearestVert,
  settleSpots,
  waitingOn,
  type IsleBoardApi,
  type IsleState,
  type Marks,
} from '@us/shared/isle';
import { notFound } from 'next/navigation';
import { IsleTable } from '@/components/isle/isle-table';
import { useIsleSound } from '@/components/isle/use-isle-sound';
import { useCallback, useEffect, useRef, useState } from 'react';

const SEATS = [
  { id: 'a', name: 'You', bot: true },
  { id: 'b', name: 'Partner', bot: true },
  { id: 'x', name: 'Tara', bot: true },
  { id: 'y', name: 'Dev', bot: true },
];

/** Draw calls and triangles each frame, for the phone budget. */
function Counter({ onCount }: { onCount: (s: string) => void }) {
  const last = useRef(0);
  useFrame(({ gl, clock }) => {
    // Counted by hand from frame to frame, so the shadow pass is in it too.
    gl.info.autoReset = false;
    const { calls, triangles } = gl.info.render;
    gl.info.reset();
    if (clock.elapsedTime - last.current < 1) return;
    last.current = clock.elapsedTime;
    onCount(`${calls} draws · ${(triangles / 1000).toFixed(0)}k tris`);
  });
  return null;
}

function step(s: IsleState): IsleState {
  if (s.phase === 'over') return s;
  const seat = waitingOn(s)[0]!;
  const next = apply(s, seat, hardMove(s, seat));
  return typeof next === 'string' ? s : next;
}

/** The game screen with a local game: Asha by hand, everyone else on their own. */
function LabTable() {
  const [state, setState] = useState<IsleState | null>(null);
  const me = state ? state.players.findIndex((p) => p.id === 'a') : 0;
  const [thinking, setThinking] = useState<number | null>(null);
  const audio = useIsleSound();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let s = newGame(
      [
        { id: 'a', name: 'Asha', bot: false },
        { id: 'b', name: 'Rohan', bot: false },
        { id: 'x', name: 'Meera', bot: true },
        { id: 'y', name: 'Kabir', bot: true },
      ],
      Number(q.get('seed') ?? 7),
    );
    for (let i = 0, n = Number(q.get('at') ?? 0); i < n; i++) s = step(s);
    const mine = s.players.findIndex((p) => p.id === 'a');
    if (q.get('mine')) for (let i = 0; i < 2000 && !(s.turn === mine && s.phase === 'main' && !s.offer); i++) s = step(s);
    setState(s);
  }, []);
  useEffect(() => {
    (window as unknown as { __isle?: unknown }).__isle = { state, setState, step };
    if (!state || state.phase === 'over') return;
    const seat = waitingOn(state).find((p) => p !== me);
    if (seat == null) return setThinking(null);
    setThinking(seat);
    const t = setTimeout(() => {
      const next = apply(state, seat, hardMove(state, seat));
      if (typeof next !== 'string') setState(next);
    }, 900);
    return () => clearTimeout(t);
  }, [state, me]);
  if (!state) return null;
  return (
    <IsleTable
      {...audio}
      state={state}
      me={me}
      botThinking={thinking}
      onMove={(a) => {
        const next = apply(state, me, a);
        if (typeof next === 'string') return next;
        setState(next);
        return null;
      }}
      onNewGame={() => setState(newGame(state.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot })), Math.floor(Math.random() * 1e9)))}
      onExit={() => history.back()}
    />
  );
}

export default function IsleLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  const [table] = useState(() => typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('table'));
  if (table) return <LabTable />;
  return <BoardLab />;
}

function BoardLab() {
  const [quality, setQuality] = useState<Quality>('medium');
  const [state, setState] = useState<IsleState | null>(null);
  const [playing, setPlaying] = useState(true);
  const [marks, setMarks] = useState<Marks | undefined>();
  const [note, setNote] = useState('');
  const [count, setCount] = useState('');
  const api = useRef<IsleBoardApi | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const quality = q.get('q') as Quality | null;
    if (quality && QUALITIES.includes(quality)) setQuality(quality);
    let s = newGame(SEATS, Number(q.get('seed') ?? Math.floor(Math.random() * 1e9)));
    for (let i = 0, n = Number(q.get('at') ?? 0); i < n; i++) s = step(s);
    setState(s);
    if (q.get('paused')) setPlaying(false);
    if (q.get('marks')) setMarks({ verts: settleSpots(s, waitingOn(s)[0] ?? 0) });
  }, []);

  useEffect(() => {
    (window as unknown as { __isle?: unknown }).__isle = { state, setState, step, api: api.current };
  }, [state]);

  useEffect(() => {
    if (!playing || !state || state.phase === 'over') return;
    const t = setTimeout(() => setState((s) => (s ? step(s) : s)), state.log.at(-1)?.k === 'roll' ? 1400 : 380);
    return () => clearTimeout(t);
  }, [playing, state]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ') setPlaying((p) => !p);
      if (e.key === 'n') setState((s) => (s ? step(s) : s));
      if (e.key === 'r') setState(newGame(SEATS, Math.floor(Math.random() * 1e9)));
      if (e.key === 'm')
        setMarks((m) => {
          if (m || !state) return undefined;
          const p = waitingOn(state)[0] ?? 0;
          return { verts: settleSpots(state, p) };
        });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [state]);

  const onReady = useCallback((a: IsleBoardApi) => {
    api.current = a;
  }, []);

  const ndc = (e: React.PointerEvent | React.WheelEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1, h: r.height };
  };

  if (!state) return null;
  const s = state;
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#A9D8E8', touchAction: 'none' }}
      onWheel={(e) => api.current?.zoomBy(e.deltaY > 0 ? 1.1 : 0.9)}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY };
        const p = ndc(e);
        const at = api.current?.pick(p.x, p.y);
        if (at) {
          setNote(
            `x ${at.x.toFixed(2)} y ${at.y.toFixed(2)} · corner ${nearestVert(at.x, at.y)} · side ${nearestEdge(at.x, at.y)} · hex ${nearestHex(at.x, at.y)}`,
          );
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const h = (e.currentTarget as HTMLElement).clientHeight;
        api.current?.panBy((e.clientX - d.x) / h, (e.clientY - d.y) / h);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <Canvas shadows={quality !== 'low'} dpr={[1, 2]} camera={{ fov: 45, near: 0.1, far: 120 }} style={{ pointerEvents: 'none' }}>
        <IsleBoard state={s} marks={marks} quality={quality} onReady={onReady} />
        <Counter onCount={setCount} />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'rgba(20,30,40,0.6)',
          color: 'white',
          font: '13px system-ui',
          pointerEvents: 'none',
        }}
      >
        <div>
          {count} · seed {s.seed} · move {s.mv} · turn {s.turnNo} · {s.phase} · {playing ? 'playing' : 'paused'} · dice {s.dice?.join('+') ?? '–'}
        </div>
        <div>
          {s.players.map((p, i) => `${p.name} ${s.towns.filter((t) => t?.p === i).length}t`).join(' · ')}
          {s.winner != null ? ` · ${s.players[s.winner]!.name} won` : ''}
        </div>
        <div>{note}</div>
        <div style={{ opacity: 0.7 }}>space play/pause · n step · r new island · m town spots · wheel zoom · drag pan</div>
      </div>
    </div>
  );
}

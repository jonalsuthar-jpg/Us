'use client';

/**
 * Isle's table on the web. The island fills the middle and is the first
 * thing you see; around it, never over it:
 *
 * - along the top, whose turn it is, their points, the round and what's
 *   happening, with the log, view and sound switches;
 * - down the left, the four players (points, cards, development cards,
 *   knights, road, and the two bonuses);
 * - down the right, what I can build (each with its cost and what I'm short
 *   of), trading with the players or the bank, and what the bank has left;
 * - along the bottom, the dice with Roll and End turn, my resource cards and,
 *   apart from them, my development cards.
 *
 * Panels open over the board for trading, a development card up close,
 * giving back cards on a 7, choosing who to rob, and the end of the game.
 * Cards fly where the game sends them, and short notes say what happened.
 *
 * It only draws a game state and hands moves to onMove; IsleView connects
 * it to the game both phones share, and the lab drives it with a local one.
 */
import { Canvas } from '@react-three/fiber';
import type { Quality } from '@us/shared/house';
import {
  cuesFor,
  GOAL,
  hexArtAt,
  IDLE,
  IsleBoard,
  IslePerf,
  pickMark,
  settleMode,
  tableView,
  tapBoard,
  type Dev,
  type Hand,
  type Inset,
  type IsleAction,
  type IsleBoardApi,
  type IsleSound,
  type IsleState,
  type IsleStats,
  type Mode,
  type Picked,
  type Res,
} from '@us/shared/isle';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DevCardDialog, ResourceChooser } from './dev-cards';
import { FlyCards, Notifications } from './effects';
import { IsleKeyframes } from './kit';
import { DiscardPanel, Log, Results, StealPanel } from './panels';
import { BuildPanel, CornerButtons, DevelopmentCardHand, DiceController, PlayerPanel, ResourceHand, TopBar, TurnCard } from './table-parts';
import { AnsweredOffer, IncomingOffer, TradePanel, type TradeTab } from './trade';

export interface IsleTableProps {
  state: IsleState;
  me: number;
  /** Makes a move; returns why not, or null. */
  onMove: (a: IsleAction) => string | null;
  botThinking?: number | null;
  quality?: Quality;
  onNewGame?: () => void;
  onExit?: () => void;
  sound?: IsleSound | null;
  /** All sound off. */
  muted?: boolean;
  /** The tune under the waves. */
  music?: boolean;
  onToggleSound?: () => void;
  onToggleMusic?: () => void;
}

/** The tiles' pictures, from public/isle/hex (scripts/build-isle-hexes.mjs). */
const HEX_ART = hexArtAt('/isle/hex');

/** The side columns' widths and the top bar's height. */
const SIDE_L = 228;
const SIDE_R = 262;
const TOP = 64;
/** On a narrow screen the turn line drops below the buttons. */
const TOP_COMPACT = 118;
const GAP = 12;

/** The trade panel, when open: which tab, or a counter to someone's offer. */
type Trading = { tab: TradeTab; counter?: boolean } | null;

export function IsleTable({
  state,
  me,
  onMove,
  botThinking = null,
  quality = 'medium',
  onNewGame,
  onExit,
  sound = null,
  muted = false,
  music = true,
  onToggleSound,
  onToggleMusic,
}: IsleTableProps) {
  const [mode, setMode] = useState<Mode>(IDLE);
  const live = settleMode(state, me, mode);
  const view = useMemo(() => tableView(state, me, live), [state, me, live]);
  const [problem, setProblem] = useState<{ text: string; at: number } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [top, setTop] = useState(false);
  const [hover, setHover] = useState<Picked | null>(null);
  const [trading, setTrading] = useState<Trading>(null);
  const [devOpen, setDevOpen] = useState<Dev | null>(null);
  const [picked, setPicked] = useState<Partial<Record<Res, boolean>>>({});
  const api = useRef<IsleBoardApi | null>(null);
  const colors = useMemo(() => view.seats.map((s) => s.color), [view.seats]);
  // ?perf=1: a small panel with the frame rate, draw calls and what's on the GPU.
  const [perf] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf'));
  const [stats, setStats] = useState<IsleStats | null>(null);
  const stealH = live.k === 'steal' ? live.h : null;
  const boardHover = useMemo<Picked | null>(() => (stealH != null ? { kind: 'hex', i: stealH } : hover), [stealH, hover]);

  useEffect(() => {
    if (live !== mode) setMode(live);
  }, [live, mode]);
  useEffect(() => {
    if (!problem) return;
    const t = setTimeout(() => setProblem(null), 2600);
    return () => clearTimeout(t);
  }, [problem]);
  // Panels that no longer fit the game close: a counter to an offer that's gone, a trade once the turn moves on.
  useEffect(() => {
    if (trading?.counter && !view.incoming) setTrading(null);
    else if (trading && !trading.counter && !view.canTrade && !view.outgoing) setTrading(null);
  }, [trading, view.incoming, view.canTrade, view.outgoing]);
  // Cards picked in the hand drop once they're gone.
  useEffect(() => {
    setPicked((p) => (Object.keys(p).some((r) => p[r as Res] && !view.hand[r as Res]) ? {} : p));
  }, [view.hand]);

  // What just happened, heard: each cue at its moment (a roll's chime once the dice land).
  const heard = useRef<IsleState | null>(null);
  const cueTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const cues = cuesFor(heard.current, state, me);
    heard.current = state;
    for (const c of cues) {
      const t = setTimeout(() => {
        cueTimers.current.delete(t);
        sound?.play(c.name, c.volume);
      }, c.at * 1000);
      cueTimers.current.add(t);
    }
  }, [state, me, sound]);
  useEffect(() => {
    const timers = cueTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);
  // The sea all the time, the tune when it's on.
  useEffect(() => {
    if (!sound) return;
    sound.setMaster(muted ? 0 : 1);
    sound.loop('waves', 0.3);
    sound.loop('music', music ? 0.22 : 0);
  }, [sound, muted, music]);

  const move = useCallback(
    (a: IsleAction) => {
      sound?.play('click', 0.3);
      let why: string | null;
      try {
        why = onMove(a);
      } catch (e) {
        console.warn('[isle] move failed', e);
        why = 'That didn’t work. Try again';
      }
      if (why) setProblem({ text: why, at: Date.now() });
      return !why;
    },
    [onMove, sound],
  );

  const onReady = useCallback((a: IsleBoardApi) => {
    api.current = a;
  }, []);
  const toScreen = useCallback((x: number, y: number) => {
    const a = api.current;
    if (!a || typeof window === 'undefined') return null;
    const p = a.toScreen(x, y);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }, []);

  const pickAt = (ndcX: number, ndcY: number) => {
    const at = api.current?.pick(ndcX, ndcY);
    return at && view.marks ? pickMark(view.marks, at.x, at.y) : null;
  };
  const tap = (ndcX: number, ndcY: number) => {
    const r = tapBoard(state, me, live, pickAt(ndcX, ndcY));
    if (r.action) move(r.action);
    if (r.mode) setMode(r.mode);
    setHover(null);
  };
  const point = (ndcX: number, ndcY: number) => {
    const p = view.marks ? pickAt(ndcX, ndcY) : null;
    setHover((h) => (h?.kind === p?.kind && h?.i === p?.i ? h : p));
  };

  // The dock's height decides how much room the board has.
  const dock = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(170);
  useEffect(() => {
    const el = dock.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDockH(el.getBoundingClientRect().height + GAP));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Smaller screens: the panels shrink together; narrow ones fold the side columns away behind two buttons.
  const screen = useScreen();
  const compact = screen.w < 900;
  const ui = compact ? Math.max(0.6, Math.min(0.85, screen.w / 560)) : Math.max(0.62, Math.min(1, screen.w / 1500, screen.h / 800));
  const [drawer, setDrawer] = useState<'players' | 'build' | null>(null);
  // Wide: nothing along the top (the corner buttons sit in the columns), so the board has the full height above the dock.
  const topH = compact ? TOP_COMPACT * ui : 0;
  const sideL = compact ? 0 : SIDE_L * ui + GAP;
  const sideR = compact ? 0 : SIDE_R * ui + GAP;
  // The board is framed strictly inside what the panels leave free: nothing covers it.
  const inset = useMemo<Inset>(() => ({ left: sideL + GAP, right: sideR + GAP, top: topH + GAP, bottom: dockH + GAP / 2 }), [dockH, sideL, sideR, topH]);

  const openTrade = (tab: TradeTab) => setTrading({ tab });
  const corner = {
    top,
    muted,
    music,
    showLog,
    onExit,
    onLog: () => setShowLog((v) => !v),
    onTop: () => setTop(api.current?.toggleTop() === 'top'),
    onToggleSound,
    onToggleMusic,
  };
  // Someone's offer waiting on me, or my answer to it: in the left column, under whose turn it is.
  const asked =
    view.incoming && !trading?.counter ? (
      <IncomingOffer state={state} view={view} onAnswer={(yes) => move({ t: 'reply', yes })} onCounter={() => setTrading({ tab: 'players', counter: true })} />
    ) : view.answered ? (
      <AnsweredOffer view={view} />
    ) : null;
  const start: Partial<Hand> = Object.fromEntries(Object.entries(picked).flatMap(([r, on]) => (on ? [[r, 1]] : [])));

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#2E8FAE] font-sans">
      <IsleKeyframes />
      <BoardSurface api={api} onTap={tap} onPoint={point} hovering={!!hover}>
        {/*
          Drawn at the screen's own pixel density (capped at 2), antialiased; the camera's near and far planes sit
          just around the board's range (it's never nearer than 5 or further than ~60), which keeps depth precise
          enough that nothing flickers against what it rests on.
        */}
        <Canvas
          shadows={quality !== 'low'}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: 40, near: 1, far: 90 }}
          resize={{ debounce: 0 }}
          style={{ pointerEvents: 'none' }}
        >
          <IsleBoard state={state} marks={view.marks} quality={quality} onReady={onReady} hexArt={HEX_ART} showDice={false} hover={boardHover} inset={inset} />
          {perf ? <IslePerf onStats={setStats} /> : null}
        </Canvas>
      </BoardSurface>

      {compact ? (
        <TopBar
          ui={ui}
          compact
          drawer={drawer}
          onDrawer={(d) => setDrawer((x) => (x === d ? null : d))}
          view={view}
          state={state}
          thinking={botThinking}
          top={top}
          muted={muted}
          music={music}
          showLog={showLog}
          onExit={onExit}
          onLog={() => setShowLog((v) => !v)}
          onTop={() => setTop(api.current?.toggleTop() === 'top')}
          onToggleSound={onToggleSound}
          onToggleMusic={onToggleMusic}
        />
      ) : null}

      {/* Left: whose turn and what's happening, anything asked of me, then the players. */}
      {!compact || drawer === 'players' ? (
        <Column side="left" width={SIDE_L} ui={ui} top={topH} bottom={GAP}>
          <div className="flex flex-col gap-2">
            {compact ? null : <CornerButtons side="left" {...corner} />}
            {compact ? null : <TurnCard view={view} state={state} thinking={botThinking} />}
            {asked}
            <PlayerPanel seats={view.seats} thinking={botThinking} goal={GOAL} />
          </div>
        </Column>
      ) : null}

      {/* Right: the turn's actions (dice, roll, end turn, trade), then building and the bank. */}
      {!compact || drawer === 'build' ? (
        <Column side="right" width={SIDE_R} ui={ui} top={topH} bottom={GAP}>
          <div className="flex flex-col gap-2">
            {compact ? null : <CornerButtons side="right" {...corner} />}
            {compact ? null : (
              <DiceController state={state} view={view} onRoll={() => move({ t: 'roll' })} onEnd={() => move({ t: 'end' })} onTrade={() => openTrade('players')} onBank={() => openTrade('bank')} />
            )}
            <BuildPanel
              view={view}
              state={state}
              mode={live}
              onPick={(what) => {
                if (what === 'dev') move({ t: 'buy' });
                else setMode(live.k === 'build' && live.what === what ? IDLE : { k: 'build', what });
                if (compact && what !== 'dev') setDrawer(null);
              }}
              onTrade={
                compact
                  ? () => {
                      openTrade('players');
                      setDrawer(null);
                    }
                  : undefined
              }
              onBank={
                compact
                  ? () => {
                      openTrade('bank');
                      setDrawer(null);
                    }
                  : undefined
              }
            />
          </div>
        </Column>
      ) : null}

      {/* Bottom, between the columns: my resource cards and, apart, my development cards (the dice too on a narrow screen). */}
      <div ref={dock} className="pointer-events-none absolute bottom-0 z-10 flex justify-center pb-2" style={{ left: sideL + GAP, right: sideR + GAP }}>
        <div className="flex flex-wrap items-end justify-center gap-2.5" style={{ zoom: compact ? Math.max(0.55, screen.w / 1250) : ui }}>
          {compact ? <DiceController state={state} view={view} onRoll={() => move({ t: 'roll' })} onEnd={() => move({ t: 'end' })} /> : null}
          <ResourceHand view={view} picked={picked} onPick={(r) => setPicked((p) => ({ ...p, [r]: !p[r] }))} />
          <DevelopmentCardHand view={view} onOpen={setDevOpen} />
        </div>
      </div>

      {showLog ? <Log state={state} me={me} colors={colors} onClose={() => setShowLog(false)} /> : null}

      {/* What's being asked of me, and the panels over the board. */}
      {view.discard > 0 ? <DiscardPanel hand={view.hand} owed={view.discard} onDone={(cards) => move({ t: 'discard', cards })} /> : null}
      {live.k === 'steal' ? (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: dockH + GAP }}>
          <div className="w-[300px]">
            <StealPanel view={view} from={live.from} onPick={(from) => move({ t: 'robber', h: live.h, from }) && setMode(IDLE)} onCancel={() => setMode(IDLE)} />
          </div>
        </div>
      ) : null}
      {live.k === 'plenty' || live.k === 'monopoly' ? (
        <ResourceChooser
          card={live.k}
          count={live.k === 'plenty' ? 2 : 1}
          onCancel={() => setMode(IDLE)}
          onDone={(r) => (live.k === 'plenty' ? move({ t: 'plenty', a: r[0]!, b: r[1]! }) : move({ t: 'monopoly', r: r[0]! })) && setMode(IDLE)}
        />
      ) : null}
      {trading || view.outgoing ? (
        <TradePanel
          key={trading?.counter ? 'counter' : (trading?.tab ?? 'out')}
          state={state}
          view={view}
          tab={trading?.tab ?? 'players'}
          start={start}
          counterTo={trading?.counter && view.incoming ? view.incoming : undefined}
          onMove={(a) => {
            const ok = move(a);
            if (ok && (a.t === 'offer' || a.t === 'counter')) setPicked({});
            if (ok && a.t === 'counter') setTrading(null);
            return ok;
          }}
          onClose={() => setTrading(null)}
        />
      ) : null}
      {devOpen ? (
        <DevCardDialog
          card={devOpen}
          view={view}
          onClose={() => setDevOpen(null)}
          onPlay={() => {
            setDevOpen(null);
            if (devOpen === 'knight') move({ t: 'knight' });
            else if (devOpen === 'roads') move({ t: 'roads' });
            else if (devOpen === 'plenty') setMode({ k: 'plenty' });
            else if (devOpen === 'monopoly') setMode({ k: 'monopoly' });
          }}
        />
      ) : null}
      {view.over ? <Results state={state} view={view} onNewGame={onNewGame} onExit={onExit} /> : null}

      <FlyCards state={state} me={me} toScreen={toScreen} />
      {perf && stats ? <PerfPanel s={stats} /> : null}
      <Notifications state={state} me={me} colors={colors} right={sideR + GAP} top={topH + GAP} />

      {problem ? (
        <div
          key={problem.at}
          className="pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#2A1A10]/92 px-4 py-2 text-[14px] font-medium text-[#FBEFD5] shadow-lg"
          style={{ bottom: dockH + GAP }}
        >
          <span className="inline-block animate-[isle-shake_0.3s_ease-in-out]">{problem.text}</span>
        </div>
      ) : null}
    </div>
  );
}

/** A side column below the top bar, its contents shrunk with the screen. */
function Column({ side, width, ui, top, bottom, children }: { side: 'left' | 'right'; width: number; ui: number; top: number; bottom: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 overflow-y-auto [scrollbar-width:none]" style={{ [side]: GAP, top: top + 4, bottom, width: width * ui }}>
      <div style={{ zoom: ui, width }}>
        {children}
      </div>
    </div>
  );
}

/** The window's size, kept up to date. */
function useScreen() {
  const [size, setSize] = useState(() => (typeof window === 'undefined' ? { w: 1500, h: 900 } : { w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

// ---- The board's surface: taps, hover, drags, wheel and pinch -------------------------------

function BoardSurface({
  api,
  onTap,
  onPoint,
  hovering,
  children,
}: {
  api: React.RefObject<IsleBoardApi | null>;
  onTap: (x: number, y: number) => void;
  onPoint: (x: number, y: number) => void;
  hovering: boolean;
  children: ReactNode;
}) {
  const pointers = useRef(new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>());
  const pinch = useRef<number | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const ndc = (x: number, y: number) => {
    const r = el.current!.getBoundingClientRect();
    return [((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1] as const;
  };
  return (
    <div
      ref={el}
      className="absolute inset-0 touch-none"
      style={{ cursor: hovering ? 'pointer' : 'grab' }}
      onWheel={(e) => api.current?.zoomBy(e.deltaY > 0 ? 1.08 : 0.92)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: Date.now() });
        pinch.current = null;
      }}
      onPointerMove={(e) => {
        const p = pointers.current.get(e.pointerId);
        if (!p) {
          // Just passing over: light up the spot under a mouse.
          if (e.pointerType === 'mouse') onPoint(...ndc(e.clientX, e.clientY));
          return;
        }
        const h = el.current!.clientHeight;
        if (pointers.current.size === 2) {
          p.x = e.clientX;
          p.y = e.clientY;
          const [a, b] = [...pointers.current.values()];
          const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          if (pinch.current) api.current?.zoomBy(pinch.current / d);
          pinch.current = d;
          // Both fingers sliding up or down tilt towards the top view or back (half each, as each finger reports).
          api.current?.tiltBy(-(e.movementY || 0) / h / 2);
          return;
        }
        api.current?.panBy((e.clientX - p.x) / h, (e.clientY - p.y) / h);
        p.x = e.clientX;
        p.y = e.clientY;
      }}
      onPointerUp={(e) => {
        const p = pointers.current.get(e.pointerId);
        pointers.current.delete(e.pointerId);
        if (!p || pinch.current) return;
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8 && Date.now() - p.t < 600) onTap(...ndc(e.clientX, e.clientY));
      }}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
    >
      {children}
    </div>
  );
}

/** The ?perf=1 panel. */
function PerfPanel({ s }: { s: IsleStats }) {
  const tone = s.fps >= 58 ? 'text-[#9BE38A]' : s.fps >= 40 ? 'text-[#F6CF62]' : 'text-[#FF8A70]';
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-50 rounded-[8px] bg-black/75 px-2.5 py-1.5 font-mono text-[11px] leading-[1.45] text-white">
      <div className={tone}>
        {s.fps} fps · {s.avgMs.toFixed(1)} ms avg · {s.worstMs.toFixed(1)} ms worst
      </div>
      <div>
        {s.calls} draws · {(s.triangles / 1000).toFixed(0)}k tris · {s.geometries} geo · {s.textures} tex ({s.textureMB.toFixed(1)} MB)
      </div>
      <div>
        {s.width}×{s.height} @ {s.dpr.toFixed(2)}x
      </div>
      <div className="max-w-[340px] truncate opacity-70">{s.renderer}</div>
    </div>
  );
}

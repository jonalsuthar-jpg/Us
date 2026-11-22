'use client';

/**
 * Isle's table on the web: the board, and around it everything a player
 * needs. Down the right, the four seats with their points, cards and
 * bonuses. Along the bottom, the build bar with what each piece costs, my
 * hand of cards and development cards, then the trade, dice and end-turn
 * buttons. At the top, the line saying what's happening. Panels open over
 * the board for trading, giving back cards on a 7, choosing who to rob,
 * playing a card, and the end of the game.
 *
 * It only draws a game state and hands moves to onMove; IsleView connects
 * it to the game both phones share, and the lab drives it with a local one.
 */
import { Canvas } from '@react-three/fiber';
import type { Quality } from '@us/shared/house';
import {
  artAt,
  cuesFor,
  DEV_INFO,
  IDLE,
  IsleBoard,
  logLines,
  pickMark,
  RES_INFO,
  RESOURCES,
  settleMode,
  tableView,
  tapBoard,
  type Dev,
  type Hand,
  type IsleAction,
  type IsleBoardApi,
  type IsleSound,
  type IsleState,
  type Mode,
  type Res,
  type SeatView,
  type TableView,
} from '@us/shared/isle';
import {
  ArrowLeftRight,
  Bot,
  Castle,
  Check,
  ChevronLeft,
  Crown,
  Dice5,
  Hourglass,
  House,
  Layers,
  Map as MapIcon,
  Rotate3d,
  Minus,
  Music,
  Plus,
  Route,
  ScrollText,
  Shield,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

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

/** The tile pictures, from public/isle/art (scripts/build-isle-art.mjs). */
const ART = artAt('/isle/art');

/** Dark carved wood with a fine grain and a gold hairline inside its edge. */
const WOOD =
  'bg-[linear-gradient(180deg,rgba(255,220,170,0.07),transparent_40%),repeating-linear-gradient(97deg,rgba(255,235,200,0.035)_0_2px,transparent_2px_9px),linear-gradient(180deg,#6B4527,#3F2615)] border border-[#2A180B] shadow-[0_12px_26px_-10px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(232,184,74,0.35),inset_0_1px_0_rgba(255,230,190,0.3)]';
/** Old paper: warm in the middle, darker towards its edges, in a gold-edged wooden border. */
const PARCHMENT =
  'bg-[radial-gradient(ellipse_at_center,#FFF7E2_0%,#F6E6C0_60%,#E6CE98_100%)] border-[3px] border-[#8A6420] text-[#3B2A1E] shadow-[0_22px_48px_-16px_rgba(0,0,0,0.7),inset_0_0_0_2px_#F6DE9C,inset_0_0_30px_rgba(150,100,40,0.25)]';

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
  const [problem, setProblem] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [top, setTop] = useState(false);
  const api = useRef<IsleBoardApi | null>(null);

  useEffect(() => {
    if (live !== mode) setMode(live);
  }, [live, mode]);
  useEffect(() => {
    if (!problem) return;
    const t = setTimeout(() => setProblem(null), 2600);
    return () => clearTimeout(t);
  }, [problem]);


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
      if (why) setProblem(why);
      return !why;
    },
    [onMove, sound],
  );

  const onReady = useCallback((a: IsleBoardApi) => {
    api.current = a;
  }, []);

  const tap = (ndcX: number, ndcY: number) => {
    const at = api.current?.pick(ndcX, ndcY);
    if (!at || !view.marks) return;
    const r = tapBoard(state, me, live, pickMark(view.marks, at.x, at.y));
    if (r.action) move(r.action);
    if (r.mode) setMode(r.mode);
  };

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-[#A9D8E8] font-sans">
      <BoardSurface api={api} onTap={tap}>
        <Canvas shadows={quality !== 'low'} dpr={[1, 2]} camera={{ fov: 45, near: 0.1, far: 120 }} resize={{ debounce: 0 }} style={{ pointerEvents: 'none' }}>
          <IsleBoard state={state} marks={view.marks} quality={quality} onReady={onReady} art={ART} />
        </Canvas>
      </BoardSurface>

      {/* Top: leave, the log, and what's happening. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex gap-2">
          {onExit ? (
            <RoundButton label="Leave the table" onClick={onExit}>
              <ChevronLeft size={22} />
            </RoundButton>
          ) : null}
          <RoundButton label="Game log" onClick={() => setShowLog((v) => !v)} active={showLog}>
            <ScrollText size={20} />
          </RoundButton>
          <RoundButton label={top ? 'Tilted view' : 'Top view'} onClick={() => setTop(api.current?.toggleTop() === 'top')} active={top}>
            {top ? <Rotate3d size={20} /> : <MapIcon size={20} />}
          </RoundButton>
          {onToggleSound ? (
            <RoundButton label={muted ? 'Sound on' : 'Sound off'} onClick={onToggleSound}>
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </RoundButton>
          ) : null}
          {onToggleMusic && !muted ? (
            <RoundButton label={music ? 'Music off' : 'Music on'} onClick={onToggleMusic} active={music}>
              <Music size={19} className={music ? '' : 'opacity-40'} />
            </RoundButton>
          ) : null}
        </div>
        <Prompt view={view} thinking={botThinking != null ? state.players[botThinking]!.name : null} />
        <div className="w-[236px]" />
      </div>

      <Seats seats={view.seats} thinking={botThinking} />

      {showLog ? <Log state={state} me={me} onClose={() => setShowLog(false)} /> : null}

      {/* Bottom: build bar, hand, actions. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
        <BuildBar
          view={view}
          mode={live}
          onPick={(what) => {
            if (what === 'dev') move({ t: 'buy' });
            else setMode(live.k === 'build' && live.what === what ? IDLE : { k: 'build', what });
          }}
        />
        <HandRow
          view={view}
          state={state}
          me={me}
          onPlay={(card) => {
            if (card === 'knight') move({ t: 'knight' });
            else if (card === 'roads') move({ t: 'roads' });
            else if (card === 'plenty') setMode({ k: 'plenty' });
            else if (card === 'monopoly') setMode({ k: 'monopoly' });
          }}
        />
        <Actions
          view={view}
          onRoll={() => move({ t: 'roll' })}
          onEnd={() => move({ t: 'end' })}
          onTrade={() => setMode(live.k === 'trade' ? IDLE : { k: 'trade' })}
          trading={live.k === 'trade'}
        />
      </div>

      {/* Panels over the board. */}
      {view.discard > 0 ? <DiscardPanel hand={view.hand} owed={view.discard} onDone={(cards) => move({ t: 'discard', cards })} /> : null}
      {live.k === 'steal' ? (
        <StealPanel
          state={state}
          me={me}
          from={live.from}
          onPick={(from) => move({ t: 'robber', h: live.h, from }) && setMode(IDLE)}
          onCancel={() => setMode(IDLE)}
        />
      ) : null}
      {live.k === 'plenty' ? (
        <PickPanel
          title={DEV_INFO.plenty.label}
          text="Choose two cards from the bank."
          count={2}
          onCancel={() => setMode(IDLE)}
          onDone={([a, b]) => move({ t: 'plenty', a: a!, b: b! }) && setMode(IDLE)}
        />
      ) : null}
      {live.k === 'monopoly' ? (
        <PickPanel
          title={DEV_INFO.monopoly.label}
          text="Name a card. Everyone gives you all of theirs."
          count={1}
          onCancel={() => setMode(IDLE)}
          onDone={([r]) => move({ t: 'monopoly', r: r! }) && setMode(IDLE)}
        />
      ) : null}
      {live.k === 'trade' || view.outgoing ? (
        <TradePanel state={state} view={view} onMove={move} onClose={() => (view.outgoing ? move({ t: 'cancel' }) : setMode(IDLE))} />
      ) : null}
      {view.incoming ? <Incoming state={state} view={view} onAnswer={(yes) => move({ t: 'reply', yes })} /> : null}
      {view.over ? <Results state={state} view={view} onNewGame={onNewGame} onExit={onExit} /> : null}

      <GainChips state={state} me={me} />

      {problem ? (
        <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-[#2A1A10]/90 px-4 py-2 text-[14px] font-medium text-[#FBEFD5] shadow-lg">
          {problem}
        </div>
      ) : null}
    </div>
  );
}

// ---- The board's surface: taps, drags, wheel and pinch -------------------------------

function BoardSurface({ api, onTap, children }: { api: React.RefObject<IsleBoardApi | null>; onTap: (x: number, y: number) => void; children: ReactNode }) {
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
      onWheel={(e) => api.current?.zoomBy(e.deltaY > 0 ? 1.08 : 0.92)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: Date.now() });
        pinch.current = null;
      }}
      onPointerMove={(e) => {
        const p = pointers.current.get(e.pointerId);
        if (!p) return;
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

// ---- Small pieces ------------------------------------------------------------------

export function ResIcon({ r, size = 20, className }: { r: Res; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path d={RES_INFO[r].icon} fill="currentColor" />
    </svg>
  );
}

function RoundButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full text-[#FBEFD5] transition active:scale-95',
        WOOD,
        active && 'ring-2 ring-[#E8B84A]',
      )}
    >
      {children}
    </button>
  );
}

/** A card: its picture (scripts/blender/build_isle_art.py) in a cream-and-gold frame, its name on a band of its colour. */
function ArtCard({
  art,
  label,
  band,
  n,
  dim,
  size = 'md',
  onClick,
  picked,
  glow,
  title,
  disabled,
}: {
  art: string;
  label: string;
  band: string;
  n?: number;
  dim?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
  picked?: boolean;
  glow?: boolean;
  title?: string;
  disabled?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'relative shrink-0 rounded-[11px] bg-gradient-to-b from-[#FFF6DD] via-[#F1DDAE] to-[#D9B979] p-[3px] transition duration-200',
        size === 'sm' ? 'h-[70px] w-[50px]' : 'h-[104px] w-[74px]',
        dim ? 'opacity-35 saturate-50' : 'shadow-[0_10px_18px_-8px_rgba(0,0,0,0.75)]',
        onClick && !disabled && 'hover:-translate-y-1.5 hover:shadow-[0_16px_24px_-10px_rgba(0,0,0,0.8)] active:scale-95',
        picked && '-translate-y-2 ring-2 ring-[#E8B84A]',
        glow && 'shadow-[0_0_0_2px_#E8B84A,0_0_18px_2px_rgba(232,184,74,0.75)]',
      )}
    >
      <span className="relative block h-full w-full overflow-hidden rounded-[8px] ring-1 ring-[#A98142]/70">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute inset-0 shadow-[inset_0_0_10px_rgba(60,35,10,0.45)]" />
        <span
          className={cn('absolute inset-x-0 bottom-0 flex items-end justify-center pb-[3px] pt-3 font-serif font-bold tracking-wide text-white', size === 'sm' ? 'text-[8.5px]' : 'text-[11px]')}
          style={{ background: `linear-gradient(to bottom, transparent, ${band}E6 45%, ${band})`, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
        >
          {label}
        </span>
      </span>
      {n != null && n > 0 ? <Coin n={n} small={size === 'sm'} /> : null}
    </Tag>
  );
}

/** A gold coin with a count on it, pinned to a card's corner. */
function Coin({ n, small }: { n: number; small?: boolean }) {
  return (
    <span
      className={cn(
        'absolute -right-2 -top-2 flex items-center justify-center rounded-full border-2 border-[#FFF3CF] bg-[radial-gradient(circle_at_35%_30%,#FCE39A,#E0A93A_60%,#B57E1E)] font-serif font-bold text-[#3B2A1E] shadow-[0_2px_4px_rgba(0,0,0,0.45)]',
        small ? 'h-5 min-w-5 px-1 text-[11px]' : 'h-7 min-w-7 px-1 text-[14px]',
      )}
    >
      {n}
    </span>
  );
}

const resArt = (r: Res) => `/isle/art/card_${r}.jpg`;
const devArt = (d: Dev) => `/isle/art/dev_${d}.jpg`;

/** A resource card. */
function ResCard({ r, n, dim, small, onClick, picked }: { r: Res; n?: number; dim?: boolean; small?: boolean; onClick?: () => void; picked?: boolean }) {
  const info = RES_INFO[r];
  return <ArtCard art={resArt(r)} label={info.label} band={info.dark} n={n} dim={dim} size={small ? 'sm' : 'md'} onClick={onClick} picked={picked} title={info.label} />;
}

/** What something costs: a little picture of each card it takes. */
function Cost({ cost, size = 14 }: { cost: Partial<Hand>; size?: number }) {
  return (
    <span className="flex items-center gap-[3px]">
      {RESOURCES.flatMap((r) =>
        Array.from({ length: cost[r] ?? 0 }, (_, i) => (
          <span
            key={`${r}${i}`}
            title={RES_INFO[r].label}
            className="relative overflow-hidden rounded-[3px] ring-1 ring-[#F1DDAE]/90 shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
            style={{ width: size + 2, height: size + 8 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resArt(r)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
          </span>
        )),
      )}
    </span>
  );
}

// ---- The line at the top -------------------------------------------------------------

function Prompt({ view, thinking }: { view: TableView; thinking: string | null }) {
  const mine = view.marks || view.canRoll || view.canEnd || view.discard > 0 || view.incoming;
  return (
    <div
      className={cn(
        'pointer-events-none mt-1 flex items-center gap-2 rounded-[10px] border-2 px-6 py-2 font-serif text-[16px] font-bold tracking-wide',
        mine
          ? 'border-[#8A6420] bg-gradient-to-b from-[#FCE6A2] to-[#E3B24A] text-[#3B2A1E] shadow-[0_10px_24px_-8px_rgba(232,184,74,0.9),inset_0_0_0_1px_#FFF3CF]'
          : 'border-[#2A180B] bg-gradient-to-b from-[#4A2E18]/95 to-[#2E1C0E]/95 text-[#FBEFD5] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(232,184,74,0.35)]',
      )}
    >
      {thinking ? <Bot size={16} /> : null}
      <span>{view.prompt}</span>
      {thinking ? <Dots /> : null}
    </div>
  );
}

function Dots() {
  return (
    <span className="ml-0.5 flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

// ---- The seats -----------------------------------------------------------------------

function Seats({ seats, thinking }: { seats: SeatView[]; thinking: number | null }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 flex w-[236px] flex-col gap-2">
      {seats.map((s) => (
        <SeatPanel key={s.seat} s={s} thinking={thinking === s.seat} />
      ))}
    </div>
  );
}

function SeatPanel({ s, thinking }: { s: SeatView; thinking: boolean }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[16px] py-2 pl-2 pr-3 text-[#FBEFD5] transition-all duration-300',
        WOOD,
        s.turn && 'translate-x-[-6px] shadow-[0_0_0_2px_#E8B84A,0_0_26px_-2px_rgba(232,184,74,0.85)]',
      )}
    >
      <div className="flex items-center gap-2.5">
        {/* A medallion in their colour with a gold rim. */}
        <span className="rounded-full bg-gradient-to-b from-[#F6DE9C] via-[#C99A42] to-[#8A6420] p-[2px] shadow-[0_3px_6px_rgba(0,0,0,0.5)]">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full font-serif text-[17px] font-bold shadow-[inset_0_2px_3px_rgba(255,255,255,0.35),inset_0_-3px_5px_rgba(0,0,0,0.3)]"
            style={{ background: `radial-gradient(circle at 35% 30%, ${s.color}, ${s.color} 45%, #00000055)`, color: s.color === '#EFE8D8' ? '#3B2A1E' : '#fff' }}
          >
            {s.bot ? <Bot size={19} /> : s.real.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate font-serif text-[15px] font-bold tracking-wide">
            {s.name}
            {thinking ? <Dots /> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5 text-[12px] text-[#FBEFD5]/75">
            <Stat icon={<Layers size={12} />} n={s.cards} hot={s.cards > 7} title="Cards in hand" />
            <Stat icon={<Sparkles size={12} />} n={s.dev} title="Development cards" />
            <Stat icon={<Shield size={12} />} n={s.knights} gold={s.army} title="Knights played" />
            <Stat icon={<Route size={12} />} n={s.road} gold={s.longest} title="Longest road" />
          </div>
        </div>
        {/* Points on a small gold shield. */}
        <span className="relative flex h-11 w-10 flex-col items-center justify-center">
          <span className="absolute inset-0 bg-gradient-to-b from-[#F6DE9C] via-[#D9A846] to-[#9A6E22] [clip-path:polygon(0_0,100%_0,100%_62%,50%_100%,0_62%)]" />
          <span className="absolute inset-[2px] bg-gradient-to-b from-[#4A2E18] to-[#2E1C0E] [clip-path:polygon(0_0,100%_0,100%_62%,50%_100%,0_62%)]" />
          <span className="relative -mt-1 font-serif text-[20px] font-bold leading-none text-[#F4D27A]">{s.points}</span>
        </span>
      </div>
      {s.longest || s.army ? (
        <div className="mt-1.5 flex gap-1.5 pl-[52px]">
          {s.longest ? <Badge icon={<Route size={11} />} text="Longest road" /> : null}
          {s.army ? <Badge icon={<Shield size={11} />} text="Largest army" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ icon, n, hot, gold, title }: { icon: ReactNode; n: number; hot?: boolean; gold?: boolean; title: string }) {
  return (
    <span title={title} className={cn('flex items-center gap-0.5', hot && 'font-bold text-[#FF9B7A]', gold && 'font-bold text-[#F4D27A]')}>
      {icon}
      {n}
    </span>
  );
}

function Badge({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-gradient-to-b from-[#F6DE9C] to-[#D9A846] px-2 py-0.5 font-serif text-[10px] font-bold text-[#3B2A1E] shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
      {icon}
      {text} +2
    </span>
  );
}

// ---- Build bar, hand, actions ------------------------------------------------------------

const BUILD_ICON = { road: Route, settle: House, city: Castle, dev: Sparkles } as const;

function BuildBar({ view, mode, onPick }: { view: TableView; mode: Mode; onPick: (what: 'road' | 'settle' | 'city' | 'dev') => void }) {
  return (
    <div className={cn('pointer-events-auto flex flex-col gap-1 rounded-[18px] p-2', WOOD)}>
      <span className="px-1 font-serif text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8B84A]/80">Build</span>
      {view.build.map((b) => {
        const Icon = BUILD_ICON[b.what];
        const on = mode.k === 'build' && mode.what === b.what;
        return (
          <button
            key={b.what}
            type="button"
            disabled={!b.ok}
            onClick={() => onPick(b.what)}
            className={cn(
              'flex items-center gap-2 rounded-[12px] px-2 py-1.5 text-left text-[#FBEFD5] transition',
              b.ok ? 'bg-white/10 hover:bg-white/20 active:scale-[0.98]' : 'opacity-45',
              on && 'bg-[#E8B84A] text-[#3B2A1E] hover:bg-[#E8B84A]',
            )}
          >
            <Icon size={18} />
            <span className="w-12 font-serif text-[14px] font-bold">{b.label}</span>
            <Cost cost={b.cost} />
            <span className="ml-auto pl-1 text-[10px] opacity-60">{b.left}</span>
          </button>
        );
      })}
    </div>
  );
}

function HandRow({ view, onPlay }: { view: TableView; state: IsleState; me: number; onPlay: (card: Dev) => void }) {
  const [bump, setBump] = useState<Partial<Record<Res, number>>>({});
  const last = useRef(view.hand);
  useEffect(() => {
    const up: Partial<Record<Res, number>> = {};
    for (const r of RESOURCES) if (view.hand[r] > last.current[r]) up[r] = Date.now();
    last.current = view.hand;
    if (Object.keys(up).length) setBump((b) => ({ ...b, ...up }));
  }, [view.hand]);
  const held = RESOURCES.filter((r) => view.hand[r] > 0);
  return (
    <div className="pointer-events-auto flex items-end gap-3">
      <div className={cn('flex min-h-[124px] items-end gap-3 rounded-[22px] px-4 pb-3 pt-4', WOOD)}>
        {held.length ? (
          held.map((r) => (
            <div key={`${r}${bump[r] ?? ''}`} className={cn('relative isolate', bump[r] && 'animate-[isle-pop_0.5s_ease-out]')}>
              {/* The stack behind: deeper the more of them there are. */}
              {Array.from({ length: Math.min(3, view.hand[r] - 1) }, (_, i) => (
                <span
                  key={i}
                  className="absolute h-[104px] w-[74px] rounded-[11px] bg-gradient-to-b from-[#F1DDAE] to-[#C9A66B] shadow-[0_4px_8px_-4px_rgba(0,0,0,0.6)]"
                  style={{ left: (i + 1) * 4, top: -(i + 1) * 3, zIndex: -1 - i, transform: `rotate(${(i + 1) * 2.5}deg)` }}
                />
              ))}
              <ResCard r={r} n={view.hand[r]} />
            </div>
          ))
        ) : (
          <span className="flex h-[104px] w-[220px] items-center justify-center rounded-[12px] border border-dashed border-[#F1DDAE]/30 font-serif text-[13px] italic text-[#FBEFD5]/55">
            No cards yet
          </span>
        )}
      </div>
      {view.dev.length ? (
        <div className={cn('flex items-end gap-3 rounded-[22px] px-4 pb-3 pt-4', WOOD)}>
          {view.dev.map((d) => (
            <ArtCard
              key={d.card}
              art={devArt(d.card)}
              label={DEV_INFO[d.card].label}
              band="#4B2E78"
              n={d.ready + d.fresh}
              onClick={() => onPlay(d.card)}
              disabled={!d.playable}
              dim={!d.playable && d.card !== 'vp'}
              glow={d.playable}
              title={`${DEV_INFO[d.card].label}: ${DEV_INFO[d.card].text}${d.fresh ? ' (new cards can be played from your next turn)' : ''}`}
            />
          ))}
        </div>
      ) : null}
      <style>{`@keyframes isle-pop { 0% { transform: translateY(0) scale(1) } 35% { transform: translateY(-16px) scale(1.1) } 100% { transform: translateY(0) scale(1) } }`}</style>
    </div>
  );
}

/** A round wooden button with a gold rim, like a turned medallion. */
function Medallion({
  label,
  text,
  onClick,
  disabled,
  big,
  tone = 'wood',
  active,
  pulse,
  children,
}: {
  label: string;
  text: string;
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
  tone?: 'wood' | 'gold' | 'green';
  active?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  const face = {
    wood: 'bg-[radial-gradient(circle_at_35%_28%,#8A5C35,#5A3820_55%,#3A2313)] text-[#FBEFD5]',
    gold: 'bg-[radial-gradient(circle_at_35%_28%,#FCE39A,#E3AE3F_55%,#A8721A)] text-[#3B2A1E]',
    green: 'bg-[radial-gradient(circle_at_35%_28%,#8DC77E,#4D8C43_55%,#2C5A25)] text-white',
  }[tone];
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center justify-center rounded-full p-[3px] transition active:scale-95 disabled:opacity-40',
        'bg-gradient-to-b from-[#F6DE9C] via-[#C99A42] to-[#8A6420] shadow-[0_12px_24px_-10px_rgba(0,0,0,0.75)]',
        big ? 'h-[84px] w-[84px]' : 'h-[58px] w-[58px]',
        active && 'ring-2 ring-[#FFF3CF]',
        pulse && 'animate-[isle-glow_1.6s_ease-in-out_infinite]',
      )}
    >
      <span className={cn('flex h-full w-full flex-col items-center justify-center rounded-full shadow-[inset_0_2px_3px_rgba(255,255,255,0.25),inset_0_-3px_6px_rgba(0,0,0,0.35)]', face)}>
        {children}
        <span className={cn('font-serif font-bold', big ? 'text-[11px]' : 'text-[9px]')}>{text}</span>
      </span>
    </button>
  );
}

function Actions({ view, onRoll, onEnd, onTrade, trading }: { view: TableView; onRoll: () => void; onEnd: () => void; onTrade: () => void; trading: boolean }) {
  return (
    <div className="pointer-events-auto flex items-end gap-3">
      <Medallion label="Trade" text="Trade" onClick={onTrade} disabled={!view.canTrade} active={trading}>
        <ArrowLeftRight size={20} />
      </Medallion>
      {view.canRoll ? (
        <Medallion label="Roll the dice" text="Roll" onClick={onRoll} big tone="gold" pulse>
          <Dice5 size={32} />
        </Medallion>
      ) : (
        <Medallion label="End your turn" text="End turn" onClick={onEnd} disabled={!view.canEnd} big tone={view.canEnd ? 'green' : 'wood'}>
          <Hourglass size={26} />
        </Medallion>
      )}
      <style>{`@keyframes isle-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(246,207,98,0.0), 0 12px 24px -10px rgba(0,0,0,0.75) } 50% { box-shadow: 0 0 0 12px rgba(246,207,98,0.35), 0 12px 24px -10px rgba(0,0,0,0.75) } }`}</style>
    </div>
  );
}

// ---- Panels ---------------------------------------------------------------------------

function Panel({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25 p-4">
      <div className={cn('relative max-h-full overflow-auto rounded-[24px] p-5', PARCHMENT, wide ? 'w-[620px]' : 'w-[420px]')}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-[22px] font-bold">{title}</h2>
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-black/5">
              <X size={20} />
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function GoldButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-full border-2 border-[#FFF6E0] bg-gradient-to-b from-[#F6CF62] to-[#C88E1E] px-5 py-2.5 text-[15px] font-bold text-[#3B2A1E] shadow transition active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Picks cards from a pile with +/- per kind. */
function Counter({ value, onChange, max }: { value: Partial<Hand>; onChange: (h: Partial<Hand>) => void; max?: Hand }) {
  return (
    <div className="flex gap-2">
      {RESOURCES.map((r) => {
        const n = value[r] ?? 0;
        const top = max ? max[r] : 19;
        return (
          <div key={r} className="flex flex-col items-center gap-1">
            <ResCard r={r} n={n} small dim={max ? !max[r] : false} onClick={n < top ? () => onChange({ ...value, [r]: n + 1 }) : undefined} />
            <button
              type="button"
              disabled={!n}
              onClick={() => onChange({ ...value, [r]: n - 1 })}
              className="rounded-full bg-black/10 p-0.5 disabled:opacity-30"
              aria-label={`One less ${RES_INFO[r].label}`}
            >
              <Minus size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const count = (h: Partial<Hand>) => RESOURCES.reduce((n, r) => n + (h[r] ?? 0), 0);

function DiscardPanel({ hand, owed, onDone }: { hand: Hand; owed: number; onDone: (cards: Partial<Hand>) => void }) {
  const [pick, setPick] = useState<Partial<Hand>>({});
  const n = count(pick);
  return (
    <Panel title="A 7 was rolled">
      <p className="mb-3 text-[14px]">
        You have more than 7 cards. Choose {owed} to give back ({n} of {owed}).
      </p>
      <Counter value={pick} onChange={(h) => count(h) <= owed && setPick(h)} max={hand} />
      <div className="mt-4 flex justify-end">
        <GoldButton disabled={n !== owed} onClick={() => onDone(pick)}>
          Give back {owed}
        </GoldButton>
      </div>
    </Panel>
  );
}

function StealPanel({ state, me, from, onPick, onCancel }: { state: IsleState; me: number; from: number[]; onPick: (p: number) => void; onCancel: () => void }) {
  const view = tableView(state, me);
  return (
    <Panel title="Take a card from…" onClose={onCancel}>
      <div className="flex flex-col gap-2">
        {from.map((p) => {
          const s = view.seats[p]!;
          return (
            <button key={p} type="button" onClick={() => onPick(p)} className="flex items-center gap-3 rounded-[14px] bg-white/60 p-2.5 text-left hover:bg-white">
              <span className="h-8 w-8 rounded-full border-2 border-white" style={{ background: s.color }} />
              <span className="flex-1 text-[15px] font-semibold">{s.name}</span>
              <span className="flex items-center gap-1 text-[13px]">
                <Layers size={14} /> {s.cards} cards
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function PickPanel({ title, text, count: n, onDone, onCancel }: { title: string; text: string; count: number; onDone: (r: Res[]) => void; onCancel: () => void }) {
  const [pick, setPick] = useState<Res[]>([]);
  return (
    <Panel title={title} onClose={onCancel}>
      <p className="mb-3 text-[14px]">{text}</p>
      <div className="flex gap-2">
        {RESOURCES.map((r) => (
          <ResCard
            key={r}
            r={r}
            n={pick.filter((x) => x === r).length}
            onClick={() => setPick((p) => (p.length >= n ? [...p.slice(1), r] : [...p, r]))}
            picked={pick.includes(r)}
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <GoldButton disabled={pick.length !== n} onClick={() => onDone(pick)}>
          Play card
        </GoldButton>
      </div>
    </Panel>
  );
}

function TradePanel({ state, view, onMove, onClose }: { state: IsleState; view: TableView; onMove: (a: IsleAction) => boolean; onClose: () => void }) {
  const [give, setGive] = useState<Partial<Hand>>({});
  const [want, setWant] = useState<Partial<Hand>>({});
  const out = view.outgoing;
  if (out) {
    return (
      <Panel title="Your offer" onClose={onClose}>
        <OfferLine give={out.give} want={out.want} />
        <div className="mt-4 flex flex-col gap-2">
          {view.seats
            .filter((s) => !s.you)
            .map((s) => {
              const r = out.replies[s.seat];
              return (
                <div key={s.seat} className="flex items-center gap-3 rounded-[14px] bg-white/60 p-2.5">
                  <span className="h-7 w-7 rounded-full border-2 border-white" style={{ background: s.color }} />
                  <span className="flex-1 text-[15px] font-semibold">{s.name}</span>
                  {r === null ? (
                    <span className="flex items-center gap-1 text-[13px] text-black/50">
                      thinking <Dots />
                    </span>
                  ) : r ? (
                    <GoldButton onClick={() => onMove({ t: 'accept', with: s.seat })}>
                      <Check size={16} /> Trade
                    </GoldButton>
                  ) : (
                    <span className="text-[13px] text-black/50">No thanks</span>
                  )}
                </div>
              );
            })}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="text-[14px] font-semibold underline">
            Take the offer back
          </button>
        </div>
      </Panel>
    );
  }
  const bankGive = RESOURCES.find((r) => (give[r] ?? 0) > 0 && count(give) === view.rates[r] && give[r] === view.rates[r]);
  const bankWant = count(want) === 1 ? RESOURCES.find((r) => want[r]) : undefined;
  return (
    <Panel title="Trade" onClose={onClose} wide>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
        <span className="text-[13px] font-semibold uppercase tracking-wider text-black/50">You give</span>
        <span />
        <Counter value={give} onChange={setGive} max={view.hand} />
        <span />
        <span className="mt-2 text-[13px] font-semibold uppercase tracking-wider text-black/50">You get</span>
        <span />
        <Counter value={want} onChange={setWant} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-black/60">
        Bank rates:
        {RESOURCES.map((r) => (
          <span key={r} className="flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5">
            <ResIcon r={r} size={12} />
            {view.rates[r]}:1
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={!bankGive || !bankWant || bankGive === bankWant || state.bank[bankWant] < 1}
          onClick={() => bankGive && bankWant && onMove({ t: 'bank', give: bankGive, get: bankWant }) && (setGive({}), setWant({}))}
          className="rounded-full border-2 border-[#8A5E36] px-4 py-2 text-[14px] font-bold text-[#5A3A22] disabled:opacity-35"
        >
          Trade with the bank
        </button>
        <GoldButton disabled={!count(give) || !count(want)} onClick={() => onMove({ t: 'offer', give, want })}>
          <ArrowLeftRight size={16} /> Offer to everyone
        </GoldButton>
      </div>
    </Panel>
  );
}

function OfferLine({ give, want }: { give: Partial<Hand>; want: Partial<Hand> }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Cards h={give} />
      <ArrowLeftRight size={22} className="text-[#8A5E36]" />
      <Cards h={want} />
    </div>
  );
}

function Cards({ h }: { h: Partial<Hand> }) {
  return (
    <div className="flex gap-1.5">
      {RESOURCES.filter((r) => h[r]).map((r) => (
        <ResCard key={r} r={r} n={h[r]} small />
      ))}
    </div>
  );
}

function Incoming({ state, view, onAnswer }: { state: IsleState; view: TableView; onAnswer: (yes: boolean) => void }) {
  const o = view.incoming!;
  return (
    <div className="absolute left-1/2 top-16 z-10 w-[420px] -translate-x-1/2">
      <div className={cn('rounded-[22px] p-4', PARCHMENT)}>
        <div className="mb-2 text-center text-[15px] font-semibold">{state.players[o.from]!.name} offers a trade</div>
        <div className="flex items-center justify-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[11px] uppercase tracking-wider text-black/50">You get</span>
            <Cards h={o.give} />
          </div>
          <ArrowLeftRight size={20} className="text-[#8A5E36]" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[11px] uppercase tracking-wider text-black/50">You give</span>
            <Cards h={o.want} />
          </div>
        </div>
        <div className="mt-3 flex justify-center gap-3">
          <button type="button" onClick={() => onAnswer(false)} className="rounded-full border-2 border-[#8A5E36] px-5 py-2 text-[14px] font-bold text-[#5A3A22]">
            No thanks
          </button>
          <GoldButton disabled={!o.canAccept} onClick={() => onAnswer(true)}>
            <Check size={16} /> Accept
          </GoldButton>
        </div>
      </div>
    </div>
  );
}

function Results({ state, view, onNewGame, onExit }: { state: IsleState; view: TableView; onNewGame?: () => void; onExit?: () => void }) {
  const order = [...view.seats].sort((a, b) => b.points - a.points);
  const won = view.winner === view.me;
  const rolls = state.rolls.slice(2);
  const most = Math.max(1, ...rolls);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className={cn('w-[640px] rounded-[28px] p-6', PARCHMENT)}>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#F6CF62] to-[#C88E1E] text-[#3B2A1E] shadow">
            {won ? <Trophy size={28} /> : <Crown size={28} />}
          </span>
          <div>
            <h2 className="font-serif text-[28px] font-bold leading-tight">{won ? 'You won the island!' : `${view.seats[view.winner!]!.name} won`}</h2>
            <p className="text-[14px] text-black/60">After {Math.ceil(state.turnNo / 4)} rounds</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-[1fr_200px] gap-5">
          <div className="flex flex-col gap-2">
            {order.map((s, i) => (
              <div key={s.seat} className={cn('flex items-center gap-3 rounded-[14px] p-2.5', i === 0 ? 'bg-[#F6CF62]/50' : 'bg-white/50')}>
                <span className="w-5 text-center font-serif text-[18px] font-bold">{i + 1}</span>
                <span className="h-7 w-7 rounded-full border-2 border-white" style={{ background: s.color }} />
                <span className="flex-1 text-[15px] font-semibold">{s.name}</span>
                <span className="text-[12px] text-black/50">{state.players[s.seat]!.got} cards</span>
                <span className="w-10 text-right font-serif text-[20px] font-bold">{s.points}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-black/50">Dice this game</div>
            <div className="flex h-28 items-end gap-1">
              {rolls.map((n, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                  <div className="w-full rounded-t-[3px] bg-[#8A5E36]" style={{ height: `${(n / most) * 88}px` }} />
                  <span className="text-[9px] text-black/60">{i + 2}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          {onExit ? (
            <button type="button" onClick={onExit} className="rounded-full border-2 border-[#8A5E36] px-5 py-2.5 text-[15px] font-bold text-[#5A3A22]">
              Leave
            </button>
          ) : null}
          {onNewGame ? (
            <GoldButton onClick={onNewGame}>
              <Plus size={16} /> Play again
            </GoldButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Log({ state, me, onClose }: { state: IsleState; me: number; onClose: () => void }) {
  const lines = logLines(state, me).slice(-16);
  return (
    <div className={cn('absolute left-3 top-16 z-[5] w-[300px] rounded-[18px] p-3 text-[#FBEFD5]', WOOD)}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FBEFD5]/60">Game log</span>
        <button type="button" onClick={onClose} aria-label="Close the log" className="rounded-full p-1 hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-1 overflow-auto">
        {lines.map((l) => (
          <div key={l.n} className="flex items-start gap-2 text-[13px] leading-snug">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: l.p != null ? tableView(state, me).seats[l.p]?.color : '#E8B84A' }} />
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "+2 wood" floating up over my hand when cards come in. */
function GainChips({ state, me }: { state: IsleState; me: number }) {
  const seen = useRef(state.n);
  const [chips, setChips] = useState<{ id: string; r: Res; n: number }[]>([]);
  useEffect(() => {
    const first = state.n - state.log.length + 1;
    const fresh = state.log.filter((e, i) => first + i > seen.current && e.k === 'gain' && e.p === me);
    seen.current = state.n;
    if (!fresh.length) return;
    const add = fresh.flatMap((e, i) =>
      e.k === 'gain' ? RESOURCES.filter((r) => e.cards[r]).map((r) => ({ id: `${state.n}-${i}-${r}`, r, n: e.cards[r]! })) : [],
    );
    setChips((c) => [...c, ...add]);
    const t = setTimeout(() => setChips((c) => c.filter((x) => !add.includes(x))), 1800);
    return () => clearTimeout(t);
  }, [state, me]);
  if (!chips.length) return null;
  return (
    <div className="pointer-events-none absolute bottom-36 left-1/2 flex -translate-x-1/2 gap-2">
      {chips.map((c) => (
        <span
          key={c.id}
          className="flex animate-[isle-rise_1.8s_ease-out_forwards] items-center gap-1 rounded-full border-2 border-white px-2.5 py-1 text-[14px] font-bold text-white shadow-lg"
          style={{ background: RES_INFO[c.r].color }}
        >
          +{c.n} <ResIcon r={c.r} size={16} />
        </span>
      ))}
      <style>{`@keyframes isle-rise { 0% { opacity: 0; transform: translateY(20px) scale(0.8) } 15% { opacity: 1; transform: translateY(0) scale(1.05) } 80% { opacity: 1 } 100% { opacity: 0; transform: translateY(-40px) } }`}</style>
    </div>
  );
}

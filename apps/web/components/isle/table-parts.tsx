'use client';

/**
 * The fixed parts of Isle's table around the board: the bar along the top
 * (whose turn, points, the round, the view and sound switches), the players
 * down the left, the build and trade actions down the right with the bank,
 * and along the bottom the dice, my resource cards and my development cards.
 */
import {
  DEV_INFO,
  lastRoll,
  RES_INFO,
  type BuildOption,
  type Dev,
  type IsleState,
  type Mode,
  type Res,
  type SeatView,
  type TableView,
} from '@us/shared/isle';
import {
  ArrowLeftRight,
  Castle,
  ChevronLeft,
  Dice5,
  Hammer,
  Hourglass,
  House,
  Landmark,
  Layers,
  Map as MapIcon,
  Music,
  Rotate3d,
  Route,
  ScrollText,
  Shield,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Avatar, CAPTION, CardBack, CostChips, DevCard, Dots, PointsShield, ResCard, RoundButton, WOOD } from './kit';

/** The dock shows the cards in this order. */
export const HAND_ORDER: Res[] = ['brick', 'wood', 'wool', 'grain', 'ore'];

// ---- Top bar ---------------------------------------------------------------------------

export function TopBar({
  ui,
  compact,
  drawer,
  onDrawer,
  view,
  state,
  thinking,
  top,
  muted,
  music,
  showLog,
  onExit,
  onLog,
  onTop,
  onToggleSound,
  onToggleMusic,
}: {
  ui: number;
  compact: boolean;
  drawer: 'players' | 'build' | null;
  onDrawer: (d: 'players' | 'build') => void;
  view: TableView;
  state: IsleState;
  thinking: number | null;
  top: boolean;
  muted: boolean;
  music: boolean;
  showLog: boolean;
  onExit?: () => void;
  onLog: () => void;
  onTop: () => void;
  onToggleSound?: () => void;
  onToggleMusic?: () => void;
}) {
  const active = view.seats.find((s) => s.turn) ?? view.seats[state.turn]!;
  const mine = !!(view.marks || view.canRoll || view.canEnd || view.discard > 0 || view.incoming);
  const round = state.phase === 'setup' ? 'Opening' : `Round ${Math.max(1, Math.ceil(view.turnNo / 4))}`;
  return (
    <div
      className={cn('pointer-events-none absolute left-0 top-0 z-20 flex items-center justify-between gap-3 px-3', compact ? 'flex-wrap gap-y-2 pt-2.5' : 'h-[64px]')}
      style={{ zoom: ui, width: typeof window === 'undefined' ? '100%' : window.innerWidth / ui }}
    >
      <div className="pointer-events-auto flex gap-2">
        {onExit ? (
          <RoundButton label="Leave the table" onClick={onExit}>
            <ChevronLeft size={21} />
          </RoundButton>
        ) : null}
        <RoundButton label="Game log" onClick={onLog} active={showLog}>
          <ScrollText size={18} />
        </RoundButton>
        {compact ? (
          <RoundButton label="Players" onClick={() => onDrawer('players')} active={drawer === 'players'}>
            <Users size={18} />
          </RoundButton>
        ) : null}
      </div>

      {/* Whose turn: their medallion, name and points, the round, and what's happening. */}
      <div
        className={cn(
          'pointer-events-auto flex min-w-0 max-w-[680px] shrink items-center gap-3 rounded-[14px] py-1.5 pl-1.5 pr-4 transition-all duration-500',
          compact && 'order-last w-full max-w-none',
          WOOD,
          active.you && state.phase !== 'over' && 'shadow-[0_0_0_2px_#E8B84A,0_0_26px_-2px_rgba(232,184,74,0.85)]',
        )}
        data-anchor="turn"
      >
        <Avatar s={active} size={38} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#FBEFD5]">
            <span className="truncate font-serif text-[15px] font-bold">{active.you ? 'Your turn' : `${active.name}’s turn`}</span>
            <span className="rounded-full bg-black/25 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-[#E8B84A]">{round}</span>
          </div>
          <div className={cn('flex items-center gap-1 truncate text-[13px]', mine ? 'font-semibold text-[#F6CF62]' : 'text-[#FBEFD5]/75')}>
            {view.prompt}
            {thinking != null ? <Dots /> : null}
          </div>
        </div>
        <PointsShield n={active.points} size="sm" />
      </div>

      <div className="pointer-events-auto flex gap-2">
        {compact ? (
          <RoundButton label="Build and trade" onClick={() => onDrawer('build')} active={drawer === 'build'}>
            <Hammer size={18} />
          </RoundButton>
        ) : null}
        <RoundButton label={top ? 'Tilted view' : 'Top view'} onClick={onTop} active={top}>
          {top ? <Rotate3d size={18} /> : <MapIcon size={18} />}
        </RoundButton>
        {onToggleSound ? (
          <RoundButton label={muted ? 'Sound on' : 'Sound off'} onClick={onToggleSound}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </RoundButton>
        ) : null}
        {onToggleMusic && !muted ? (
          <RoundButton label={music ? 'Music off' : 'Music on'} onClick={onToggleMusic} active={music}>
            <Music size={17} className={music ? '' : 'opacity-40'} />
          </RoundButton>
        ) : null}
      </div>
    </div>
  );
}

// ---- Players ---------------------------------------------------------------------------

export function PlayerPanel({ seats, thinking, goal }: { seats: SeatView[]; thinking: number | null; goal: number }) {
  return (
    <div className={cn('pointer-events-auto flex flex-col gap-1.5 rounded-[14px] p-2', WOOD)}>
      <div className="flex items-center justify-between px-1">
        <span className={CAPTION}>Players</span>
        <span className="text-[10px] text-[#FBEFD5]/55">first to {goal}</span>
      </div>
      {seats.map((s) => (
        <SeatRow key={s.seat} s={s} thinking={thinking === s.seat} />
      ))}
    </div>
  );
}

function SeatRow({ s, thinking }: { s: SeatView; thinking: boolean }) {
  return (
    <div
      data-anchor={`seat-${s.seat}`}
      className={cn(
        'relative rounded-[10px] border py-1.5 pl-1.5 pr-2 text-[#FBEFD5] transition-all duration-300',
        s.turn ? 'border-[#E8B84A] bg-[#E8B84A]/15 shadow-[0_0_18px_-4px_rgba(232,184,74,0.9)]' : 'border-transparent bg-black/15',
      )}
    >
      {/* Their colour down the left edge. */}
      <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full" style={{ background: s.color }} />
      <div className="flex items-center gap-2 pl-1">
        <Avatar s={s} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate font-serif text-[14px] font-bold leading-tight">
            {s.name}
            {thinking ? <Dots /> : s.waiting && !s.turn ? <Hourglass size={11} className="text-[#E8B84A]" /> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#FBEFD5]/75">
            <Stat icon={<Layers size={11} />} n={s.cards} hot={s.cards > 7} title={`${s.cards} resource cards${s.cards > 7 ? ' (over 7: at risk on a 7)' : ''}`} />
            <Stat icon={<Sparkles size={11} />} n={s.dev} title={`${s.dev} development cards`} />
            <Stat icon={<Shield size={11} />} n={s.knights} gold={s.army} title={`${s.knights} knights played`} />
            <Stat icon={<Route size={11} />} n={s.road} gold={s.longest} title={`Longest road: ${s.road}`} />
          </div>
        </div>
        <PointsShield n={s.points} size="sm" />
      </div>
      {s.longest || s.army ? (
        <div className="mt-1 flex flex-wrap gap-1 pl-[42px]">
          {s.longest ? <Badge icon={<Route size={10} />} text="Longest road" /> : null}
          {s.army ? <Badge icon={<Shield size={10} />} text="Largest army" /> : null}
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
    <span className="flex items-center gap-1 rounded-full bg-gradient-to-b from-[#F6DE9C] to-[#D9A846] px-1.5 py-[1px] font-serif text-[9.5px] font-bold text-[#3B2A1E] shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
      {icon}
      {text} +2
    </span>
  );
}

// ---- Actions ---------------------------------------------------------------------------

const BUILD_ICON = { road: Route, settle: House, city: Castle, dev: Sparkles } as const;
const BUILD_NAME = { road: 'Build road', settle: 'Build town', city: 'Upgrade to city', dev: 'Development card' } as const;

export function BuildPanel({
  view,
  state,
  mode,
  onPick,
  onTrade,
  onBank,
}: {
  view: TableView;
  state: IsleState;
  mode: Mode;
  onPick: (what: BuildOption['what']) => void;
  onTrade: () => void;
  onBank: () => void;
}) {
  const best = Math.min(...Object.values(view.rates));
  const tradeWhy = view.canTrade ? null : view.build[0]!.why && !view.build[0]!.why.startsWith('Need') ? view.build[0]!.why : 'No cards to trade';
  return (
    <div className={cn('pointer-events-auto flex flex-col gap-1.5 rounded-[14px] p-2', WOOD)}>
      <span className={cn(CAPTION, 'px-1')}>Build</span>
      {view.build.map((b) => {
        const Icon = BUILD_ICON[b.what];
        const on = mode.k === 'build' && mode.what === b.what;
        return (
          <button
            key={b.what}
            type="button"
            disabled={!b.ok}
            onClick={() => onPick(b.what)}
            title={b.why ?? (on ? 'Tap again to stop' : undefined)}
            className={cn(
              'group flex flex-col gap-1 rounded-[10px] border px-2 py-1.5 text-left text-[#FBEFD5] transition',
              b.ok ? 'border-[#E8B84A]/30 bg-white/10 hover:border-[#E8B84A]/70 hover:bg-white/15 active:scale-[0.98]' : 'cursor-not-allowed border-transparent bg-black/15',
              on && 'border-[#FFF3CF] bg-gradient-to-b from-[#F6CF62] to-[#C88E1E] text-[#3B2A1E] hover:bg-none',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', on ? 'bg-[#3B2A1E]/15' : 'bg-black/25', !b.ok && 'opacity-50')}>
                <Icon size={16} />
              </span>
              <span className={cn('flex-1 font-serif text-[14px] font-bold', !b.ok && 'opacity-60')}>{BUILD_NAME[b.what]}</span>
              <span className={cn('text-[10px]', on ? 'text-[#3B2A1E]/70' : 'text-[#FBEFD5]/50')} title={b.what === 'dev' ? 'Cards left in the deck' : 'Pieces left'}>
                {b.left} left
              </span>
            </span>
            <span className="flex items-center justify-between gap-2 pl-9">
              <CostChips cost={b.cost} missing={b.missing} />
            </span>
            {b.why && !on ? <span className="pl-9 text-[10.5px] leading-tight text-[#FFB59E]/90">{b.why}</span> : null}
            {on ? <span className="pl-9 text-[10.5px] font-semibold leading-tight">Choose a glowing spot on the board</span> : null}
          </button>
        );
      })}

      <span className={cn(CAPTION, 'mt-1 px-1')}>Trade</span>
      <div className="grid grid-cols-2 gap-1.5">
        <TradeButton icon={<ArrowLeftRight size={16} />} label="Players" sub="" onClick={onTrade} disabled={!view.canTrade} why={tradeWhy} />
        <TradeButton icon={<Landmark size={16} />} label="Bank" sub={`Best ${best}:1`} onClick={onBank} disabled={!view.canTrade} why={tradeWhy} />
      </div>

      <Bank state={state} deck={view.deck} />
    </div>
  );
}

function TradeButton({ icon, label, sub, onClick, disabled, why }: { icon: ReactNode; label: string; sub: string; onClick: () => void; disabled: boolean; why: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? (why ?? undefined) : undefined}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-[10px] border px-2 py-2 text-[#FBEFD5] transition',
        disabled ? 'cursor-not-allowed border-transparent bg-black/15 opacity-50' : 'border-[#E8B84A]/30 bg-white/10 hover:border-[#E8B84A]/70 hover:bg-white/15 active:scale-[0.97]',
      )}
    >
      {icon}
      <span className="font-serif text-[13px] font-bold">{label}</span>
      <span className="text-[10px] text-[#FBEFD5]/60">{sub}</span>
    </button>
  );
}

/** What's left in the bank and the development deck. */
function Bank({ state, deck }: { state: IsleState; deck: number }) {
  return (
    <div className="mt-1 rounded-[10px] bg-black/20 p-2" data-anchor="bank">
      <div className="mb-1.5 flex items-center justify-between">
        <span className={CAPTION}>Bank</span>
        <span className="text-[10px] text-[#FBEFD5]/50">cards left</span>
      </div>
      <div className="flex items-end justify-between gap-1">
        {HAND_ORDER.map((r) => (
          <div key={r} className="flex flex-col items-center gap-0.5" title={`${state.bank[r]} ${RES_INFO[r].label.toLowerCase()} in the bank`}>
            <ResCard r={r} size="xs" dim={!state.bank[r]} />
            <span className="text-[10px] font-semibold text-[#FBEFD5]/80">{state.bank[r]}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-0.5" title={`${deck} development cards left`} data-anchor="deck">
          <CardBack size="xs" />
          <span className="text-[10px] font-semibold text-[#FBEFD5]/80">{deck}</span>
        </div>
      </div>
    </div>
  );
}

// ---- The dock: dice, resource cards, development cards ------------------------------------

export function ResourceHand({ view, picked, onPick }: { view: TableView; picked: Partial<Record<Res, boolean>>; onPick: (r: Res) => void }) {
  const [bump, setBump] = useState<Partial<Record<Res, number>>>({});
  const last = useRef(view.hand);
  useEffect(() => {
    const up: Partial<Record<Res, number>> = {};
    for (const r of HAND_ORDER) if (view.hand[r] > last.current[r]) up[r] = Date.now();
    last.current = view.hand;
    if (Object.keys(up).length) setBump((b) => ({ ...b, ...up }));
  }, [view.hand]);
  const total = HAND_ORDER.reduce((n, r) => n + view.hand[r], 0);
  return (
    <div className={cn('pointer-events-auto flex flex-col rounded-[16px] px-3 pb-2.5 pt-1.5', WOOD)}>
      <div className="mb-1 flex items-center justify-between">
        <span className={CAPTION}>Your cards</span>
        <span className={cn('text-[11px]', total > 7 ? 'font-bold text-[#FF9B7A]' : 'text-[#FBEFD5]/60')} title={total > 7 ? 'Over 7: on a 7 you give back half' : undefined}>
          {total} in hand
        </span>
      </div>
      <div className="flex items-end gap-3">
        {HAND_ORDER.map((r) => {
          const n = view.hand[r];
          return (
            <div key={`${r}${bump[r] ?? ''}`} data-anchor={`hand-${r}`} className={cn('relative isolate', bump[r] && 'animate-[isle-pop_0.5s_ease-out]')}>
              {/* The stack behind: deeper the more of them there are. */}
              {Array.from({ length: Math.min(3, Math.max(0, n - 1)) }, (_, i) => (
                <span
                  key={i}
                  className="absolute h-[114px] w-[76px] rounded-[9px] bg-gradient-to-b from-[#F1DDAE] to-[#C9A66B] shadow-[0_4px_8px_-4px_rgba(0,0,0,0.6)]"
                  style={{ left: (i + 1) * 3, top: -(i + 1) * 3, zIndex: -1 - i, transform: `rotate(${(i + 1) * 2}deg)` }}
                />
              ))}
              <ResCard
                r={r}
                n={n}
                dim={!n}
                picked={!!picked[r] && n > 0}
                onClick={n ? () => onPick(r) : undefined}
                title={`${RES_INFO[r].label}: ${n}${n ? ' (select to trade)' : ''}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DevelopmentCardHand({ view, onOpen }: { view: TableView; onOpen: (card: Dev) => void }) {
  return (
    <div className={cn('pointer-events-auto flex flex-col rounded-[16px] px-3 pb-2.5 pt-1.5', WOOD)} data-anchor="dev-hand">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className={CAPTION}>Development</span>
        <span className="text-[11px] text-[#FBEFD5]/60">{view.dev.reduce((n, d) => n + d.ready + d.fresh, 0)} held</span>
      </div>
      <div className="flex items-end gap-2.5">
        {view.dev.length ? (
          view.dev.map((d) => (
            <div key={d.card} className="relative">
              <DevCard
                d={d.card}
                size="md"
                n={d.ready + d.fresh}
                glow={d.playable}
                onClick={() => onOpen(d.card)}
                title={`${DEV_INFO[d.card].label}${d.why ? `: ${d.why}` : ': ready to play'}`}
              />
              {d.fresh && !d.ready ? (
                <span className="pointer-events-none absolute inset-x-0 -bottom-1 mx-auto w-fit rounded-full bg-[#2E1C0E] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-[#F6CF62]">
                  New
                </span>
              ) : null}
            </div>
          ))
        ) : (
          <span className="flex h-[114px] w-[150px] items-center justify-center rounded-[9px] border border-dashed border-[#F1DDAE]/30 px-3 text-center font-serif text-[12px] italic text-[#FBEFD5]/55">
            Buy one for wool, grain and ore
          </span>
        )}
      </div>
    </div>
  );
}

/** Where the pips sit on a die's face, on a 3×3 grid. */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ v, rolling, delay }: { v: number; rolling: boolean; delay: number }) {
  return (
    <span
      className={cn(
        'grid h-[46px] w-[46px] grid-cols-3 grid-rows-3 gap-[2px] rounded-[10px] bg-gradient-to-br from-[#FFFDF6] via-[#F6EEDB] to-[#D9CBB0] p-[7px] shadow-[0_6px_10px_-4px_rgba(0,0,0,0.7),inset_0_-2px_3px_rgba(0,0,0,0.15),inset_0_2px_2px_rgba(255,255,255,0.9)]',
        rolling && 'animate-[isle-tumble_1.1s_cubic-bezier(.2,.7,.3,1)_both]',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[v]!.includes(i) ? <span className={cn('h-[8px] w-[8px] rounded-full', v === 1 ? 'bg-[#B5281F]' : 'bg-[#2B2522]')} /> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * The dice and the turn's two big buttons. A new roll tumbles in for about a
 * second, faces flickering, then lands on what the game rolled (the board
 * lights the lands that pay at the same moment).
 */
export function DiceController({ state, view, onRoll, onEnd }: { state: IsleState; view: TableView; onRoll: () => void; onEnd: () => void }) {
  const roll = lastRoll(state);
  const seen = useRef(roll?.key ?? null);
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState<[number, number]>(roll?.d ?? [3, 4]);
  const key = roll?.key ?? null;
  const landOn = useRef(roll?.d);
  landOn.current = roll?.d;
  useEffect(() => {
    if (key == null || key === seen.current) return;
    seen.current = key;
    setRolling(true);
    let k = 0;
    const flick = setInterval(() => setFaces([1 + ((k * 5 + 2) % 6), 1 + ((k++ * 3 + 4) % 6)]), 90);
    const done = setTimeout(() => {
      clearInterval(flick);
      if (landOn.current) setFaces(landOn.current);
      setRolling(false);
    }, 1100);
    return () => {
      clearInterval(flick);
      clearTimeout(done);
      // Cut short (a newer roll, or leaving): land at once.
      if (landOn.current) setFaces(landOn.current);
      setRolling(false);
    };
  }, [key]);
  const total = state.dice ? state.dice[0] + state.dice[1] : null;
  return (
    <div className={cn('pointer-events-auto flex items-center gap-3 rounded-[16px] px-3 py-2.5', WOOD)}>
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex gap-2 rounded-[12px] bg-[#1E120A]/60 p-2 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]" data-anchor="dice">
          <Die v={faces[0]} rolling={rolling} delay={0} />
          <Die v={faces[1]} rolling={rolling} delay={60} />
        </div>
        <span className={cn('h-4 font-serif text-[13px] font-bold', total === 7 && !rolling ? 'text-[#FF8A70]' : 'text-[#F6CF62]')}>
          {rolling ? 'Rolling…' : total ? (total === 7 ? '7: the robber!' : `Rolled ${total}`) : state.phase === 'roll' ? 'Not rolled yet' : ''}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRoll}
          disabled={!view.canRoll}
          className={cn(
            'flex h-[46px] w-[132px] items-center justify-center gap-2 rounded-[12px] border-2 font-serif text-[16px] font-bold transition active:scale-95',
            view.canRoll
              ? 'animate-[isle-glow_1.6s_ease-in-out_infinite] border-[#FFF3CF] bg-gradient-to-b from-[#FCE39A] to-[#C88E1E] text-[#3B2A1E]'
              : 'cursor-not-allowed border-[#2A180B] bg-black/25 text-[#FBEFD5]/40',
          )}
        >
          <Dice5 size={20} /> Roll dice
        </button>
        <button
          type="button"
          onClick={onEnd}
          disabled={!view.canEnd}
          className={cn(
            'flex h-[40px] w-[132px] items-center justify-center gap-2 rounded-[12px] border-2 font-serif text-[14px] font-bold transition active:scale-95',
            view.canEnd
              ? 'border-[#D8F0C8] bg-gradient-to-b from-[#7DBB6B] to-[#3F7A34] text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.7)]'
              : 'cursor-not-allowed border-[#2A180B] bg-black/25 text-[#FBEFD5]/40',
          )}
        >
          <Hourglass size={16} /> End turn
        </button>
      </div>
    </div>
  );
}

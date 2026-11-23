'use client';

/**
 * The panels that open over the board when the game asks something of me:
 * giving back cards on a 7, choosing who to rob, the end of the game. And
 * the log of what's happened.
 */
import { logLines, RES_INFO, type Hand, type IsleState, type TableView } from '@us/shared/isle';
import { Crown, Layers, Plus, Trophy, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Avatar, GoldButton, handCount, Panel, PlainButton, ResCard, WOOD } from './kit';
import { HAND_ORDER } from './table-parts';

export function DiscardPanel({ hand, owed, onDone }: { hand: Hand; owed: number; onDone: (cards: Partial<Hand>) => void }) {
  const [pick, setPick] = useState<Partial<Hand>>({});
  const n = handCount(pick);
  return (
    <Panel title="A 7 was rolled" width={540}>
      <p className="mb-4 text-[14px]">
        You hold more than 7 cards, so half go back to the bank. Choose <b>{owed}</b> ({n} of {owed} chosen).
      </p>
      <div className="flex justify-center gap-3">
        {HAND_ORDER.map((r) => {
          const k = pick[r] ?? 0;
          return (
            <div key={r} className="flex flex-col items-center gap-1.5">
              <ResCard r={r} n={hand[r] - k} dim={!hand[r]} onClick={hand[r] > k && n < owed ? () => setPick({ ...pick, [r]: k + 1 }) : undefined} title={`Give back a ${RES_INFO[r].label.toLowerCase()}`} />
              <button
                type="button"
                disabled={!k}
                onClick={() => setPick({ ...pick, [r]: k - 1 })}
                className={cn('rounded-full px-2 py-0.5 text-[12px] font-bold', k ? 'bg-[#A8432D] text-white' : 'text-black/30')}
              >
                {k ? `−${k}` : '0'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex justify-between">
        <PlainButton onClick={() => setPick({})} disabled={!n}>
          Clear
        </PlainButton>
        <GoldButton disabled={n !== owed} onClick={() => onDone(pick)}>
          Give back {owed}
        </GoldButton>
      </div>
    </Panel>
  );
}

/** The robber's new land is picked: confirm it, choosing who to take a card from when there's anyone. */
export function StealPanel({ view, from, onPick, onCancel }: { view: TableView; from: number[]; onPick: (p: number | null) => void; onCancel: () => void }) {
  return (
    <div className={cn('pointer-events-auto rounded-[14px] p-3 text-[#3B2A1E] animate-[isle-rise-in_0.2s_ease-out]', 'bg-[radial-gradient(ellipse_at_center,#FFF7E2_0%,#F6E6C0_70%,#E6CE98_100%)] border-[3px] border-[#8A6420] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.7)]')}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-serif text-[16px] font-bold">{from.length ? 'Take a card from…' : 'Move the robber here?'}</span>
        <button type="button" onClick={onCancel} aria-label="Pick another land" className="rounded-full p-1 hover:bg-black/5">
          <X size={16} />
        </button>
      </div>
      <p className="mb-2 text-[12px] text-black/60">{from.length ? 'One card at random from their hand. Or tap another glowing land.' : 'Nobody with cards stands by this land. Or tap another glowing land.'}</p>
      <div className="flex flex-col gap-1.5">
        {from.length ? (
          from.map((p) => {
            const s = view.seats[p]!;
            return (
              <button key={p} type="button" onClick={() => onPick(p)} className="flex items-center gap-2.5 rounded-[10px] bg-white/60 p-2 text-left transition hover:bg-white hover:shadow">
                <Avatar s={s} size={26} />
                <span className="flex-1 font-serif text-[14px] font-bold">{s.name}</span>
                <span className="flex items-center gap-1 text-[12px]">
                  <Layers size={13} /> {s.cards}
                </span>
              </button>
            );
          })
        ) : (
          <GoldButton onClick={() => onPick(null)}>Move the robber</GoldButton>
        )}
      </div>
    </div>
  );
}

export function Results({ state, view, onNewGame, onExit }: { state: IsleState; view: TableView; onNewGame?: () => void; onExit?: () => void }) {
  const order = [...view.seats].sort((a, b) => b.points - a.points);
  const won = view.winner === view.me;
  const rolls = state.rolls.slice(2);
  const most = Math.max(1, ...rolls);
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#F6CF62] to-[#C88E1E] text-[#3B2A1E] shadow">{won ? <Trophy size={24} /> : <Crown size={24} />}</span>
          <span>
            {won ? 'You won the island!' : `${view.seats[view.winner!]!.name} won`}
            <span className="block text-[13px] font-normal text-black/55">After {Math.ceil(state.turnNo / 4)} rounds · hidden points shown</span>
          </span>
        </span>
      }
      width={660}
      z="z-40"
    >
      <div className="grid grid-cols-[1fr_200px] gap-5">
        <div className="flex flex-col gap-2">
          {order.map((s, i) => {
            const vp = [...state.players[s.seat]!.dev, ...state.players[s.seat]!.fresh].filter((d) => d === 'vp').length;
            return (
              <div key={s.seat} className={cn('flex items-center gap-3 rounded-[12px] p-2.5', i === 0 ? 'bg-[#F6CF62]/50' : 'bg-white/50')}>
                <span className="w-5 text-center font-serif text-[18px] font-bold">{i + 1}</span>
                <Avatar s={s} size={28} />
                <span className="flex-1 font-serif text-[15px] font-bold">{s.name}</span>
                {vp ? <span className="text-[11px] text-black/55">{vp} hidden</span> : null}
                <span className="text-[12px] text-black/50">{state.players[s.seat]!.got} cards</span>
                <span className="w-10 text-right font-serif text-[20px] font-bold">{s.points}</span>
              </div>
            );
          })}
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
        {onExit ? <PlainButton onClick={onExit}>Leave</PlainButton> : null}
        {onNewGame ? (
          <GoldButton onClick={onNewGame}>
            <Plus size={16} /> Play again
          </GoldButton>
        ) : null}
      </div>
    </Panel>
  );
}

export function Log({ state, me, colors, onClose }: { state: IsleState; me: number; colors: string[]; onClose: () => void }) {
  const lines = logLines(state, me).slice(-18);
  return (
    <div className={cn('absolute left-3 top-[72px] z-20 w-[300px] rounded-[14px] p-3 text-[#FBEFD5] animate-[isle-rise-in_0.2s_ease-out]', WOOD)}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-serif text-[11px] font-bold uppercase tracking-[0.16em] text-[#E8B84A]/85">Game log</span>
        <button type="button" onClick={onClose} aria-label="Close the log" className="rounded-full p-1 hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-1 overflow-auto">
        {lines.map((l) => (
          <div key={l.n} className="flex items-start gap-2 text-[13px] leading-snug">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: l.p != null ? colors[l.p] : '#E8B84A' }} />
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

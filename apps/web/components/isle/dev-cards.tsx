'use client';

/**
 * Development cards up close: a card from my hand shown large with what it
 * does and whether it can be played now (and why not), and the choosers
 * that Year of Plenty and Monopoly need.
 */
import { DEV_INFO, RES_INFO, type Dev, type Res, type TableView } from '@us/shared/isle';
import { Check, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { CostChips, DevCard, GoldButton, Panel, PlainButton, ResCard, WOOD } from './kit';
import { HAND_ORDER } from './table-parts';

/** A development card from my hand, large, with its Play button. */
export function DevCardDialog({ card, view, onPlay, onClose }: { card: Dev; view: TableView; onPlay: () => void; onClose: () => void }) {
  const d = view.dev.find((x) => x.card === card);
  const n = d ? d.ready + d.fresh : 0;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#140C05]/70 p-4 backdrop-blur-[2px] animate-[isle-fade_0.2s_ease-out]" onClick={onClose}>
      <div className="flex items-center gap-8 animate-[isle-rise-in_0.3s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <DevCard d={card} size="lg" glow={d?.playable} />
        <div className={cn('w-[340px] rounded-[16px] p-5 text-[#FBEFD5]', WOOD)}>
          <div className="font-serif text-[30px] font-bold leading-tight">{DEV_INFO[card].label}</div>
          <div className="mt-1 text-[13px] text-[#FBEFD5]/60">
            You hold {n}
            {d?.fresh ? ` (${d.fresh} new this turn)` : ''}
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-[#FBEFD5]/90">{DEV_INFO[card].text}</p>
          {card === 'knight' ? <p className="mt-2 text-[13px] text-[#F6CF62]/90">Knights played: {view.seats[view.me]!.knights}. Three or more, and the most, hold the largest army (+2 points).</p> : null}
          <div className={cn('mt-4 rounded-[10px] px-3 py-2 text-[13px] font-semibold', d?.playable ? 'bg-[#3F7A34]/40 text-[#D8F0C8]' : 'bg-black/35 text-[#FFB59E]')}>
            {d?.playable ? 'Ready to play' : (d?.why ?? 'Not in your hand')}
          </div>
          <div className="mt-5 flex gap-2">
            <PlainButton onClick={onClose} className="border-[#F1DDAE]/50 text-[#FBEFD5] hover:bg-white/10">
              <X size={15} /> Close
            </PlainButton>
            {card !== 'vp' ? (
              <GoldButton onClick={onPlay} disabled={!d?.playable}>
                <Sparkles size={16} /> Play card
              </GoldButton>
            ) : null}
          </div>
          <div className="mt-6 flex items-center gap-2 text-[11px] text-[#FBEFD5]/55">
            Cards are bought for <CostChips cost={{ wool: 1, grain: 1, ore: 1 }} /> and can’t be traded. One a turn, never the turn it’s bought.
          </div>
        </div>
      </div>
    </div>
  );
}

/** Year of Plenty (two cards, the same twice allowed) or Monopoly (one kind). */
export function ResourceChooser({ card, count, onDone, onCancel }: { card: 'plenty' | 'monopoly'; count: number; onDone: (r: Res[]) => void; onCancel: () => void }) {
  const [pick, setPick] = useState<Res[]>([]);
  const add = (r: Res) => setPick((p) => (count === 1 ? [r] : p.length >= count ? [...p.slice(1), r] : [...p, r]));
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          <DevCard d={card} size="sm" />
          {DEV_INFO[card].label}
        </span>
      }
      onClose={onCancel}
      width={560}
    >
      <p className="mb-4 text-[14px]">{card === 'plenty' ? 'Choose two cards from the bank: the same kind twice, or two kinds.' : 'Name a kind. Every other player hands you all of theirs.'}</p>
      <div className="flex justify-center gap-3">
        {HAND_ORDER.map((r) => (
          <ResCard key={r} r={r} n={pick.filter((x) => x === r).length} picked={pick.includes(r)} onClick={() => add(r)} />
        ))}
      </div>
      {count > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className="flex h-[72px] w-[48px] items-center justify-center rounded-[6px] border-2 border-dashed border-[#8A6420]/40">
              {pick[i] ? <ResCard r={pick[i]!} size="sm" /> : <span className="text-[11px] text-black/35">{i + 1}</span>}
            </span>
          ))}
          {pick.length ? (
            <button type="button" onClick={() => setPick([])} className="text-[12px] font-semibold text-[#8A5E36] underline">
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <PlainButton onClick={onCancel}>Cancel</PlainButton>
        <GoldButton disabled={pick.length !== count} onClick={() => onDone(pick)}>
          <Check size={16} />
          {card === 'plenty' ? (pick.length === count ? `Take ${pick.map((r) => RES_INFO[r].label.toLowerCase()).join(' and ')}` : 'Take two') : pick[0] ? `Collect all ${RES_INFO[pick[0]].label.toLowerCase()}` : 'Collect'}
        </GoldButton>
      </div>
    </Panel>
  );
}

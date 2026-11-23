'use client';

/**
 * Trading at Isle's table. Two kinds, on two tabs of one panel:
 *
 * - With the players: what I give on the left, what I want on the right, an
 *   exchange arrow between, then the offer goes round the table. Everyone
 *   else accepts, rejects or counters; I take whichever yes or counter I
 *   like. Only the player whose turn it is offers; the others answer.
 * - With the bank: 4 of a kind for 1 of anything, 3 with a harbour that
 *   takes any, 2 with a harbour for that kind. The best rate is worked out.
 *
 * Every move here goes through the game's rules (rules.ts), so nothing is
 * swapped that the rules wouldn't allow.
 */
import { RES_INFO, type Counter, type Hand, type IsleAction, type IsleState, type PortKind, type Res, type TableView } from '@us/shared/isle';
import { ArrowLeftRight, ArrowRight, Check, Landmark, Minus, Plus, RotateCcw, Users, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Avatar, Dots, GoldButton, handCount, Panel, PlainButton, ResCard, WOOD } from './kit';
import { HAND_ORDER } from './table-parts';

export type TradeTab = 'players' | 'bank';

const text = (h: Partial<Hand>) =>
  HAND_ORDER.filter((r) => h[r])
    .map((r) => `${h[r]} ${RES_INFO[r].label}`)
    .join(', ');

/** Picks a few cards of each kind with − and +. */
function Picker({ value, onChange, max, side }: { value: Partial<Hand>; onChange: (h: Partial<Hand>) => void; max?: Hand; side: 'give' | 'get' }) {
  return (
    <div className="flex justify-center gap-2">
      {HAND_ORDER.map((r) => {
        const n = value[r] ?? 0;
        const top = max ? max[r] : 19;
        return (
          <div key={r} className="flex flex-col items-center gap-1">
            <ResCard r={r} size="sm" n={n} picked={n > 0} dim={max ? !max[r] : false} onClick={n < top ? () => onChange({ ...value, [r]: n + 1 }) : undefined} title={`${side === 'give' ? 'Give' : 'Ask for'} ${RES_INFO[r].label.toLowerCase()}${max ? ` (you have ${max[r]})` : ''}`} />
            <div className="flex items-center gap-0.5">
              <Step label={`One less ${RES_INFO[r].label}`} disabled={!n} onClick={() => onChange({ ...value, [r]: n - 1 })}>
                <Minus size={12} />
              </Step>
              <Step label={`One more ${RES_INFO[r].label}`} disabled={n >= top} onClick={() => onChange({ ...value, [r]: n + 1 })}>
                <Plus size={12} />
              </Step>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Step({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="rounded-full bg-[#8A5E36]/15 p-1 text-[#5A3A22] transition hover:bg-[#8A5E36]/30 disabled:opacity-25">
      {children}
    </button>
  );
}

/** A row of the cards a hand holds, small. */
export function CardRow({ h, empty = 'nothing' }: { h: Partial<Hand>; empty?: string }) {
  const kinds = HAND_ORDER.filter((r) => h[r]);
  if (!kinds.length) return <span className="font-serif text-[13px] italic text-black/40">{empty}</span>;
  return (
    <div className="flex gap-1.5">
      {kinds.map((r) => (
        <ResCard key={r} r={r} n={h[r]} size="sm" />
      ))}
    </div>
  );
}

/** Two sides and the arrow between: what one side gives, what it gets. */
function Exchange({ left, right, leftLabel, rightLabel }: { left: Partial<Hand>; right: Partial<Hand>; leftLabel: string; rightLabel: string }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-black/45">{leftLabel}</span>
        <CardRow h={left} />
      </div>
      <ArrowLeftRight size={20} className="mt-4 shrink-0 text-[#8A5E36]" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-black/45">{rightLabel}</span>
        <CardRow h={right} />
      </div>
    </div>
  );
}

export function TradePanel({
  state,
  view,
  tab: firstTab,
  start,
  counterTo,
  onMove,
  onClose,
}: {
  state: IsleState;
  view: TableView;
  tab: TradeTab;
  /** Cards picked in the hand before opening: they start on my side. */
  start?: Partial<Hand>;
  /** Countering someone's offer: their offer, to start from turned round. */
  counterTo?: { from: number; give: Partial<Hand>; want: Partial<Hand> };
  onMove: (a: IsleAction) => boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TradeTab>(counterTo ? 'players' : firstTab);
  if (view.outgoing) return <Outgoing view={view} onMove={onMove} />;
  return (
    <Panel
      title={counterTo ? `Counter ${state.players[counterTo.from]!.name}’s offer` : 'Trade'}
      onClose={onClose}
      width={720}
    >
      {counterTo ? null : (
        <div className="mb-4 flex gap-1 rounded-[12px] bg-[#8A5E36]/12 p-1">
          <TabButton on={tab === 'players'} onClick={() => setTab('players')} icon={<Users size={16} />}>
            With players
          </TabButton>
          <TabButton on={tab === 'bank'} onClick={() => setTab('bank')} icon={<Landmark size={16} />}>
            With the bank
          </TabButton>
        </div>
      )}
      {tab === 'players' ? (
        <PlayersTrade view={view} start={start} counterTo={counterTo} onMove={onMove} onClose={onClose} />
      ) : (
        <BankTradePanel state={state} view={view} start={start} onMove={onMove} />
      )}
    </Panel>
  );
}

function TabButton({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-[9px] py-2 font-serif text-[15px] font-bold transition',
        on ? 'bg-gradient-to-b from-[#F6CF62] to-[#D9A846] text-[#3B2A1E] shadow' : 'text-[#5A3A22] hover:bg-white/40',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function PlayersTrade({
  view,
  start,
  counterTo,
  onMove,
  onClose,
}: {
  view: TableView;
  start?: Partial<Hand>;
  counterTo?: { from: number; give: Partial<Hand>; want: Partial<Hand> };
  onMove: (a: IsleAction) => boolean;
  onClose: () => void;
}) {
  // A counter starts from their offer turned round: what they wanted, I give.
  const [give, setGive] = useState<Partial<Hand>>(() => (counterTo ? fit(counterTo.want, view.hand) : (start ?? {})));
  const [want, setWant] = useState<Partial<Hand>>(() => (counterTo ? { ...counterTo.give } : {}));
  const g = handCount(give);
  const w = handCount(want);
  const same = HAND_ORDER.find((r) => give[r] && want[r]);
  const why = !g ? 'Pick what you give' : !w ? 'Pick what you want' : same ? `Can’t give and ask for ${RES_INFO[same].label.toLowerCase()}` : null;
  const send = () => {
    if (why) return;
    const ok = onMove(counterTo ? { t: 'counter', give, want } : { t: 'offer', give, want });
    if (ok && counterTo) onClose();
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <Side title="You give" sub={`${g} card${g === 1 ? '' : 's'} from your hand`}>
          <Picker value={give} onChange={setGive} max={view.hand} side="give" />
        </Side>
        <div className="flex h-full flex-col items-center justify-center pt-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#FFF3CF] bg-gradient-to-b from-[#F6CF62] to-[#C88E1E] text-[#3B2A1E] shadow-md">
            <ArrowLeftRight size={20} />
          </span>
        </div>
        <Side title="You receive" sub={`${w} card${w === 1 ? '' : 's'} in return`}>
          <Picker value={want} onChange={setWant} side="get" />
        </Side>
      </div>

      <div className={cn('rounded-[12px] border border-[#8A6420]/30 bg-white/40 px-4 py-2.5 text-center font-serif text-[14px]', !why && 'border-[#8A6420]/60 bg-white/60')}>
        {why ?? (
          <>
            You give <b>{text(give)}</b> <ArrowRight size={14} className="mx-1 inline" /> you receive <b>{text(want)}</b>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <PlainButton
          onClick={() => {
            setGive({});
            setWant({});
          }}
          disabled={!g && !w}
        >
          <RotateCcw size={15} /> Clear offer
        </PlainButton>
        <div className="flex gap-2">
          <PlainButton onClick={onClose}>Cancel</PlainButton>
          <GoldButton onClick={send} disabled={!!why}>
            <ArrowLeftRight size={16} /> {counterTo ? 'Send counter-offer' : 'Propose trade'}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}

/** As much of a wanted set as a hand holds. */
const fit = (want: Partial<Hand>, hand: Hand): Partial<Hand> => Object.fromEntries(HAND_ORDER.flatMap((r) => (want[r] ? [[r, Math.min(want[r]!, hand[r])]] : [])));

function Side({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-[#8A5E36]/8 p-3 ring-1 ring-[#8A6420]/20">
      <div className="text-center">
        <div className="font-serif text-[16px] font-bold">{title}</div>
        <div className="text-[11px] text-black/50">{sub}</div>
      </div>
      {children}
    </div>
  );
}

/** My offer, out on the table: each player's answer as it comes in. */
function Outgoing({ view, onMove }: { view: TableView; onMove: (a: IsleAction) => boolean }) {
  const out = view.outgoing!;
  const waiting = view.seats.filter((s) => !s.you && out.replies[s.seat] === null).length;
  return (
    <Panel title="Your offer" width={560}>
      <Exchange left={out.give} right={out.want} leftLabel="You give" rightLabel="You receive" />
      <div className="mt-4 flex flex-col gap-2">
        {view.seats
          .filter((s) => !s.you)
          .map((s) => {
            const r = out.replies[s.seat];
            const c: Counter | null = out.counters[s.seat] ?? null;
            const canTake = c ? HAND_ORDER.every((k) => view.hand[k] >= (c.want[k] ?? 0)) : true;
            return (
              <div key={s.seat} className={cn('flex items-center gap-3 rounded-[12px] p-2.5', r === true ? 'bg-[#DFF0C8]/80' : c ? 'bg-[#FCEFC6]' : 'bg-white/55')}>
                <Avatar s={s} size={30} />
                <span className="w-24 truncate font-serif text-[15px] font-bold">{s.name}</span>
                <div className="flex flex-1 items-center justify-end gap-2">
                  {r === null ? (
                    <span className="flex items-center gap-1 text-[13px] text-black/50">
                      thinking <Dots />
                    </span>
                  ) : r ? (
                    <>
                      <span className="text-[13px] font-semibold text-[#3F7A34]">Accepted</span>
                      <GoldButton onClick={() => onMove({ t: 'accept', with: s.seat })} className="px-3 py-1.5 text-[14px]">
                        <Check size={15} /> Trade
                      </GoldButton>
                    </>
                  ) : c ? (
                    <>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A5E36]">Counter-offer</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-black/50">you give</span>
                          <CardRow h={c.want} />
                          <ArrowLeftRight size={14} className="text-[#8A5E36]" />
                          <span className="text-[10px] text-black/50">get</span>
                          <CardRow h={c.give} />
                        </span>
                      </div>
                      <GoldButton onClick={() => onMove({ t: 'accept', with: s.seat })} disabled={!canTake} className="px-3 py-1.5 text-[14px]" title={canTake ? undefined : 'You don’t have those cards'}>
                        <Check size={15} /> Accept
                      </GoldButton>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-[#A8432D]">
                      <X size={14} /> Rejected
                    </span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[12px] text-black/50">{waiting ? `Waiting on ${waiting}` : 'Everyone has answered'}</span>
        <PlainButton onClick={() => onMove({ t: 'cancel' })}>Withdraw offer</PlainButton>
      </div>
    </Panel>
  );
}

const HARBOUR_TEXT = (k: PortKind) => (k === 'any' ? '3:1 any card' : `2:1 ${RES_INFO[k].label}`);

/**
 * Trading with the bank: pick a kind to give (at its best rate), a kind to
 * get, and the swap is shown before it's made.
 */
export function BankTradePanel({ state, view, start, onMove }: { state: IsleState; view: TableView; start?: Partial<Hand>; onMove: (a: IsleAction) => boolean }) {
  const first = HAND_ORDER.find((r) => start?.[r]) ?? HAND_ORDER.find((r) => view.hand[r] >= view.rates[r]) ?? null;
  const [give, setGive] = useState<Res | null>(first);
  const [get, setGet] = useState<Res | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const rate = give ? view.rates[give] : 4;
  const why = !give
    ? 'Pick a kind to give'
    : view.hand[give] < rate
      ? `Need ${rate - view.hand[give]} more ${RES_INFO[give].label.toLowerCase()}`
      : !get
        ? 'Pick a card to receive'
        : get === give
          ? 'Pick a different card to receive'
          : state.bank[get] < 1
            ? `The bank has no ${RES_INFO[get].label.toLowerCase()} left`
            : null;
  const harbours = [...new Set(view.harbours)];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-semibold text-black/55">Your harbours:</span>
        {harbours.length ? (
          harbours.map((k) => (
            <span key={k} className="flex items-center gap-1 rounded-full bg-[#2E68CF]/12 px-2.5 py-1 font-semibold text-[#1F4E9E]">
              ⚓ {HARBOUR_TEXT(k)}
            </span>
          ))
        ) : (
          <span className="text-black/50">none yet: the bank takes 4 of a kind. Build a town on a harbour for better rates.</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <Side title="You give" sub="the best rate for each kind">
          <div className="flex justify-center gap-2">
            {HAND_ORDER.map((r) => (
              <div key={r} className="flex flex-col items-center gap-1">
                <ResCard r={r} size="sm" n={view.hand[r]} picked={give === r} dim={view.hand[r] < view.rates[r]} onClick={() => setGive(r)} title={`${RES_INFO[r].label}: ${view.rates[r]} for 1 (you have ${view.hand[r]})`} />
                <span className={cn('rounded-full px-1.5 text-[11px] font-bold', view.rates[r] < 4 ? 'bg-[#2E68CF]/15 text-[#1F4E9E]' : 'text-black/50')}>{view.rates[r]}:1</span>
              </div>
            ))}
          </div>
        </Side>
        <div className="flex h-full flex-col items-center justify-center pt-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#FFF3CF] bg-gradient-to-b from-[#F6CF62] to-[#C88E1E] text-[#3B2A1E] shadow-md">
            <ArrowRight size={20} />
          </span>
        </div>
        <Side title="You receive" sub="one card from the bank">
          <div className="flex justify-center gap-2">
            {HAND_ORDER.map((r) => (
              <div key={r} className="flex flex-col items-center gap-1">
                <ResCard r={r} size="sm" picked={get === r} dim={r === give || !state.bank[r]} onClick={() => setGet(r)} title={`${RES_INFO[r].label} (${state.bank[r]} in the bank)`} />
                <span className="text-[11px] text-black/45">{state.bank[r]} left</span>
              </div>
            ))}
          </div>
        </Side>
      </div>

      <div className="flex items-center justify-center gap-3 rounded-[12px] border border-[#8A6420]/40 bg-white/55 px-4 py-3">
        {give && get && !why ? (
          <>
            <span className="font-serif text-[15px]">Give</span>
            <ResCard r={give} size="sm" n={rate} />
            <ArrowRight size={18} className="text-[#8A5E36]" />
            <span className="font-serif text-[15px]">Receive</span>
            <ResCard r={get} size="sm" n={1} />
            <span className="ml-2 rounded-full bg-[#8A5E36]/12 px-2 py-0.5 text-[12px] font-bold">{rate}:1</span>
          </>
        ) : (
          <span className="font-serif text-[14px] text-black/55">{why}</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="h-5 text-[13px] font-semibold text-[#3F7A34]">{done}</span>
        <GoldButton
          disabled={!!why}
          onClick={() => {
            if (!give || !get || why) return;
            if (onMove({ t: 'bank', give, get })) setDone(`Traded ${rate} ${RES_INFO[give].label.toLowerCase()} for 1 ${RES_INFO[get].label.toLowerCase()}`);
          }}
        >
          <Landmark size={16} /> Confirm trade
        </GoldButton>
      </div>
    </div>
  );
}

/**
 * Someone's offer, waiting on my answer: who it's from, what I'd get and
 * give, and accept, reject or counter. It sits above the board, not over it.
 */
export function IncomingOffer({ state, view, onAnswer, onCounter }: { state: IsleState; view: TableView; onAnswer: (yes: boolean) => void; onCounter: () => void }) {
  const o = view.incoming!;
  const from = view.seats[o.from]!;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[76px] z-20 flex justify-center">
      <div className={cn('pointer-events-auto w-[440px] animate-[isle-rise-in_0.25s_ease-out] rounded-[16px] p-4', 'bg-[radial-gradient(ellipse_at_center,#FFF7E2_0%,#F6E6C0_60%,#E6CE98_100%)] border-[3px] border-[#8A6420] text-[#3B2A1E] shadow-[0_22px_48px_-16px_rgba(0,0,0,0.7),inset_0_0_0_2px_#F6DE9C]')}>
        <div className="mb-3 flex items-center gap-2">
          <Avatar s={from} size={28} />
          <span className="font-serif text-[16px] font-bold">{state.players[o.from]!.name} offers a trade</span>
        </div>
        <Exchange left={o.give} right={o.want} leftLabel="You receive" rightLabel="You give" />
        {!o.canAccept ? <p className="mt-2 text-center text-[12px] font-semibold text-[#A8432D]">You don’t have the cards they ask for: reject or counter.</p> : null}
        <div className="mt-3 flex justify-center gap-2">
          <PlainButton onClick={() => onAnswer(false)}>
            <X size={15} /> Reject
          </PlainButton>
          <PlainButton onClick={onCounter}>
            <ArrowLeftRight size={15} /> Counter
          </PlainButton>
          <GoldButton disabled={!o.canAccept} onClick={() => onAnswer(true)}>
            <Check size={16} /> Accept
          </GoldButton>
        </div>
      </div>
    </div>
  );
}

/** After I've answered someone's offer: what I said, while they wait for the rest. */
export function AnsweredOffer({ view }: { view: TableView }) {
  const a = view.answered!;
  const from = view.seats[a.from]!;
  return (
    <div className={cn('absolute left-1/2 top-[76px] z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[13px] text-[#FBEFD5]', WOOD)}>
      <Avatar s={from} size={22} />
      {a.counter ? (
        <>
          You countered {from.name}: give <b>{text(a.counter.give)}</b> for <b>{text(a.counter.want)}</b>
        </>
      ) : a.yes ? (
        <>You accepted {from.name}’s offer</>
      ) : (
        <>You rejected {from.name}’s offer</>
      )}
      <span className="text-[#FBEFD5]/60">· waiting</span>
      <Dots />
    </div>
  );
}
